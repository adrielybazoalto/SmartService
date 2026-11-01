/**
 * CU14 — Gestionar Proveedores y Catálogo de Mayoristas · Servicio (control)
 *
 * Lógica de negocio del CU14. Cada función recibe `db` (cliente de Supabase
 * con service_role) como primer parámetro.
 * Tablas: proveedor, producto_proveedor, producto, bitacora (columna `ip`).
 *
 * Alcance: registrar / modificar / activar-desactivar proveedores (NIT único
 * con letras, números y guiones) y administrar su catálogo: productos del
 * inventario con su código de ítem y precio de compra. Sin facturación.
 *
 * El catálogo se identifica por (proveedor_id, producto_id), que es la clave
 * del DDL; así funciona tenga o no la tabla una columna `id`.
 */
import { validarItemCatalogo, validarProveedor } from './schema';
import { obtenerIpOrigen } from '@/lib/ip';
import {
  ProveedorError,
  type AccionProveedor,
  type ComparativoPrecios,
  type OfertaProveedor,
  type Auditoria,
  type Db,
  type ItemCatalogo,
  type ItemCatalogoDTO,
  type ProductoInventario,
  type Proveedor,
  type ProveedorDTO,
} from './types';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ===========================================================================
// Utilidades de base de datos
// ===========================================================================

/** Traduce errores de PostgreSQL a mensajes de negocio */
function errorBD(error: any, porDefecto: string): ProveedorError {
  const msg: string = `${error?.message ?? ''} ${error?.details ?? ''}`;
  if (error?.code === '23505' || /duplicate key/i.test(msg)) {
    if (/nit/i.test(msg)) return new ProveedorError('Ya existe un proveedor con ese NIT');
    if (/codigo/i.test(msg)) return new ProveedorError('Ese código de ítem ya está registrado para este proveedor');
    return new ProveedorError('Ese producto ya está en el catálogo de este proveedor');
  }
  if (error?.code === '23514' || /check constraint/i.test(msg)) {
    if (/nit/i.test(msg)) return new ProveedorError('NIT inválido: use solo letras, números y guiones, sin espacios');
    if (/precio/i.test(msg)) return new ProveedorError('El precio de compra no puede ser negativo');
  }
  console.error('[CU14] Error de base de datos:', error);
  return new ProveedorError(porDefecto);
}

/** Columna aún no creada en Supabase (falta ejecutar el script SQL) */
function columnaFaltante(error: any): string | null {
  if (!error) return null;
  const msg = String(error.message ?? '');
  if (error.code === 'PGRST204' || error.code === '42703' || /column .* (does not exist|of .* in the schema cache)/i.test(msg)) {
    const m = msg.match(/'([^']+)' column/) ?? msg.match(/column "?([\w.]+)"? (of|does)/i);
    if (m) return m[1].split('.').pop() ?? null;
  }
  return null;
}

/**
 * Ejecuta una escritura y, si falta alguna columna nueva (direccion, estado,
 * fecha_actualizacion), la omite y reintenta. Devuelve las columnas omitidas.
 */
async function escribir(
  operacion: (fila: Record<string, unknown>) => PromiseLike<{ data: unknown; error: any }>,
  fila: Record<string, unknown>,
  porDefecto: string
): Promise<{ data: any; omitidas: string[] }> {
  let payload = { ...fila };
  const omitidas: string[] = [];
  for (let i = 0; i < 6; i++) {
    const { data, error } = await operacion(payload);
    const col = columnaFaltante(error);
    if (col && col in payload) {
      const { [col]: _quitada, ...resto } = payload;
      payload = resto;
      omitidas.push(col);
      continue;
    }
    if (error) throw errorBD(error, porDefecto);
    return { data, omitidas };
  }
  throw new ProveedorError(porDefecto);
}

function mapProveedor(row: any): Proveedor {
  return {
    id: row.id,
    razon_social: row.razon_social,
    nit: row.nit ?? '',
    contacto: row.contacto ?? null,
    telefono: row.telefono ?? null,
    correo: row.correo ?? null,
    direccion: row.direccion ?? null,
    estado: row.estado === undefined || row.estado === null ? true : Boolean(row.estado),
    total_productos: Array.isArray(row.producto_proveedor) ? row.producto_proveedor.length : 0,
  };
}

