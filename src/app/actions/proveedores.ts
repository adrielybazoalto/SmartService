'use server';

/**
 * CU14 — Gestionar Proveedores y Catálogo de Mayoristas
 * Tablas (diccionario de datos): proveedor, producto_proveedor, producto, bitacora.
 */

import { revalidatePath } from 'next/cache';
import {
  actualizarTolerante,
  getSupabase,
  getUsuarioSesion,
  insertarTolerante,
  registrarBitacora,
  type UsuarioSesion,
} from './bitacora';

// ===========================================================================
// Tipos
// ===========================================================================
export type ActionResult<T = undefined> =
  | { ok: true; data: T; mensaje?: string }
  | { ok: false; error: string };

export type Proveedor = {
  id: number;
  razon_social: string;
  nit: string;
  contacto: string | null;
  telefono: string | null;
  correo: string | null;
  direccion?: string | null;
  estado?: boolean;
  total_productos?: number;
};

export type ProveedorInput = {
  razon_social: string;
  nit: string;
  contacto?: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
};

export type ProductoCatalogo = {
  id: number;
  nombre: string;
  unidad_medida: string | null;
  precio_compra_actual: number;
};

export type VinculoProducto = {
  id: number;
  proveedor_id: number;
  producto_id: number;
  producto_nombre: string;
  unidad_medida: string | null;
  precio_compra_actual: number;
  codigo_item_proveedor: string | null;
  precio_compra: number;
  fecha_actualizacion?: string | null;
};

export type VinculoInput = {
  proveedor_id: number;
  producto_id: number;
  codigo_item_proveedor?: string;
  precio_compra: number;
};

export type ComparativoPrecio = {
  proveedor_id: number;
  razon_social: string;
  activo: boolean;
  codigo_item_proveedor: string | null;
  precio_compra: number;
  fecha_actualizacion?: string | null;
};

// ===========================================================================
// Helpers internos
// ===========================================================================
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const limpiar = (s?: string | null) => {
  const t = (s ?? '').trim();
  return t.length ? t : null;
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function requireUsuario(): Promise<UsuarioSesion> {
  const u = await getUsuarioSesion();
  if (!u) throw new Error('Sesión expirada. Vuelva a iniciar sesión.');
  return u;
}

function mensajeError(e: any, porDefecto: string): string {
  const msg: string = e?.message ?? '';
  if (e?.code === '23505' || /duplicate key/i.test(msg)) {
    if (/nit/i.test(msg)) return 'Ya existe un proveedor con ese NIT';
    if (/codigo/i.test(msg)) return 'Ese código de ítem ya está registrado para este proveedor';
    if (/producto/i.test(msg)) return 'Ese producto ya está vinculado a este proveedor';
    return 'Registro duplicado';
  }
  return msg || porDefecto;
}

function validarProveedor(input: ProveedorInput): string | null {
  const razon = (input.razon_social ?? '').trim();
  const nit = (input.nit ?? '').trim();
  if (razon.length < 3) return 'La razón social debe tener al menos 3 caracteres';
  if (razon.length > 200) return 'La razón social no puede superar 200 caracteres';
  if (!/^[0-9A-Za-z-]{5,50}$/.test(nit)) return 'NIT inválido (5 a 50 caracteres, solo números, letras o guiones)';
  if (input.correo && input.correo.trim() && !EMAIL_RE.test(input.correo.trim())) return 'Correo electrónico inválido';
  if (input.telefono && input.telefono.trim() && !/^[0-9+\s()-]{6,30}$/.test(input.telefono.trim())) return 'Teléfono inválido';
  if ((input.contacto ?? '').length > 150) return 'El contacto no puede superar 150 caracteres';
  if ((input.direccion ?? '').length > 255) return 'La dirección no puede superar 255 caracteres';
  return null;
}

async function nitDuplicado(nit: string, excluirId?: number): Promise<boolean> {
  let q = getSupabase().from('proveedor').select('id').ilike('nit', nit.trim()).limit(1);
  if (excluirId) q = q.neq('id', excluirId);
  const { data } = await q;
  return !!data && data.length > 0;
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
    total_productos: Array.isArray(row.producto_proveedor) ? row.producto_proveedor.length : undefined,
  };
}

function mapVinculo(row: any): VinculoProducto {
  return {
    id: row.id,
    proveedor_id: row.proveedor_id,
    producto_id: row.producto_id,
    producto_nombre: row.producto?.nombre ?? `Producto #${row.producto_id}`,
    unidad_medida: row.producto?.unidad_medida ?? null,
    precio_compra_actual: num(row.producto?.precio_compra_actual),
    codigo_item_proveedor: row.codigo_item_proveedor ?? null,
    precio_compra: num(row.precio_compra ?? row.precio_pactado),
    fecha_actualizacion: row.fecha_actualizacion ?? null,
  };
}

