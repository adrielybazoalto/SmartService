import { z } from 'zod'
import { ESTADO_VENTA, TIPO_COMPROBANTE } from './types'

export const abrirCajaSchema = z.object({
  usuario_id: z.number().int().positive(),
  monto_inicial: z.coerce.number().min(0, 'El monto inicial no puede ser negativo'),
})

export const cerrarCajaSchema = z.object({
  monto_final_real: z.coerce.number().min(0, 'El monto final real no puede ser negativo'),
})

export const detalleVentaInputSchema = z.object({
  producto_id: z.number().int().positive(),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  precio_unitario: z.coerce.number().min(0),
})

export const crearVentaSchema = z.object({
  caja_id: z.number().int().positive(),
  cliente_id: z.number().int().positive('Debe seleccionar un cliente'),
  usuario_id: z.number().int().positive(),
  cotizacion_id: z.number().int().positive().nullable().optional(),
  orden_trabajo_id: z.number().int().positive().nullable().optional(),
  tipo_comprobante: z.enum(TIPO_COMPROBANTE, {
    message: 'Debe seleccionar el tipo de comprobante',
  }),
  nro_comprobante: z.string().max(50).nullable().optional(),
  descuento: z.coerce.number().min(0).default(0),
  estado: z.enum(ESTADO_VENTA).default('EMITIDA'),
  items: z.array(detalleVentaInputSchema).min(1, 'Debe agregar al menos un ítem'),
})

export type AbrirCajaInput = z.infer<typeof abrirCajaSchema>
export type CerrarCajaInput = z.infer<typeof cerrarCajaSchema>
export type DetalleVentaInput = z.infer<typeof detalleVentaInputSchema>
export type CrearVentaInput = z.infer<typeof crearVentaSchema>