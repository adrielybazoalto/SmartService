import { z } from 'zod'
import { parseDiasSemana } from '@/backend/asignaciones/disponibilidad'

/** Tipos de ausencia del CU10. */
export const TIPOS_AUSENCIA = ['Vacaciones', 'Baja Médica', 'Permiso Particular', 'Feriado', 'Capacitación'] as const

/** Hora local sin zona, tal como la entrega un input datetime-local. */
const FECHA_HORA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/

export const guardarJornadaSchema = z
  .object({
    usuario_id: z.number().int().positive('ID de técnico inválido'),
    dia_semana: z
      .string()
      .trim()
      .min(1, 'Debe especificar los días de actividad.')
      .max(20, 'Los días no pueden exceder 20 caracteres.')
      .refine((dias) => parseDiasSemana(dias).length > 0, {
        message: "Días no reconocidos. Use por ejemplo 'Lunes a Viernes' o 'Lunes, Miércoles y Viernes'",
      }),
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
    fecha_inicio: z.string().trim().regex(FECHA_HORA, 'La fecha y hora de inicio son requeridas.'),
    fecha_fin: z.string().trim().regex(FECHA_HORA, 'La fecha y hora de fin son requeridas.'),
    motivo: z
      .string()
      .trim()
      .min(1, 'El motivo es obligatorio.')
      .max(255, 'El motivo no puede exceder 255 caracteres.'),
    tipo: z.enum(TIPOS_AUSENCIA, { message: 'El tipo de ausencia no es válido.' }),
  })
  .refine((data) => data.fecha_fin > data.fecha_inicio, {
    message: 'La fecha y hora de fin deben ser posteriores a las de inicio',
    path: ['fecha_fin'],
  })

export type RegistrarBloqueoInput = z.infer<typeof registrarBloqueoSchema>
