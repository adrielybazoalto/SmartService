import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

export type Proveedor = Tables<'proveedor'>
export type NuevoProveedor = TablesInsert<'proveedor'>
export type ProveedorUpdate = TablesUpdate<'proveedor'>

export type ProductoProveedor = Tables<'producto_proveedor'>
export type NuevoProductoProveedor = TablesInsert<'producto_proveedor'>