function mapItem(row: any): ItemCatalogo {
  return {
    proveedor_id: row.proveedor_id,
    producto_id: row.producto_id,
    producto_nombre: row.producto?.nombre ?? `Producto #${row.producto_id}`,
    unidad_medida: row.producto?.unidad_medida ?? null,
    precio_inventario: num(row.producto?.precio_compra_actual),
    codigo_item_proveedor: row.codigo_item_proveedor ?? null,
    precio_compra: num(row.precio_compra),
    fecha_actualizacion: row.fecha_actualizacion ?? null,
  };
}

const SELECT_PROVEEDOR = '*, producto_proveedor(producto_id)';
const SELECT_CATALOGO = '*, producto:producto_id(nombre, unidad_medida, precio_compra_actual)';
const bs = (n: number) => `Bs ${n.toFixed(2)}`;

// ===========================================================================
// Bitácora (columna oficial: ip)
// ===========================================================================

/**
 * registrarEventoProveedor(usuarioId, accion, ip)
 * Escribe en BITACORA usando la columna oficial `ip`.
 * Nunca lanza: un fallo de auditoría no debe deshacer la operación ya hecha,
 * pero queda registrado en la consola del servidor.
 */
export async function registrarEventoProveedor(
  db: Db,
  auditoria: Auditoria,
  accion: AccionProveedor,
  descripcion: string
): Promise<void> {
  const ipOrigen = (auditoria.ip && auditoria.ip.trim()) ? auditoria.ip.trim() : (await obtenerIpOrigen());
  const { error } = await db.from('bitacora').insert({
    usuario_id: auditoria.usuarioId,
    accion,
    descripcion,
    ip: ipOrigen,
  } as any);
  if (error) {
    console.error(
      `[CU14] No se pudo registrar ${accion} en la bitácora: ${error.message}` +
        (columnaFaltante(error) === 'ip' ? ' (falta la columna bitacora.ip: ejecute el script SQL del CU14)' : '')
    );
  }
}

// ===========================================================================
// PROVEEDORES
// ===========================================================================

/** obtenerListaProveedores(criterio): busca por razón social, NIT o contacto */
export async function obtenerListaProveedores(
  db: Db,
  criterio = '',
  incluirInactivos = false
): Promise<Proveedor[]> {
  const { data, error } = await db.from('proveedor').select(SELECT_PROVEEDOR).order('razon_social');
  if (error) throw errorBD(error, 'No se pudieron obtener los proveedores');
  const c = criterio.trim().toLowerCase();
  return ((data ?? []) as any[])
    .map(mapProveedor)
    .filter((p) => incluirInactivos || p.estado)
    .filter(
      (p) =>
        !c ||
        p.razon_social.toLowerCase().includes(c) ||
        p.nit.toLowerCase().includes(c) ||
        (p.contacto ?? '').toLowerCase().includes(c)
    );
}

export async function obtenerProveedor(db: Db, id: number): Promise<Proveedor | null> {
  const { data, error } = await db.from('proveedor').select(SELECT_PROVEEDOR).eq('id', id).maybeSingle();
  if (error) throw errorBD(error, 'No se pudo obtener el proveedor');
  return data ? mapProveedor(data) : null;
}

/** verificarNitExistente(nit): NIT único sin distinguir mayúsculas/minúsculas */
export async function verificarNitExistente(db: Db, nit: string, excluirId?: number): Promise<boolean> {
  let q = db.from('proveedor').select('id').ilike('nit', nit.trim().replace(/[%_\\]/g, '\\$&')).limit(1);
  if (excluirId) q = q.neq('id', excluirId);
  const { data, error } = await q;
  if (error) throw errorBD(error, 'No se pudo verificar el NIT');
  return !!data && data.length > 0;
}

/** registrarProveedor(proveedorDTO): valida, comprueba NIT único, guarda y audita */
export async function registrarProveedor(db: Db, dto: ProveedorDTO, auditoria: Auditoria): Promise<Proveedor> {
  const datos = validarProveedor(dto);
  if (await verificarNitExistente(db, datos.nit)) throw new ProveedorError('Ya existe un proveedor con ese NIT');

  const { data } = await escribir(
    (fila) => db.from('proveedor').insert(fila as any).select(SELECT_PROVEEDOR).single(),
    { ...datos, estado: true },
    'No se pudo registrar el proveedor'
  );
  const proveedor = mapProveedor(data);
  await registrarEventoProveedor(
    db,
    auditoria,
    'CREAR_PROVEEDOR',
    `Proveedor #${proveedor.id} "${proveedor.razon_social}" (NIT ${proveedor.nit}) registrado`
  );
  return proveedor;
}

