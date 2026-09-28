import { z } from 'zod'

/** Evento de auditoría (CU05 requiere 'ACTUALIZAR_PERFIL' para cambios de perfil). */
export const registrarBitacoraSchema = z.object({
  usuario_id: z.number().int().positive(),
  accion: z.string().min(1, 'La acción es obligatoria').max(100),
  descripcion: z.string().max(1000).nullable().optional(),
})

export type RegistrarBitacoraInput = z.infer<typeof registrarBitacoraSchema>