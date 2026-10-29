import { z } from 'zod'
import { ESTADO_ORDEN } from './types'

export const crearOrdenTrabajoSchema = z.object({
  cotizacion_id: z.number().int().positive().nullable().optional(),
  mantenimiento_ticket_id: z.number().int().positive().nullable().optional(),
  codigo_orden: z.string().min(1, 'El código de orden es obligatorio').max(50),
  tipo_trabajo: z.string().min(1, 'El tipo de trabajo es obligatorio').max(100),
  estado: z.enum(ESTADO_ORDEN).default('PROGRAMADA'),
  fecha_inicio_programada: z
    .string()
    .datetime({ offset: true, message: 'Fecha inválida' })
    .nullable()
    .optional(),
  fecha_fin_programada: z
    .string()
    .datetime({ offset: true, message: 'Fecha inválida' })
    .nullable()
    .optional(),
  observaciones_tecnico: z.string().nullable().optional(),
})

export const actualizarEstadoOrdenTrabajoSchema = z.object({
  estado: z.enum(ESTADO_ORDEN),
})

export const crearConsumoMaterialSchema = z.object({
  orden_trabajo_id: z.number().int().positive(),
  producto_id: z.number().int().positive(),
  cantidad_utilizada: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  observacion: z.string().nullable().optional(),
})

export const crearNotaServicioSchema = z.object({
  orden_trabajo_id: z.number().int().positive(),
  numero_nota: z.string().min(1, 'El número de nota es obligatorio').max(50),
  anticipo_pagado: z.coerce.number().min(0).default(0),
  estado: z.string().max(30).default('PENDIENTE'),
  monto_total: z.coerce.number().min(0, 'El monto total es obligatorio'),
})

export const procesarReporteCampoSchema = z.object({
  ordenId: z.number().int().positive(),
  diagnostico: z.string().min(1, 'El diagnóstico es obligatorio'),
  materiales: z
    .array(
      z.object({
        producto_id: z.number().int().positive(),
        cantidad_utilizada: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
        observacion: z.string().nullable().optional(),
      }),
    )
    .min(0)
    .optional()
    .default([]),
})

export type CrearOrdenTrabajoInput = z.infer<typeof crearOrdenTrabajoSchema>
export type ActualizarEstadoOrdenTrabajoInput = z.infer<typeof actualizarEstadoOrdenTrabajoSchema>
export type CrearConsumoMaterialInput = z.infer<typeof crearConsumoMaterialSchema>
export type CrearNotaServicioInput = z.infer<typeof crearNotaServicioSchema>
export type ProcesarReporteCampoInput = z.infer<typeof procesarReporteCampoSchema>