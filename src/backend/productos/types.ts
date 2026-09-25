import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

export type CategoriaProducto = Tables<'categoria_producto'>
export type NuevaCategoriaProducto = TablesInsert<'categoria_producto'>
export type CategoriaProductoUpdate = TablesUpdate<'categoria_producto'>

export type Producto = Tables<'producto'>
export type NuevoProducto = TablesInsert<'producto'>
export type ProductoUpdate = TablesUpdate<'producto'>

export type ImagenProducto = Tables<'imagen_producto'>
export type NuevaImagenProducto = TablesInsert<'imagen_producto'>

export type MovimientoKardex = Tables<'movimiento_kardex'>
export type NuevoMovimientoKardex = TablesInsert<'movimiento_kardex'>

export const TIPO_MOVIMIENTO = ['ENTRADA', 'SALIDA', 'AJUSTE'] as const
export type TipoMovimiento = (typeof TIPO_MOVIMIENTO)[number]