// ===========================================================================
// Proveedores
// ===========================================================================

/** Lista proveedores con buscador por razón social, NIT o contacto */
export async function listarProveedores(opciones?: {
  busqueda?: string;
  incluirInactivos?: boolean;
}): Promise<ActionResult<Proveedor[]>> {
  try {
    await requireUsuario();
    // select('*') para tolerar columnas aún no migradas (direccion, estado)
    const { data, error } = await getSupabase()
      .from('proveedor')
      .select('*, producto_proveedor(id)')
      .order('razon_social');
    if (error) return fail(error.message);

    const b = (opciones?.busqueda ?? '').trim().toLowerCase();
    const lista = ((data ?? []) as any[])
      .map(mapProveedor)
      .filter((p) => opciones?.incluirInactivos || p.estado !== false)
      .filter(
        (p) =>
          !b ||
          p.razon_social.toLowerCase().includes(b) ||
          p.nit.toLowerCase().includes(b) ||
          (p.contacto ?? '').toLowerCase().includes(b)
      );
    return { ok: true, data: lista };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudieron cargar los proveedores'));
  }
}

/** CU14 pasos 1-3: registrar proveedor validando NIT único */
export async function crearProveedor(input: ProveedorInput): Promise<ActionResult<Proveedor>> {
  try {
    const usuario = await requireUsuario();
    const invalido = validarProveedor(input);
    if (invalido) return fail(invalido);
    if (await nitDuplicado(input.nit)) return fail('Ya existe un proveedor con ese NIT');

    const { data, error } = await insertarTolerante('proveedor', {
      razon_social: input.razon_social.trim(),
      nit: input.nit.trim(),
      contacto: limpiar(input.contacto),
      telefono: limpiar(input.telefono),
      correo: limpiar(input.correo)?.toLowerCase() ?? null,
      direccion: limpiar(input.direccion),
      estado: true,
    });
    if (error || !data) return fail(mensajeError(error, 'No se pudo registrar el proveedor'));

    await registrarBitacora({
      usuario_id: usuario.id,
      accion: 'CREAR_PROVEEDOR',
      descripcion: `Proveedor "${input.razon_social.trim()}" (NIT ${input.nit.trim()}) registrado`,
    });
    revalidatePath('/proveedores');
    return { ok: true, data: mapProveedor(data), mensaje: 'Proveedor registrado correctamente' };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo registrar el proveedor'));
  }
}

/** Subflujo: modificar proveedor */
export async function actualizarProveedor(id: number, input: ProveedorInput): Promise<ActionResult<Proveedor>> {
  try {
    const usuario = await requireUsuario();
    const invalido = validarProveedor(input);
    if (invalido) return fail(invalido);
    if (await nitDuplicado(input.nit, id)) return fail('Ya existe otro proveedor con ese NIT');

    const { data, error } = await actualizarTolerante(
      'proveedor',
      {
        razon_social: input.razon_social.trim(),
        nit: input.nit.trim(),
        contacto: limpiar(input.contacto),
        telefono: limpiar(input.telefono),
        correo: limpiar(input.correo)?.toLowerCase() ?? null,
        direccion: limpiar(input.direccion),
      },
      { columna: 'id', valor: id }
    );
    if (error) return fail(mensajeError(error, 'No se pudo actualizar el proveedor'));
    if (!data) return fail('El proveedor no existe');

    await registrarBitacora({
      usuario_id: usuario.id,
      accion: 'ACTUALIZAR_PROVEEDOR',
      descripcion: `Proveedor #${id} "${input.razon_social.trim()}" actualizado`,
    });
    revalidatePath('/proveedores');
    return { ok: true, data: mapProveedor(data), mensaje: 'Proveedor actualizado' };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo actualizar el proveedor'));
  }
}

/** Subflujo: desactivar / reactivar proveedor (baja lógica, conserva historial) */
export async function cambiarEstadoProveedor(id: number, activo: boolean): Promise<ActionResult<Proveedor>> {
  try {
    const usuario = await requireUsuario();
    const { data, error, omitidas } = await actualizarTolerante('proveedor', { estado: activo }, { columna: 'id', valor: id });
    if (omitidas.includes('estado')) {
      return fail('La columna proveedor.estado aún no existe en la base de datos. Aplique la migración de CU14.');
    }
    if (error) return fail(mensajeError(error, 'No se pudo cambiar el estado'));
    if (!data) return fail('El proveedor no existe');

    await registrarBitacora({
      usuario_id: usuario.id,
      accion: activo ? 'ACTIVAR_PROVEEDOR' : 'DESACTIVAR_PROVEEDOR',
      descripcion: `Proveedor #${id} "${(data as any).razon_social}" ${activo ? 'reactivado' : 'desactivado'}`,
    });
    revalidatePath('/proveedores');
    return { ok: true, data: mapProveedor(data), mensaje: activo ? 'Proveedor reactivado' : 'Proveedor desactivado' };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo cambiar el estado'));
  }
}

