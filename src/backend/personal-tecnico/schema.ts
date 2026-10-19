import { z } from 'zod'

export const guardarJornadaSchema = z
  .object({
    usuario_id: z.number().int().positive('ID de técnico inválido'),
    dia_semana: z
      .string()
      .trim()
      .min(1, 'Debe especificar los días de actividad.')
      .max(20, 'Los días no pueden exceder 20 caracteres.'),
    hora_inicio: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Hora de ingreso inválida (formato HH:mm).'),
    hora_fin: z
      .string()
      .trim()
      .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Hora de salida inválida (formato HH:mm).'),
  })
  .refine(
    (data) => {
      // Normalizar para comparación HH:mm
      const inicio = data.hora_inicio.slice(0, 5)
      const fin = data.hora_fin.slice(0, 5)
      return fin > inicio
    },
    {
      message: 'La hora de salida debe ser posterior a la hora de ingreso.',
      path: ['hora_fin'],
    },
  )

export type GuardarJornadaInput = z.infer<typeof guardarJornadaSchema>

export const registrarBloqueoSchema = z
  .object({
    usuario_id: z.number().int().positive('ID de técnico inválido'),
    fecha_inicio: z.string().trim().min(1, 'La fecha y hora de inicio son requeridas.'),
    fecha_fin: z.string().trim().min(1, 'La fecha y hora de fin son requeridas.'),
    motivo: z
      .string()
      .trim()
      .min(1, 'El motivo es obligatorio.')
      .max(255, 'El motivo no puede exceder 255 caracteres.'),
    tipo: z
      .string()
      .trim()
      .min(1, 'El tipo de ausencia es obligatorio.')
      .max(50, 'El tipo no puede exceder 50 caracteres.'),
  })
  .refine(
    (data) => {
      const inicio = new Date(data.fecha_inicio).getTime()
      const fin = new Date(data.fecha_fin).getTime()
      return !Number.isNaN(inicio) && !Number.isNaN(fin) && fin > inicio
    },
    {
      message: 'La fecha y hora de fin deben ser posteriores a las de inicio.',
      path: ['fecha_fin'],
    },
  )

export type RegistrarBloqueoInput = z.infer<typeof registrarBloqueoSchema>
