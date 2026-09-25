import { z } from 'zod'

export const crearEstablecimientoSchema = z.object({
  cliente_id: z.number().int().positive('Debe seleccionar un cliente'),
  nombre_establecimiento: z.string().min(2).max(150),
  direccion: z.string().nullable().optional(),
  tipo_inmueble: z.string().max(50).nullable().optional(),
  latitud: z.string().nullable().optional(),
  longitud: z.string().nullable().optional(),
})

export const actualizarEstablecimientoSchema = crearEstablecimientoSchema.partial()

export const crearSistemaInstaladoSchema = z.object({
  orden_trabajo_id: z.number().int().positive().nullable().optional(),
  establecimiento_id: z.number().int().positive('Debe seleccionar un establecimiento'),
  nombre_sistema: z.string().min(2).max(150),
  fecha_instalacion: z.string().date('Fecha de instalación inválida').nullable().optional(),
  numero_serie: z.string().max(100).nullable().optional(),
  periodicidad_meses: z.number().int().min(1).max(24).default(6),
  fecha_ultimo_mantenimiento: z
    .string()
    .date('Fecha inválida')
    .nullable()
    .optional(),
  fecha_proximo_mantenimiento: z.string().date('Fecha inválida').nullable().optional(),
  observaciones: z.string().nullable().optional(),
})

export const actualizarSistemaInstaladoSchema = crearSistemaInstaladoSchema
  .omit({ fecha_proximo_mantenimiento: true })
  .partial()

export type CrearEstablecimientoInput = z.infer<typeof crearEstablecimientoSchema>
export type ActualizarEstablecimientoInput = z.infer<typeof actualizarEstablecimientoSchema>
export type CrearSistemaInstaladoInput = z.infer<typeof crearSistemaInstaladoSchema>
export type ActualizarSistemaInstaladoInput = z.infer<typeof actualizarSistemaInstaladoSchema>