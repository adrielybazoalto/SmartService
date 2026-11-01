'use server';

/**
 * CU14 — Gestionar Proveedores y Catálogo de Mayoristas · Server Actions
 *
 *  - El usuario sale de la sesión del servidor (getCurrentUser, CU01), nunca
 *    de un parámetro: una Server Action es un endpoint público.
 *  - La IP se toma de las cabeceras de la petición, nunca del usuario.
 *  - Respuesta uniforme: { ok: true, data, mensaje } | { ok: false, error }.
 *  - En un archivo 'use server' solo se exportan funciones async (y tipos).
 */
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { tienePermisoModulo } from '@/lib/permisos';
import { obtenerIpOrigen } from '@/lib/ip';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  ProveedorError,
  actualizarItemCatalogo,
  actualizarProveedor,
  cambiarEstadoProveedor,
  compararPreciosProducto,
  listarProductosInventario,
  obtenerCatalogo,
  obtenerListaProveedores,
  quitarProductoCatalogo,
  registrarProveedor,
  verificarNitExistente,
  vincularProducto,
  type Auditoria,
  type ComparativoPrecios,
  type Db,
  type ItemCatalogo,
  type ItemCatalogoDTO,
  type ProductoInventario,
  type Proveedor,
  type ProveedorDTO,
} from '@/backend/proveedores';

export type Respuesta<T> = { ok: true; data: T; mensaje: string } | { ok: false; error: string };

const RUTA = '/proveedores';

// ---------------------------------------------------------------------------
// Contexto de la petición
// ---------------------------------------------------------------------------
async function contexto(): Promise<{ db: Db; auditoria: Auditoria }> {
  const u = (await getCurrentUser()) as any;
  const usuarioId = Number(u?.id ?? u?.uid);
  if (!u || !Number.isInteger(usuarioId) || usuarioId <= 0) {
    throw new ProveedorError('Sesión expirada. Vuelva a iniciar sesión.');
  }
  if (!(await tienePermisoModulo(RUTA))) throw new ProveedorError('No autorizado: tu rol no tiene el permiso de este módulo.');
  return {
    db: getSupabaseServiceClient() as unknown as Db,
    auditoria: { usuarioId, ip: await obtenerIpOrigen() },
  };
}

const exito = <T>(data: T, mensaje: string): Respuesta<T> => ({ ok: true, data, mensaje });

function fallo(e: unknown, porDefecto: string): { ok: false; error: string } {
  if (e instanceof ProveedorError) return { ok: false, error: e.message };
  console.error('[CU14]', e);
  return { ok: false, error: porDefecto };
}

const idValido = (id: unknown): id is number => Number.isInteger(id) && (id as number) > 0;

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

/** Lista de proveedores (incluye inactivos para que la vista pueda filtrarlos) */
export async function listarProveedoresAction(criterio = ''): Promise<Respuesta<Proveedor[]>> {
  try {
    const { db } = await contexto();
    const lista = await obtenerListaProveedores(db, criterio, true);
    return exito(lista, `${lista.length} proveedor(es)`);
  } catch (e) {
    return fallo(e, 'No se pudieron obtener los proveedores');
  }
}

export async function listarProductosInventarioAction(): Promise<Respuesta<ProductoInventario[]>> {
  try {
    const { db } = await contexto();
    const productos = await listarProductosInventario(db);
    return exito(productos, `${productos.length} producto(s) en inventario`);
  } catch (e) {
    return fallo(e, 'No se pudieron obtener los productos');
  }
}

export async function obtenerCatalogoAction(proveedorId: number): Promise<Respuesta<ItemCatalogo[]>> {
  try {
    if (!idValido(proveedorId)) return { ok: false, error: 'Proveedor inválido' };
    const { db } = await contexto();
    const catalogo = await obtenerCatalogo(db, proveedorId);
    return exito(catalogo, `${catalogo.length} producto(s) en el catálogo`);
  } catch (e) {
    return fallo(e, 'No se pudo obtener el catálogo');
  }
}