// ===========================================================================
// Catálogo de mayoristas (producto_proveedor)
// ===========================================================================

/** Productos del catálogo (CU16) disponibles para vincular */
export async function listarProductosCatalogo(): Promise<ActionResult<ProductoCatalogo[]>> {
  try {
    await requireUsuario();
    const { data, error } = await getSupabase()
      .from('producto')
      .select('id, nombre, unidad_medida, precio_compra_actual')
      .order('nombre');
    if (error) return fail(error.message);
    return {
      ok: true,
      data: ((data ?? []) as any[]).map((p: any) => ({
        id: p.id,
        nombre: p.nombre,
        unidad_medida: p.unidad_medida ?? null,
        precio_compra_actual: num(p.precio_compra_actual),
      })),
    };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo cargar el catálogo de productos'));
  }
}

/** Pestaña "Productos que provee" */
export async function obtenerCatalogoProveedor(proveedorId: number): Promise<ActionResult<VinculoProducto[]>> {
  try {
    await requireUsuario();
    const { data, error } = await getSupabase()
      .from('producto_proveedor')
      .select('*, producto:producto_id(nombre, unidad_medida, precio_compra_actual)')
      .eq('proveedor_id', proveedorId)
      .order('id');
    if (error) return fail(error.message);
    const lista = ((data ?? []) as any[]).map(mapVinculo).sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre));
    return { ok: true, data: lista };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo cargar el catálogo del proveedor'));
  }
}

async function validarVinculo(
  proveedorId: number,
  productoId: number,
  codigo: string | null,
  precio: number,
  excluirId?: number
): Promise<string | null> {
  if (!Number.isFinite(precio) || precio < 0) return 'El precio de compra no puede ser negativo';
  if (precio > 9_999_999_999) return 'Precio fuera de rango';
  if (codigo && codigo.length > 100) return 'El código de ítem no puede superar 100 caracteres';

  const db = getSupabase();
  let qProd = db.from('producto_proveedor').select('id').eq('proveedor_id', proveedorId).eq('producto_id', productoId);
  if (excluirId) qProd = qProd.neq('id', excluirId);
  const { data: dupProd } = await qProd.limit(1);
  if (dupProd && dupProd.length) return 'Ese producto ya está vinculado a este proveedor';

  if (codigo) {
    let qCod = db.from('producto_proveedor').select('id').eq('proveedor_id', proveedorId).ilike('codigo_item_proveedor', codigo);
    if (excluirId) qCod = qCod.neq('id', excluirId);
    const { data: dupCod } = await qCod.limit(1);
    if (dupCod && dupCod.length) return 'Ese código de ítem ya está registrado para este proveedor';
  }
  return null;
}

/** CU14 pasos 4-5: vincular producto con código de ítem y precio pactado */
export async function vincularProducto(input: VinculoInput): Promise<ActionResult<VinculoProducto>> {
  try {
    const usuario = await requireUsuario();
    const db = getSupabase();
    const precio = r2(Number(input.precio_compra));
    const codigo = limpiar(input.codigo_item_proveedor);

    const [{ data: prov }, { data: prod }] = await Promise.all([
      db.from('proveedor').select('*').eq('id', input.proveedor_id).maybeSingle(),
      db.from('producto').select('id, nombre').eq('id', input.producto_id).maybeSingle(),
    ]);
    if (!prov) return fail('El proveedor no existe');
    if ((prov as any).estado === false) return fail('No se pueden vincular productos a un proveedor desactivado');
    if (!prod) return fail('El producto no existe en el catálogo');

    const invalido = await validarVinculo(input.proveedor_id, input.producto_id, codigo, precio);
    if (invalido) return fail(invalido);

    const { data, error } = await insertarTolerante(
      'producto_proveedor',
      {
        proveedor_id: input.proveedor_id,
        producto_id: input.producto_id,
        codigo_item_proveedor: codigo,
        precio_compra: precio,
        fecha_actualizacion: new Date().toISOString(),
      },
      '*, producto:producto_id(nombre, unidad_medida, precio_compra_actual)'
    );
    if (error || !data) return fail(mensajeError(error, 'No se pudo vincular el producto'));

    await registrarBitacora({
      usuario_id: usuario.id,
      accion: 'VINCULAR_PRODUCTO_PROVEEDOR',
      descripcion: `"${(prod as any).nombre}" vinculado a "${(prov as any).razon_social}" — código ${codigo ?? 's/c'}, precio Bs ${precio.toFixed(2)}`,
    });
    revalidatePath('/proveedores');
    return { ok: true, data: mapVinculo(data), mensaje: 'Producto vinculado al proveedor' };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo vincular el producto'));
  }
}

