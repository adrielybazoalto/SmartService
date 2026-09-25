import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

export type Caja = Tables<'caja'>
export type NuevaCaja = TablesInsert<'caja'>
export type CajaUpdate = TablesUpdate<'caja'>

export type Venta = Tables<'venta'>
export type NuevaVenta = TablesInsert<'venta'>
export type VentaUpdate = TablesUpdate<'venta'>

export type DetalleVenta = Tables<'detalle_venta'>
export type NuevoDetalleVenta = TablesInsert<'detalle_venta'>

/** Convención de la aplicación (el esquema no define CHECK). */
export const ESTADO_CAJA = ['ABIERTA', 'CERRADA'] as const
export const ESTADO_VENTA = ['EMITIDA', 'PAGADA', 'ANULADA'] as const
export const TIPO_COMPROBANTE = ['FACTURA', 'BOLETA', 'RECIBO'] as const

export type EstadoCaja = (typeof ESTADO_CAJA)[number]
export type EstadoVenta = (typeof ESTADO_VENTA)[number]