/** Para avisar en el formulario apenas se escribe un NIT repetido */
export async function verificarNitAction(nit: string, excluirId?: number): Promise<Respuesta<{ existe: boolean }>> {
  try {
    const { db } = await contexto();
    const existe = await verificarNitExistente(db, String(nit ?? ''), excluirId);
    return exito({ existe }, existe ? 'El NIT ya está registrado' : 'NIT disponible');
  } catch (e) {
    return fallo(e, 'No se pudo verificar el NIT');
  }
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------
export async function registrarProveedorAction(dto: ProveedorDTO): Promise<Respuesta<Proveedor>> {
  try {
    const { db, auditoria } = await contexto();
    const proveedor = await registrarProveedor(db, dto, auditoria);
    revalidatePath(RUTA);
    return exito(proveedor, `Proveedor "${proveedor.razon_social}" registrado`);
  } catch (e) {
    return fallo(e, 'No se pudo registrar el proveedor');
  }
}

export async function actualizarProveedorAction(id: number, dto: ProveedorDTO): Promise<Respuesta<Proveedor>> {
  try {
    if (!idValido(id)) return { ok: false, error: 'Proveedor inválido' };
    const { db, auditoria } = await contexto();
    const proveedor = await actualizarProveedor(db, id, dto, auditoria);
    revalidatePath(RUTA);
    return exito(proveedor, 'Proveedor actualizado');
  } catch (e) {
    return fallo(e, 'No se pudo actualizar el proveedor');
  }
}

export async function cambiarEstadoProveedorAction(id: number, activo: boolean): Promise<Respuesta<Proveedor>> {
  try {
    if (!idValido(id)) return { ok: false, error: 'Proveedor inválido' };
    const { db, auditoria } = await contexto();
    const proveedor = await cambiarEstadoProveedor(db, id, activo === true, auditoria);
    revalidatePath(RUTA);
    return exito(proveedor, activo ? 'Proveedor reactivado' : 'Proveedor desactivado');
  } catch (e) {
    return fallo(e, 'No se pudo cambiar el estado del proveedor');
  }
}

// ---------------------------------------------------------------------------
// Catálogo del mayorista
// ---------------------------------------------------------------------------
export async function vincularProductoAction(proveedorId: number, dto: ItemCatalogoDTO): Promise<Respuesta<ItemCatalogo>> {
  try {
    if (!idValido(proveedorId)) return { ok: false, error: 'Proveedor inválido' };
    const { db, auditoria } = await contexto();
    const item = await vincularProducto(db, proveedorId, dto, auditoria);
    revalidatePath(RUTA);
    return exito(item, `"${item.producto_nombre}" agregado al catálogo`);
  } catch (e) {
    return fallo(e, 'No se pudo agregar el producto al catálogo');
  }
}

export async function actualizarItemCatalogoAction(
  proveedorId: number,
  productoId: number,
  dto: { codigoItemProveedor?: string | null; precioCompra: number | string }
): Promise<Respuesta<ItemCatalogo>> {
  try {
    if (!idValido(proveedorId) || !idValido(productoId)) return { ok: false, error: 'Datos inválidos' };
    const { db, auditoria } = await contexto();
    const item = await actualizarItemCatalogo(db, proveedorId, productoId, dto, auditoria);
    revalidatePath(RUTA);
    return exito(item, 'Catálogo actualizado');
  } catch (e) {
    return fallo(e, 'No se pudo actualizar el catálogo');
  }
}

export async function quitarProductoCatalogoAction(proveedorId: number, productoId: number): Promise<Respuesta<ItemCatalogo>> {
  try {
    if (!idValido(proveedorId) || !idValido(productoId)) return { ok: false, error: 'Datos inválidos' };
    const { db, auditoria } = await contexto();
    const item = await quitarProductoCatalogo(db, proveedorId, productoId, auditoria);
    revalidatePath(RUTA);
    return exito(item, `"${item.producto_nombre}" retirado del catálogo`);
  } catch (e) {
    return fallo(e, 'No se pudo quitar el producto del catálogo');
  }
}

// ---------------------------------------------------------------------------
// Subflujo "Comparar precios"
// ---------------------------------------------------------------------------
export async function compararPreciosAction(productoId: number): Promise<Respuesta<ComparativoPrecios>> {
  try {
    if (!idValido(productoId)) return { ok: false, error: 'Seleccione un producto' };
    const { db } = await contexto();
    const comparativo = await compararPreciosProducto(db, productoId);
    const n = comparativo.ofertas.length;
    return exito(comparativo, n ? `${n} proveedor(es) ofrecen este producto` : 'Ningún proveedor ofrece este producto');
  } catch (e) {
    return fallo(e, 'No se pudo obtener el comparativo de precios');
  }
}