/** actualizarProveedor(id, proveedorDTO) */
export async function actualizarProveedor(
  db: Db,
  id: number,
  dto: ProveedorDTO,
  auditoria: Auditoria
): Promise<Proveedor> {
  const datos = validarProveedor(dto);
  const actual = await obtenerProveedor(db, id);
  if (!actual) throw new ProveedorError('El proveedor no existe');
  if (await verificarNitExistente(db, datos.nit, id)) throw new ProveedorError('Ya existe otro proveedor con ese NIT');

  const { data } = await escribir(
    (fila) => db.from('proveedor').update(fila as any).eq('id', id).select(SELECT_PROVEEDOR).single(),
    datos,
    'No se pudo actualizar el proveedor'
  );
  const proveedor = mapProveedor(data);

  const cambios = (['razon_social', 'nit', 'contacto', 'telefono', 'correo', 'direccion'] as const)
    .filter((k) => (actual[k] ?? null) !== (proveedor[k] ?? null))
    .map((k) => `${k}: "${actual[k] ?? ''}" → "${proveedor[k] ?? ''}"`);
  await registrarEventoProveedor(
    db,
    auditoria,
    'ACTUALIZAR_PROVEEDOR',
    `Proveedor #${id} "${proveedor.razon_social}" actualizado` + (cambios.length ? `. ${cambios.join('; ')}` : ' (sin cambios)')
  );
  return proveedor;
}

/** cambiarEstadoProveedor(id, activo): baja lógica, conserva el historial */
export async function cambiarEstadoProveedor(
  db: Db,
  id: number,
  activo: boolean,
  auditoria: Auditoria
): Promise<Proveedor> {
  const { data, omitidas } = await escribir(
    (fila) => db.from('proveedor').update(fila as any).eq('id', id).select(SELECT_PROVEEDOR).maybeSingle(),
    { estado: activo },
    'No se pudo cambiar el estado del proveedor'
  );
  if (omitidas.includes('estado')) {
    throw new ProveedorError('Falta la columna proveedor.estado: ejecute el script SQL del CU14');
  }
  if (!data) throw new ProveedorError('El proveedor no existe');
  const proveedor = mapProveedor(data);
  await registrarEventoProveedor(
    db,
    auditoria,
    activo ? 'ACTIVAR_PROVEEDOR' : 'DESACTIVAR_PROVEEDOR',
    `Proveedor #${id} "${proveedor.razon_social}" ${activo ? 'reactivado' : 'desactivado'}`
  );
  return proveedor;
}

// ===========================================================================
// CATÁLOGO DEL MAYORISTA
// ===========================================================================

/** Productos del inventario general para vincular */
export async function listarProductosInventario(db: Db): Promise<ProductoInventario[]> {
  const { data, error } = await db
    .from('producto')
    .select('id, nombre, unidad_medida, precio_compra_actual')
    .order('nombre');
  if (error) throw errorBD(error, 'No se pudieron obtener los productos');
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    unidad_medida: p.unidad_medida ?? null,
    precio_compra_actual: num(p.precio_compra_actual),
  }));
}

/** Catálogo de un proveedor */
export async function obtenerCatalogo(db: Db, proveedorId: number): Promise<ItemCatalogo[]> {
  const { data, error } = await db.from('producto_proveedor').select(SELECT_CATALOGO).eq('proveedor_id', proveedorId);
  if (error) throw errorBD(error, 'No se pudo obtener el catálogo');
  return ((data ?? []) as any[]).map(mapItem).sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre));
}

async function obtenerItem(db: Db, proveedorId: number, productoId: number): Promise<ItemCatalogo | null> {
  const { data, error } = await db
    .from('producto_proveedor')
    .select(SELECT_CATALOGO)
    .eq('proveedor_id', proveedorId)
    .eq('producto_id', productoId)
    .maybeSingle();
  if (error) throw errorBD(error, 'No se pudo leer el catálogo');
  return data ? mapItem(data) : null;
}

