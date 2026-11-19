'use client'

import { useId } from 'react'
import { LoaderCircle, Mic, MicOff, Square } from 'lucide-react'
import { useVoiceRecognition } from '@/lib/voz/use-voice-recognition'
import { MSG_NAVEGADOR_SIN_VOZ, mensajeErrorVoz } from '@/lib/voz/mensajes'

/**
 * Botón de dictado por voz, genérico (CU18; se reutilizará en el CU20).
 * Estados: inactivo / escuchando (animación) / procesando. Muestra la
 * transcripción en vivo en una región aria-live. Si el navegador no admite la
 * Web Speech API, se muestra deshabilitado con el motivo: el formulario manual sigue igual.
 *
 * `redondo`: micrófono circular solo con ícono (cabecera de la página); los
 * avisos salen en un globo debajo, alineado a la derecha.
 */
export function VoiceButton({
  onResult,
  etiqueta,
  ayuda,
  procesando = false,
  disabled = false,
  lang,
  silencioMs,
  mostrarTranscripcion = true,
  redondo = false,
  className = '',
}: {
  /** Texto final dictado (no vacío). */
  onResult: (texto: string) => void
  /** Texto visible del botón (en `redondo`, solo accesible); sin él, solo el ícono. */
  etiqueta?: string
  /** Sugerencia mientras escucha (p. ej. una frase de ejemplo). */
  ayuda?: string
  /** El llamador está interpretando el resultado (p. ej. buscando en el servidor). */
  procesando?: boolean
  disabled?: boolean
  lang?: string
  silencioMs?: number
  mostrarTranscripcion?: boolean
  redondo?: boolean
  className?: string
}) {
  const voz = useVoiceRecognition({ lang, silencioMs, onFinal: onResult })
  const idAviso = useId()

  const nombre = etiqueta ?? 'Dictado por voz'
  const contenedor = redondo ? `relative flex flex-col items-end ${className}` : `flex flex-col gap-1.5 ${className}`
  const globo = redondo
    ? 'absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2.5 text-xs shadow-lg'
    : 'text-xs'

  if (!voz.isSupported) {
    // Se muestra igual, deshabilitado, para que el usuario sepa que existe y por qué no puede usarlo
    return (
      <div className={`group ${contenedor}`}>
        <button
          type="button"
          disabled
          aria-label={`${nombre}: no disponible en este navegador`}
          aria-describedby={idAviso}
          title={MSG_NAVEGADOR_SIN_VOZ}
          className={
            redondo
              ? 'inline-flex h-12 w-12 cursor-not-allowed items-center justify-center rounded-full bg-slate-200 text-slate-400'
              : 'inline-flex min-h-10 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-400'
          }
        >
          <MicOff className="h-5 w-5" aria-hidden="true" />
          {etiqueta && !redondo && <span>{etiqueta}</span>}
        </button>
        <p id={idAviso} className={redondo ? `${globo} hidden text-slate-600 group-hover:block` : 'text-xs text-slate-500'}>
          {MSG_NAVEGADOR_SIN_VOZ}
        </p>
      </div>
    )
  }

  const ocupado = procesando || voz.estado === 'procesando'
  const escuchando = voz.isListening
  const ariaLabel = escuchando ? `Detener: ${nombre}` : ocupado ? `${nombre}: procesando` : `Iniciar: ${nombre}`

  const colores = redondo
    ? escuchando
      ? 'bg-red-600 text-white shadow-red-200 hover:bg-red-700'
      : 'bg-lime-400 text-slate-900 shadow-lime-200/60 hover:bg-lime-300'
    : escuchando
      ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
      : 'border-lime-300 bg-lime-50 text-lime-800 hover:bg-lime-100'
  const forma = redondo
    ? 'h-12 w-12 rounded-full shadow-md'
    : 'min-h-10 gap-2 rounded-xl border px-3 py-2 text-sm font-semibold'

  const mostrarVivo = mostrarTranscripcion && (voz.transcript || voz.interimTranscript) && (escuchando || ocupado)
  const hayGlobo = escuchando || mostrarVivo || voz.error

  return (
    <div className={contenedor}>
      <button
        type="button"
        onClick={escuchando ? voz.stop : voz.start}
        disabled={disabled || (ocupado && !escuchando)}
        aria-label={ariaLabel}
        aria-pressed={escuchando}
        title={ariaLabel}
        className={`relative inline-flex cursor-pointer items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${forma} ${colores}`}
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          {escuchando && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60" aria-hidden="true" />
          )}
          {ocupado && !escuchando ? (
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : escuchando ? (
            <Square className="relative h-4 w-4 fill-current" aria-hidden="true" />
          ) : (
            <Mic className="relative h-5 w-5" aria-hidden="true" />
          )}
        </span>
        {etiqueta && !redondo && <span>{escuchando ? 'Detener' : ocupado ? 'Procesando…' : etiqueta}</span>}
      </button>

      <div aria-live="polite" className={redondo && !hayGlobo ? 'sr-only' : globo}>
        {escuchando && (
          <p className="text-red-700">
            Escuchando… {ayuda && <span className="text-slate-500">{ayuda}</span>}
          </p>
        )}
        {mostrarVivo && (
          <p className="mt-0.5 rounded-lg bg-slate-50 px-2 py-1 text-slate-700">
            {voz.transcript} <span className="text-slate-400 italic">{voz.interimTranscript}</span>
          </p>
        )}
        {voz.error && (
          <p role="alert" className="text-red-700">
            {mensajeErrorVoz(voz.error)}
          </p>
        )}
      </div>
    </div>
  )
}
