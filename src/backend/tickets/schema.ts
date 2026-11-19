import { z } from 'zod'
import {
  ESTADOS_TICKET,
  MSG_DESCRIPCION_OBLIGATORIA,
  MSG_SISTEMA_OBLIGATORIO,
  MSG_TIPO_OBLIGATORIO,
  MSG_URGENCIA_OBLIGATORIA,
  ORIGENES_TICKET,
  TIPOS_TICKET,
  URGENCIAS_TICKET,
} from './constantes'

/** Nuevo ticket (CU18, paso 3): mismos mensajes en el cliente y en el servidor. */
export const crearTicketSchema = z.object({
  sistema_instalado_id: z
    .number({ error: MSG_SISTEMA_OBLIGATORIO })
    .int(MSG_SISTEMA_OBLIGATORIO)
    .positive(MSG_SISTEMA_OBLIGATORIO),
  tipo_mantenimiento: z.enum(TIPOS_TICKET, { error: MSG_TIPO_OBLIGATORIO }),
  nivel_urgencia: z.enum(URGENCIAS_TICKET, { error: MSG_URGENCIA_OBLIGATORIA }),
  descripcion_incidencia: z
    .string({ error: MSG_DESCRIPCION_OBLIGATORIA })
    .trim()
    .min(1, MSG_DESCRIPCION_OBLIGATORIA)
    .max(2000, 'La descripción no puede superar los 2000 caracteres.'),
  origen: z.enum(ORIGENES_TICKET).default('MANUAL'),
})
export type CrearTicketInput = z.input<typeof crearTicketSchema>

export const cambiarEstadoTicketSchema = z.object({
  ticketId: z.number().int().positive('Ticket inválido'),
  estado: z.enum(ESTADOS_TICKET, { error: 'Estado de ticket inválido' }),
})

export const derivarTicketSchema = z.object({
  ticketId: z.number().int().positive('Ticket inválido'),
  fecha_programada: z.string().min(1, 'La ventana horaria es obligatoria para crear la orden de trabajo'),
  hora_inicio: z.string().min(1, 'La ventana horaria es obligatoria para crear la orden de trabajo'),
  hora_fin: z.string().min(1, 'La ventana horaria es obligatoria para crear la orden de trabajo'),
})
export type DerivarTicketInput = z.input<typeof derivarTicketSchema>

/** Primer mensaje de error de Zod (el que se muestra al usuario). */
export function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos inválidos'
}