/** El código de ítem no se repite dentro del mismo proveedor */
async function codigoRepetido(db: Db, proveedorId: number, codigo: string, excluirProductoId?: number) {
  let q = db
    .from('producto_proveedor')
    .select('producto_id')
    .eq('proveedor_id', proveedorId)
    .ilike('codigo_item_proveedor', codigo.replace(/[%_\\]/g, '\\$&'))
    .limit(1);
  if (excluirProductoId) q = q.neq('producto_id', excluirProductoId);
  const { data, error } = await q;
  if (error) throw errorBD(error, 'No se pudo verificar el código de ítem');
  return !!data && data.length > 0;
}

/** vincularProducto(proveedorId, item): agrega un producto del inventario al catálogo */
export async function vincularProducto(
  db: Db,
  proveedorId: number,
  dto: ItemCatalogoDTO,
  auditoria: Auditoria
): Promise<ItemCatalogo> {
  const { productoId, codigo, precio } = validarItemCatalogo(dto);

  const proveedor = await obtenerProveedor(db, proveedorId);
  if (!proveedor) throw new ProveedorError('El proveedor no existe');
  if (!proveedor.estado) throw new ProveedorError('El proveedor está inactivo: reactívelo para modificar su catálogo');

  const { data: producto, error } = await db.from('producto').select('id, nombre').eq('id', productoId).maybeSingle();
  if (error) throw errorBD(error, 'No se pudo verificar el producto');
  if (!producto) throw new ProveedorError('El producto no existe en el inventario');

  if (await obtenerItem(db, proveedorId, productoId)) {
    throw new ProveedorError('Ese producto ya está en el catálogo de este proveedor');
  }
  if (codigo && (await codigoRepetido(db, proveedorId, codigo))) {
    throw new ProveedorError('Ese código de ítem ya está registrado para este proveedor');
  }

  await escribir(
    (fila) => db.from('producto_proveedor').insert(fila as any),
    {
      proveedor_id: proveedorId,
      producto_id: productoId,
      codigo_item_proveedor: codigo,
      precio_compra: precio,
      fecha_actualizacion: new Date().toISOString(),
    },
    'No se pudo agregar el producto al catálogo'
  );

  const item = await obtenerItem(db, proveedorId, productoId);
  if (!item) throw new ProveedorError('No se pudo agregar el producto al catálogo');
  await registrarEventoProveedor(
    db,
    auditoria,
    'VINCULAR_PRODUCTO_PROVEEDOR',
    `"${item.producto_nombre}" agregado al catálogo de "${proveedor.razon_social}" · código ${codigo ?? 'sin código'} · precio de compra ${bs(precio)}`
  );
  return item;
}

/** actualizarItemCatalogo(proveedorId, productoId, código y precio) */
export async function actualizarItemCatalogo(
  db: Db,
  proveedorId: number,
  productoId: number,
  dto: Omit<ItemCatalogoDTO, 'productoId'>,
  auditoria: Auditoria
): Promise<ItemCatalogo> {
  const { codigo, precio } = validarItemCatalogo({ ...dto, productoId });

  const proveedor = await obtenerProveedor(db, proveedorId);
  if (!proveedor) throw new ProveedorError('El proveedor no existe');
  if (!proveedor.estado) throw new ProveedorError('El proveedor está inactivo: reactívelo para modificar su catálogo');

  const actual = await obtenerItem(db, proveedorId, productoId);
  if (!actual) throw new ProveedorError('El producto ya no está en el catálogo');
  if (codigo && (await codigoRepetido(db, proveedorId, codigo, productoId))) {
    throw new ProveedorError('Ese código de ítem ya está registrado para este proveedor');
  }

  await escribir(
    (fila) =>
      db.from('producto_proveedor').update(fila as any).eq('proveedor_id', proveedorId).eq('producto_id', productoId),
    { codigo_item_proveedor: codigo, precio_compra: precio, fecha_actualizacion: new Date().toISOString() },
    'No se pudo actualizar el catálogo'
  );

  const item = await obtenerItem(db, proveedorId, productoId);
  if (!item) throw new ProveedorError('No se pudo actualizar el catálogo');

  const cambios: string[] = [];
  if (actual.precio_compra !== precio) cambios.push(`precio ${bs(actual.precio_compra)} → ${bs(precio)}`);
  if ((actual.codigo_item_proveedor ?? null) !== codigo) {
    cambios.push(`código ${actual.codigo_item_proveedor ?? 'sin código'} → ${codigo ?? 'sin código'}`);
  }
  if (cambios.length) {
    await registrarEventoProveedor(
      db,
      auditoria,
      'ACTUALIZAR_PRECIO_PROVEEDOR',
      `"${item.producto_nombre}" en "${proveedor.razon_social}": ${cambios.join(', ')}`
    );
  }
  return item;
}

