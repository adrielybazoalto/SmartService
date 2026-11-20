import { z } from 'zod'
import { MSG_ALERTA_ID_INVALIDO } from './constantes'

/** Subflujo "marcar como leída": el id llega desde el cliente y se valida. */
export const marcarAlertaLeidaSchema = z.object({
  alertaId: z
    .number({ error: MSG_ALERTA_ID_INVALIDO })
    .int(MSG_ALERTA_ID_INVALIDO)
    .positive(MSG_ALERTA_ID_INVALIDO),
})
export type MarcarAlertaLeidaInput = z.input<typeof marcarAlertaLeidaSchema>

/** Primer mensaje de error de Zod (el que se muestra al usuario). */
export function primerError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Datos inválidos'
}
