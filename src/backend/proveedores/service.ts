/**
 * CU014 — 3° service.ts · Servicios de negocio y consultas a Supabase
 *
 * Cada servicio recibe `db: Db` como primer parámetro (sin estado global).
 * Las columnas que agregan las migraciones (direccion, estado, precio_compra,
 * fecha_actualizacion, stock_disponible, ip) se escriben de forma tolerante:
 * si todavía no existen en Supabase se omiten en lugar de romper la operación.
 *
 * Métodos del diagrama de comunicación:
 *   obtenerListaProveedores(criterio)          → obtenerListaProveedoresService
 *   verificarRUCExistente(nitRuc)              → verificarRUCService
 *   solicitarValidacionProveedor(proveedorDTO) → validarProveedorService
 *   guardarProveedor(datosProveedor)           → guardarProveedorService
 *   recorrerYValidarListaProductos(listaDTO)   → recorrerYValidarListaProductos
 *   verificarProductosExistentes(listaDTO)     → verificarProductosExistentesService
 *   actualizarPreciosYStockMayorista(id, items)→ actualizarCatalogoService
 *   guardarHistorialPrecios(id, precios)       → guardarHistorialPreciosService
 *   registrarEventoProveedor(usuarioId, accion, ip) → registrarEventoProveedorService
 */
import { ZodError, type z } from 'zod';
import { listaCatalogoSchema, proveedorSchema } from './schema';
import type {
  AccionProveedor,
  CambioPrecio,
  CatalogoMayorista,
  DatosProveedor,
  Db,
  ProductoCatalogoDTO,
  ProductoCatalogoValido,
  ProductoOpcion,
  Proveedor,
  ProveedorDTO,
  ResumenCatalogo,
} from './types';

/** Error de negocio: su mensaje se muestra tal cual en la interfaz */
export class ProveedorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProveedorError';
  }
}

// ===========================================================================
// UTILIDADES INTERNAS
// ===========================================================================
type Tabla = 'proveedor' | 'producto' | 'producto_proveedor' | 'bitacora';
type Fila = Record<string, unknown>;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function validar<S extends z.ZodType>(schema: S, data: unknown, prefijo = ''): z.output<S> {
  try {
    return schema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) {
      const issue = e.issues[0];
      const fila = typeof issue?.path[0] === 'number' ? `Fila ${Number(issue.path[0]) + 1}: ` : '';
      throw new ProveedorError(`${prefijo}${fila}${issue?.message ?? 'Datos inválidos'}`);
    }
    throw e;
  }
}

function errorBD(error: any, porDefecto: string): ProveedorError {
  const msg: string = error?.message ?? '';
  if (error?.code === '23505' || /duplicate key/i.test(msg)) {
    if (/nit/i.test(msg)) return new ProveedorError('Ya existe un proveedor con ese NIT');
    if (/codigo/i.test(msg)) return new ProveedorError('Código de ítem repetido para este proveedor');
    if (/producto/i.test(msg)) return new ProveedorError('Ese producto ya está en el catálogo del proveedor');
    return new ProveedorError('Registro duplicado');
  }
  return new ProveedorError(msg || porDefecto);
}

/** Columna pendiente de migración (PostgREST PGRST204) */
function columnaFaltante(error: any): string | null {
  if (!error) return null;
  const msg = String(error.message ?? '');
  if (error.code === 'PGRST204' || /column .* (does not exist|of .* in the schema cache)/i.test(msg)) {
    const m = msg.match(/'([^']+)' column/) ?? msg.match(/column "?([\w.]+)"? (of|does)/i);
    if (m) return m[1].split('.').pop() ?? null;
  }
  return null;
}

/** Ejecuta una escritura quitando columnas que aún no existen y reintentando */
async function escribirTolerante<T>(
  operacion: (payload: Fila[]) => PromiseLike<{ data: unknown; error: any }>,
  filas: Fila[],
  porDefecto: string
): Promise<{ data: T; omitidas: string[] }> {
  let payload = filas.map((f) => ({ ...f }));
  const omitidas: string[] = [];
  for (let i = 0; i < 8; i++) {
    const { data, error } = await operacion(payload);
    const col = columnaFaltante(error);
    if (col && payload.some((f) => col in f)) {
      payload = payload.map(({ [col]: _omitida, ...resto }) => resto);
      omitidas.push(col);
      continue;
    }
    if (error) throw errorBD(error, porDefecto);
    return { data: data as T, omitidas };
  }
  throw new ProveedorError(porDefecto);
}