/** quitarProductoCatalogo(proveedorId, productoId) */
export async function quitarProductoCatalogo(
  db: Db,
  proveedorId: number,
  productoId: number,
  auditoria: Auditoria
): Promise<ItemCatalogo> {
  const proveedor = await obtenerProveedor(db, proveedorId);
  if (!proveedor) throw new ProveedorError('El proveedor no existe');
  if (!proveedor.estado) throw new ProveedorError('El proveedor está inactivo: reactívelo para modificar su catálogo');

  const actual = await obtenerItem(db, proveedorId, productoId);
  if (!actual) throw new ProveedorError('El producto ya no está en el catálogo');

  const { error } = await db
    .from('producto_proveedor')
    .delete()
    .eq('proveedor_id', proveedorId)
    .eq('producto_id', productoId);
  if (error) throw errorBD(error, 'No se pudo quitar el producto del catálogo');

  await registrarEventoProveedor(
    db,
    auditoria,
    'QUITAR_PRODUCTO_PROVEEDOR',
    `"${actual.producto_nombre}" retirado del catálogo de "${proveedor.razon_social}"`
  );
  return actual;
}

// ===========================================================================
// SUBFLUJO "COMPARAR PRECIOS"
// ===========================================================================

/**
 * compararPreciosProducto(productoId)
 * Ofertas de todos los proveedores que venden el producto, de la más barata
 * a la más cara. La mejor oferta se calcula solo entre proveedores ACTIVOS;
 * los inactivos se muestran al final como referencia.
 */
export async function compararPreciosProducto(db: Db, productoId: number): Promise<ComparativoPrecios> {
  const { data: producto, error: errProducto } = await db
    .from('producto')
    .select('id, nombre, unidad_medida, precio_compra_actual')
    .eq('id', productoId)
    .maybeSingle();
  if (errProducto) throw errorBD(errProducto, 'No se pudo leer el producto');
  if (!producto) throw new ProveedorError('El producto no existe en el inventario');

  const { data, error } = await db
    .from('producto_proveedor')
    .select('*, proveedor:proveedor_id(*)')
    .eq('producto_id', productoId);
  if (error) throw errorBD(error, 'No se pudo obtener el comparativo de precios');

  const base = ((data ?? []) as any[]).map((r) => ({
    proveedor_id: r.proveedor_id,
    razon_social: r.proveedor?.razon_social ?? `Proveedor #${r.proveedor_id}`,
    nit: r.proveedor?.nit ?? '',
    activo: r.proveedor?.estado === undefined || r.proveedor?.estado === null ? true : Boolean(r.proveedor.estado),
    codigo_item_proveedor: r.codigo_item_proveedor ?? null,
    precio_compra: num(r.precio_compra),
    fecha_actualizacion: r.fecha_actualizacion ?? null,
  }));

  const activos = base.filter((o) => o.activo);
  const mejor = activos.length ? Math.min(...activos.map((o) => o.precio_compra)) : null;

  const ofertas: OfertaProveedor[] = base
    .map((o) => ({
      ...o,
      diferencia: mejor === null ? 0 : Math.round((o.precio_compra - mejor) * 100) / 100,
      es_mejor: o.activo && mejor !== null && o.precio_compra === mejor,
    }))
    .sort((a, b) => Number(b.activo) - Number(a.activo) || a.precio_compra - b.precio_compra);

  const p = producto as any;
  return {
    producto_id: p.id,
    producto_nombre: p.nombre,
    unidad_medida: p.unidad_medida ?? null,
    precio_inventario: num(p.precio_compra_actual),
    ofertas,
    mejor_precio: mejor,
  };
}
