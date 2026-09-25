import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

export type Cotizacion = Tables<'cotizacion'>
export type NuevaCotizacion = TablesInsert<'cotizacion'>
export type CotizacionUpdate = TablesUpdate<'cotizacion'>

export type DetalleCotizacionProducto = Tables<'detalle_cotizacion_producto'>
export type NuevoDetalleCotizacionProducto = TablesInsert<'detalle_cotizacion_producto'>

export type DetalleCotizacionServicio = Tables<'detalle_cotizacion_servicio'>
export type NuevoDetalleCotizacionServicio = TablesInsert<'detalle_cotizacion_servicio'>

export const ESTADO_COTIZACION = ['PENDIENTE', 'APROBADA', 'RECHAZADA'] as const
export type EstadoCotizacion = (typeof ESTADO_COTIZACION)[number]