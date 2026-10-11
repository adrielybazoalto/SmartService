import { z } from 'zod'

/**
 * Evento de auditoría (CU05: 'ACTUALIZAR_PERFIL' / 'CAMBIAR_CONTRASENA').
 * `fecha_hora` se completa con CURRENT_TIMESTAMP en la BD.
 */
export const registrarBitacoraSchema = z.object({
  usuario_id: z.number().int().positive(),
  accion: z.string().min(1, 'La acción es obligatoria').max(100),
  descripcion: z.string().max(1000).nullable().optional(),
})

/** Usado por OTROS módulos para registrar un evento sensible (CU06). */
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
  ip_origen: z.string().regex(/^[0-9a-fA-F:.]{1,45}$/, 'Dirección IP inválida').nullable().optional(),
})

export type RegistrarBitacoraInput = z.infer<typeof registrarBitacoraSchema>
export type RegistrarEventoInput = z.infer<typeof registrarEventoSchema>
export type FiltrarBitacoraInput = z.infer<typeof filtrarBitacoraSchema>