import type { Db } from '@/lib/supabase/types'
import {
  actualizarProveedorSchema,
  asociarProductoProveedorSchema,
  crearProveedorSchema,
  type ActualizarProveedorInput,
  type AsociarProductoProveedorInput,
  type CrearProveedorInput,
} from './schema'
import type { NuevoProductoProveedor, NuevoProveedor, Proveedor } from './types'

export async function listarProveedores(db: Db): Promise<Proveedor[]> {
  const { data, error } = await db.from('proveedor').select('*').order('razon_social', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los proveedores: ${error.message}`)
  return data
}

export async function getProveedorPorId(db: Db, id: number): Promise<Proveedor> {
  const { data, error } = await db.from('proveedor').select('*').eq('id', id).single()
  if (error) throw new Error(`No se encontró el proveedor: ${error.message}`)
  return data
}

export async function crearProveedor(db: Db, input: CrearProveedorInput): Promise<Proveedor> {
  const parsed = crearProveedorSchema.parse(input)
  const { data, error } = await db
    .from('proveedor')
    .insert(parsed as NuevoProveedor)
    .select()
    .single()
  if (error) throw new Error(`No se pudo crear el proveedor: ${error.message}`)
  return data
}

export async function actualizarProveedor(
  db: Db,
  id: number,
  input: ActualizarProveedorInput,
): Promise<Proveedor> {
  const parsed = actualizarProveedorSchema.parse(input)
  const { data, error } = await db.from('proveedor').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`No se pudo actualizar el proveedor: ${error.message}`)
  return data
}

export async function eliminarProveedor(db: Db, id: number): Promise<void> {
  const { error } = await db.from('proveedor').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar el proveedor: ${error.message}`)
}

// ---------------------------------------------------------------------------
// RELACIÓN PROVEEDOR ↔ PRODUCTO
// ---------------------------------------------------------------------------

export async function listarProductosDeProveedor(db: Db, proveedorId: number) {
  const { data, error } = await db
    .from('producto_proveedor')
    .select('*, producto(*)')
    .eq('proveedor_id', proveedorId)
  if (error) throw new Error(`No se pudieron cargar los productos del proveedor: ${error.message}`)
  return data
}

export async function asociarProductoAProveedor(
  db: Db,
  input: AsociarProductoProveedorInput,
): Promise<void> {
  const payload = asociarProductoProveedorSchema.parse(input)
  const { error } = await db.from('producto_proveedor').insert(payload as NuevoProductoProveedor)
  if (error) throw new Error(`No se pudo asociar el producto al proveedor: ${error.message}`)
}

export async function desasociarProductoDeProveedor(
  db: Db,
  productoId: number,
  proveedorId: number,
): Promise<void> {
  const { error } = await db
    .from('producto_proveedor')
    .delete()
    .eq('producto_id', productoId)
    .eq('proveedor_id', proveedorId)
  if (error) throw new Error(`No se pudo desasociar el producto: ${error.message}`)
}