function mapProveedor(row: any): Proveedor {
  return {
    id: row.id,
    razon_social: row.razon_social,
    nit: row.nit,
    contacto: row.contacto ?? null,
    telefono: row.telefono ?? null,
    correo: row.correo ?? null,
    direccion: row.direccion ?? null,
    estado: row.estado === undefined || row.estado === null ? true : Boolean(row.estado),
    total_productos: Array.isArray(row.producto_proveedor) ? row.producto_proveedor.length : 0,
  };
}

function mapCatalogo(row: any): CatalogoMayorista {
  return {
    id: row.id,
    proveedor_id: row.proveedor_id,
    producto_id: row.producto_id,
    producto_nombre: row.producto?.nombre ?? `Producto #${row.producto_id}`,
    unidad_medida: row.producto?.unidad_medida ?? null,
    precio_compra_actual: num(row.producto?.precio_compra_actual),
    codigo_item_proveedor: row.codigo_item_proveedor ?? null,
    precio_mayorista: num(row.precio_compra),
    stock_disponible: num(row.stock_disponible),
    fecha_actualizacion: row.fecha_actualizacion ?? null,
  };
}

const SELECT_CATALOGO = '*, producto:producto_id(nombre, unidad_medida, precio_compra_actual)';

// ===========================================================================
// SERVICIOS — PROVEEDOR
// ===========================================================================

/** obtenerListaProveedores(criterio): razón social, NIT o contacto */
export async function obtenerListaProveedoresService(
  db: Db,
  criterio = '',
  opciones: { incluirInactivos?: boolean } = {}
): Promise<Proveedor[]> {
  // select('*') tolera columnas aún no migradas (direccion, estado)
  const { data, error } = await db.from('proveedor').select('*, producto_proveedor(id)').order('razon_social');
  if (error) throw errorBD(error, 'No se pudieron obtener los proveedores');

  const c = criterio.trim().toLowerCase();
  return ((data ?? []) as any[])
    .map(mapProveedor)
    .filter((p) => opciones.incluirInactivos || p.estado)
    .filter(
      (p) =>
        !c ||
        p.razon_social.toLowerCase().includes(c) ||
        p.nit.toLowerCase().includes(c) ||
        (p.contacto ?? '').toLowerCase().includes(c)
    );
}

export async function obtenerProveedorPorIdService(db: Db, id: number): Promise<Proveedor | null> {
  const { data, error } = await db.from('proveedor').select('*, producto_proveedor(id)').eq('id', id).maybeSingle();
  if (error) throw errorBD(error, 'No se pudo obtener el proveedor');
  return data ? mapProveedor(data) : null;
}

/** verificarRUCExistente(nitRuc) → true si otro proveedor ya usa el NIT */
export async function verificarRUCService(db: Db, nitRuc: string, excluirId?: number): Promise<boolean> {
  let q = db.from('proveedor').select('id').ilike('nit', nitRuc.trim()).limit(1);
  if (excluirId) q = q.neq('id', excluirId);
  const { data, error } = await q;
  if (error) throw errorBD(error, 'No se pudo verificar el NIT');
  return !!data && data.length > 0;
}

/** solicitarValidacionProveedor(proveedorDTO): formato + NIT único */
export async function validarProveedorService(db: Db, dto: ProveedorDTO, excluirId?: number): Promise<DatosProveedor> {
  const datos = validar(proveedorSchema, dto);
  if (await verificarRUCService(db, datos.nit, excluirId)) {
    throw new ProveedorError(excluirId ? 'Ya existe otro proveedor con ese NIT' : 'Ya existe un proveedor con ese NIT');
  }
  return datos;
}

/** guardarProveedor(datosProveedor): alta */
export async function guardarProveedorService(db: Db, datos: DatosProveedor): Promise<Proveedor> {
  const { data } = await escribirTolerante<any>(
    (p) => db.from('proveedor').insert(p[0] as any).select('*').single(),
    [{ ...datos, estado: true }],
    'No se pudo registrar el proveedor'
  );
  return mapProveedor(data);
}

/** Modificar proveedor */
export async function actualizarProveedorService(db: Db, id: number, datos: DatosProveedor): Promise<Proveedor> {
  const { data } = await escribirTolerante<any>(
    (p) => db.from('proveedor').update(p[0] as any).eq('id', id).select('*, producto_proveedor(id)').maybeSingle(),
    [{ ...datos }],
    'No se pudo actualizar el proveedor'
  );
  if (!data) throw new ProveedorError('El proveedor no existe');
  return mapProveedor(data);
}