/** Subflujo: modificar precio pactado / código de ítem */
export async function actualizarVinculo(
  id: number,
  cambios: { codigo_item_proveedor?: string; precio_compra: number }
): Promise<ActionResult<VinculoProducto>> {
  try {
    const usuario = await requireUsuario();
    const db = getSupabase();
    const { data: actual } = await db
      .from('producto_proveedor')
      .select('*, producto:producto_id(nombre), proveedor:proveedor_id(razon_social)')
      .eq('id', id)
      .maybeSingle();
    if (!actual) return fail('El vínculo no existe');
    const a = actual as any;

    const precio = r2(Number(cambios.precio_compra));
    const codigo = limpiar(cambios.codigo_item_proveedor);
    const invalido = await validarVinculo(a.proveedor_id, a.producto_id, codigo, precio, id);
    if (invalido) return fail(invalido);

    const { data, error } = await actualizarTolerante(
      'producto_proveedor',
      { codigo_item_proveedor: codigo, precio_compra: precio, fecha_actualizacion: new Date().toISOString() },
      { columna: 'id', valor: id },
      '*, producto:producto_id(nombre, unidad_medida, precio_compra_actual)'
    );
    if (error || !data) return fail(mensajeError(error, 'No se pudo actualizar el vínculo'));

    const precioAnterior = num(a.precio_compra ?? a.precio_pactado);
    if (precioAnterior !== precio) {
      await registrarBitacora({
        usuario_id: usuario.id,
        accion: 'ACTUALIZAR_PRECIO_PROVEEDOR',
        descripcion: `Precio de "${a.producto?.nombre}" con "${a.proveedor?.razon_social}": Bs ${precioAnterior.toFixed(2)} → Bs ${precio.toFixed(2)}`,
      });
    }
    if ((a.codigo_item_proveedor ?? null) !== codigo) {
      await registrarBitacora({
        usuario_id: usuario.id,
        accion: 'ACTUALIZAR_CODIGO_PROVEEDOR',
        descripcion: `Código de "${a.producto?.nombre}" con "${a.proveedor?.razon_social}": ${a.codigo_item_proveedor ?? 's/c'} → ${codigo ?? 's/c'}`,
      });
    }
    revalidatePath('/proveedores');
    return { ok: true, data: mapVinculo(data), mensaje: 'Precio pactado actualizado' };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo actualizar el vínculo'));
  }
}

/** Quitar un producto del catálogo del proveedor */
export async function desvincularProducto(id: number): Promise<ActionResult> {
  try {
    const usuario = await requireUsuario();
    const db = getSupabase();
    const { data: actual } = await db
      .from('producto_proveedor')
      .select('*, producto:producto_id(nombre), proveedor:proveedor_id(razon_social)')
      .eq('id', id)
      .maybeSingle();
    if (!actual) return fail('El vínculo no existe');

    const { error } = await db.from('producto_proveedor').delete().eq('id', id);
    if (error) return fail(mensajeError(error, 'No se pudo quitar el producto'));

    const a = actual as any;
    await registrarBitacora({
      usuario_id: usuario.id,
      accion: 'DESVINCULAR_PRODUCTO_PROVEEDOR',
      descripcion: `"${a.producto?.nombre}" retirado del catálogo de "${a.proveedor?.razon_social}"`,
    });
    revalidatePath('/proveedores');
    return { ok: true, data: undefined, mensaje: 'Producto retirado del catálogo' };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo quitar el producto'));
  }
}

/** Subflujo: comparar precios de un producto entre todos sus proveedores */
export async function compararPrecios(productoId: number): Promise<ActionResult<ComparativoPrecio[]>> {
  try {
    await requireUsuario();
    const { data, error } = await getSupabase()
      .from('producto_proveedor')
      .select('*, proveedor:proveedor_id(*)')
      .eq('producto_id', productoId);
    if (error) return fail(error.message);
    const lista: ComparativoPrecio[] = ((data ?? []) as any[])
      .map((r: any) => ({
        proveedor_id: r.proveedor_id,
        razon_social: r.proveedor?.razon_social ?? `Proveedor #${r.proveedor_id}`,
        activo: r.proveedor?.estado !== false,
        codigo_item_proveedor: r.codigo_item_proveedor ?? null,
        precio_compra: num(r.precio_compra ?? r.precio_pactado),
        fecha_actualizacion: r.fecha_actualizacion ?? null,
      }))
      .sort((a, b) => a.precio_compra - b.precio_compra);
    return { ok: true, data: lista };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo comparar precios'));
  }
}
