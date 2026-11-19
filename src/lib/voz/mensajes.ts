import type { ErrorVoz } from './use-voice-recognition'

/** Mensajes del dictado por voz (textos exactos del CU18; genéricos para el CU20). */
export const MSG_MICROFONO = 'Debe permitir el acceso al micrófono para usar el dictado por voz.'
export const MSG_NO_ENTENDIDO =
  'No se pudo entender el dictado, intente nuevamente o complete el formulario manualmente.'
export const MSG_SIN_MICROFONO = 'No se detectó un micrófono. Conecte uno o complete el formulario manualmente.'
export const MSG_NAVEGADOR_SIN_VOZ =
  'Este navegador no admite el dictado por voz. Use Chrome o Edge (con HTTPS o localhost), o complete el formulario manualmente.'
export const MSG_RED = 'No hay conexión con el servicio de reconocimiento de voz. Revise su conexión a internet.'

export function mensajeErrorVoz(error: ErrorVoz): string {
  switch (error) {
    case 'not-allowed':
      return MSG_MICROFONO
    case 'audio-capture':
      return MSG_SIN_MICROFONO
    case 'network':
      return MSG_RED
    case 'no-speech':
    case 'desconocido':
      return MSG_NO_ENTENDIDO
  }
}