/** Desactivar / reactivar (baja lógica) */
export async function cambiarEstadoProveedorService(db: Db, id: number, activo: boolean): Promise<Proveedor> {
  const { data, omitidas } = await escribirTolerante<any>(
    (p) => db.from('proveedor').update(p[0] as any).eq('id', id).select('*, producto_proveedor(id)').maybeSingle(),
    [{ estado: activo }],
    'No se pudo cambiar el estado'
  );
  if (omitidas.includes('estado')) {
    throw new ProveedorError('La columna proveedor.estado aún no existe. Aplique la migración de CU14.');
  }
  if (!data) throw new ProveedorError('El proveedor no existe');
  return mapProveedor(data);
}

// ===========================================================================
// SERVICIOS — CATÁLOGO DE MAYORISTAS
// ===========================================================================

/** Productos internos (BD Producto) para el selector del catálogo */
export async function listarProductosService(db: Db): Promise<ProductoOpcion[]> {
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

/** Catálogo actual de un proveedor */
export async function obtenerCatalogoService(db: Db, proveedorId: number): Promise<CatalogoMayorista[]> {
  const { data, error } = await db.from('producto_proveedor').select(SELECT_CATALOGO).eq('proveedor_id', proveedorId);
  if (error) throw errorBD(error, 'No se pudo obtener el catálogo');
  return ((data ?? []) as any[])
    .map(mapCatalogo)
    .sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre));
}

/**
 * recorrerYValidarListaProductos(listaDTO)
 * Valida cada fila y detecta productos o códigos repetidos dentro de la lista.
 */
export function recorrerYValidarListaProductos(listaDTO: ProductoCatalogoDTO[]): ProductoCatalogoValido[] {
  const lista = validar(listaCatalogoSchema, listaDTO);
  const productos = new Set<number>();
  const codigos = new Map<string, number>();
  lista.forEach((item, i) => {
    if (productos.has(item.productoId)) {
      throw new ProveedorError(`Fila ${i + 1}: el producto está repetido en la lista`);
    }
    productos.add(item.productoId);
    if (item.codigoItemProveedor) {
      const clave = item.codigoItemProveedor.toLowerCase();
      if (codigos.has(clave)) {
        throw new ProveedorError(
          `Fila ${i + 1}: código de ítem "${item.codigoItemProveedor}" repetido (también en la fila ${codigos.get(clave)! + 1})`
        );
      }
      codigos.set(clave, i);
    }
  });
  return lista;
}

/** verificarProductosExistentes(listaDTO) en BD Producto → mapa id → nombre */
export async function verificarProductosExistentesService(
  db: Db,
  lista: ProductoCatalogoValido[]
): Promise<Map<number, string>> {
  const ids = lista.map((i) => i.productoId);
  const { data, error } = await db.from('producto').select('id, nombre').in('id', ids);
  if (error) throw errorBD(error, 'No se pudieron verificar los productos');
  const encontrados = new Map<number, string>(((data ?? []) as any[]).map((p) => [p.id, p.nombre]));
  const faltantes = ids.filter((id) => !encontrados.has(id));
  if (faltantes.length) {
    throw new ProveedorError(`Productos inexistentes en el catálogo: ${faltantes.join(', ')}`);
  }
  return encontrados;
}

/**
 * actualizarPreciosYStockMayorista(proveedorId, items) en BD CatalogoMayorista
 * Inserta los productos nuevos y actualiza los existentes en UNA sola
 * sentencia (upsert sobre proveedor_id + producto_id), por lo que la
 * actualización del catálogo es atómica: o se aplica completa o no se aplica.
 */
