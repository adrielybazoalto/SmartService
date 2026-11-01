import { z } from 'zod'

/** El navegador solo elige qué y cuánto: precios y total los calcula la base. */
export const guardarCotizacionSchema = z.object({
  cliente_id: z.number().int().positive('Debe seleccionar un cliente'),
  establecimiento_id: z.number().int().positive().nullable().optional(),
  productos: z
    .array(
      z.object({
        producto_id: z.number().int().positive(),
        cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
      }),
    )
    .default([]),
  servicios: z
    .array(
      z.object({
        servicio_id: z.number().int().positive(),
        horas_estimadas: z.coerce.number().positive('Las horas deben ser mayores a 0'),
      }),
    )
    .default([]),
})

export type GuardarCotizacionInput = z.input<typeof guardarCotizacionSchema>
