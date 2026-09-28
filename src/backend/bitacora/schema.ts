import { z } from 'zod'

/** Usado por OTROS módulos para registrar un evento sensible. */
export const registrarEventoSchema = z.object({
  usuario_id: z.number().int().positive(),
  accion: z.string().min(1, 'La acción es obligatoria').max(100),
  descripcion: z.string().nullable().optional(),
})

/** Filtros del flujo principal del CU06: rango de fechas, usuario, tipo de acción. */
export const filtrarBitacoraSchema = z.object({
  fecha_inicio: z.string().datetime().nullable().optional(),
  fecha_fin: z.string().datetime().nullable().optional(),
  usuario_id: z.number().int().positive().nullable().optional(),
  accion: z.string().max(100).nullable().optional(),
})

export type RegistrarEventoInput = z.infer<typeof registrarEventoSchema>
export type FiltrarBitacoraInput = z.infer<typeof filtrarBitacoraSchema>