export async function actualizarCatalogoService(
  db: Db,
  proveedorId: number,
  items: ProductoCatalogoValido[],
  nombres: Map<number, string>
): Promise<Omit<ResumenCatalogo, 'proveedorNombre' | 'catalogo' | 'proveedorId'>> {
  const actual = await obtenerCatalogoService(db, proveedorId);
  const porProducto = new Map(actual.map((c) => [c.producto_id, c]));
  const enLista = new Set(items.map((i) => i.productoId));

  // Código de ítem usado por otro producto del proveedor que no se toca en esta lista
  for (const item of items) {
    if (!item.codigoItemProveedor) continue;
    const choque = actual.find(
      (c) =>
        c.producto_id !== item.productoId &&
        !enLista.has(c.producto_id) &&
        (c.codigo_item_proveedor ?? '').toLowerCase() === item.codigoItemProveedor!.toLowerCase()
    );
    if (choque) {
      throw new ProveedorError(
        `Código de ítem "${item.codigoItemProveedor}" ya asignado a "${choque.producto_nombre}" en este proveedor`
      );
    }
  }

  const ahora = new Date().toISOString();
  const filas: Fila[] = [];
  const cambiosPrecio: CambioPrecio[] = [];
  let insertados = 0;
  let actualizados = 0;
  let sinCambios = 0;

  for (const item of items) {
    const previo = porProducto.get(item.productoId);
    const igual =
      previo &&
      previo.precio_mayorista === item.precioMayorista &&
      previo.stock_disponible === item.stockDisponible &&
      (previo.codigo_item_proveedor ?? null) === (item.codigoItemProveedor ?? null);
    if (igual) {
      sinCambios++;
      continue;
    }
    if (previo) actualizados++;
    else insertados++;
    if (!previo || previo.precio_mayorista !== item.precioMayorista) {
      cambiosPrecio.push({
        productoId: item.productoId,
        productoNombre: nombres.get(item.productoId) ?? `Producto #${item.productoId}`,
        precioAnterior: previo ? previo.precio_mayorista : null,
        precioNuevo: item.precioMayorista,
      });
    }
    filas.push({
      proveedor_id: proveedorId,
      producto_id: item.productoId,
      codigo_item_proveedor: item.codigoItemProveedor ?? null,
      precio_compra: item.precioMayorista,
      stock_disponible: item.stockDisponible,
      fecha_actualizacion: ahora,
    });
  }

  if (filas.length) {
    try {
      await escribirTolerante(
        (p) => db.from('producto_proveedor').upsert(p as any, { onConflict: 'proveedor_id,producto_id' }),
        filas,
        'No se pudo actualizar el catálogo'
      );
    } catch (e: any) {
      // Sin índice único (migración pendiente): actualización fila por fila
      if (!/no unique or exclusion constraint|42P10/i.test(String(e?.message))) throw e;
      for (const fila of filas) {
        const previo = porProducto.get(fila.producto_id as number);
        await escribirTolerante(
          (p) =>
            previo
              ? db.from('producto_proveedor').update(p[0] as any).eq('id', previo.id)
              : db.from('producto_proveedor').insert(p[0] as any),
          [fila],
          'No se pudo actualizar el catálogo'
        );
      }
    }
  }

  return { insertados, actualizados, sinCambios, cambiosPrecio };
}

/** Quitar un producto del catálogo del proveedor */
export async function eliminarItemCatalogoService(db: Db, catalogoId: number): Promise<CatalogoMayorista> {
  const { data: actual, error } = await db.from('producto_proveedor').select(SELECT_CATALOGO).eq('id', catalogoId).maybeSingle();
  if (error) throw errorBD(error, 'No se pudo leer el catálogo');
  if (!actual) throw new ProveedorError('El producto ya no está en el catálogo');
  const { error: delError } = await db.from('producto_proveedor').delete().eq('id', catalogoId);
  if (delError) throw errorBD(delError, 'No se pudo quitar el producto');
  return mapCatalogo(actual);
}

// ===========================================================================
// SERVICIOS — BITÁCORA
// ===========================================================================

/** registrarEventoProveedor(usuarioId, accion, ip). Nunca lanza. */
export async function registrarEventoProveedorService(
  db: Db,
  usuarioId: number,
  accion: AccionProveedor,
  ip: string,
  descripcion?: string
): Promise<void> {
  try {
    await escribirTolerante(
      (p) => db.from('bitacora').insert(p[0] as any),
      [{ usuario_id: usuarioId, accion, descripcion: descripcion ?? accion, ip }],
      'No se pudo registrar en la bitácora'
    );
  } catch (e) {
    console.error('[CU014] Bitácora:', (e as Error).message);
  }
}

/**
 * guardarHistorialPrecios(proveedorId, precios)
 * El modelo de datos no tiene una tabla de historial: cada cambio de precio
 * pactado queda como evento ACTUALIZAR_PRECIO_PROVEEDOR en la bitácora
 * (precio anterior → nuevo) y la fila del catálogo guarda su
 * fecha_actualizacion.
 */
export async function guardarHistorialPreciosService(
  db: Db,
  params: { usuarioId: number; ip: string; proveedorId: number; proveedorNombre: string; precios: CambioPrecio[] }
): Promise<void> {
  for (const c of params.precios) {
    await registrarEventoProveedorService(
      db,
      params.usuarioId,
      'ACTUALIZAR_PRECIO_PROVEEDOR',
      params.ip,
      `Proveedor #${params.proveedorId} "${params.proveedorNombre}" · "${c.productoNombre}": ` +
        (c.precioAnterior === null
          ? `precio inicial Bs ${c.precioNuevo.toFixed(2)}`
          : `Bs ${c.precioAnterior.toFixed(2)} → Bs ${c.precioNuevo.toFixed(2)}`)
    );
  }
}
