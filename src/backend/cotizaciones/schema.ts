import { z } from 'zod'
import { ESTADO_COTIZACION } from './types'

export const detalleProductoInputSchema = z.object({
  producto_id: z.number().int().positive(),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  precio_unitario: z.coerce.number().min(0),
})

export const detalleServicioInputSchema = z.object({
  servicio_id: z.number().int().positive(),
  horas_estimadas: z.coerce.number().positive('Las horas deben ser mayores a 0'),
  precio_hora: z.coerce.number().min(0),
})

export const crearCotizacionSchema = z.object({
  cliente_id: z.number().int().positive('Debe seleccionar un cliente'),
  establecimiento_id: z.number().int().positive().nullable().optional(),
  usuario_id: z.number().int().positive(),
  numero_cotizacion: z.string().min(1, 'El número de cotización es obligatorio').max(50),
  fecha_emision: z.string().date('Fecha inválida').optional(),
  fecha_vencimiento: z.string().date('Fecha de vencimiento inválida'),
  estado: z.enum(ESTADO_COTIZACION).default('PENDIENTE'),
  items_producto: z.array(detalleProductoInputSchema).default([]),
  items_servicio: z.array(detalleServicioInputSchema).default([]),
})

export const actualizarEstadoCotizacionSchema = z.object({
  estado: z.enum(ESTADO_COTIZACION),
})

export type DetalleProductoInput = z.infer<typeof detalleProductoInputSchema>
export type DetalleServicioInput = z.infer<typeof detalleServicioInputSchema>
export type CrearCotizacionInput = z.infer<typeof crearCotizacionSchema>
export type ActualizarEstadoCotizacionInput = z.infer<typeof actualizarEstadoCotizacionSchema>