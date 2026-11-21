'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, Mic, MicOff, X } from 'lucide-react'
import { useVoiceRecognition } from '@/lib/voz/use-voice-recognition'
import { MSG_NAVEGADOR_SIN_VOZ, mensajeErrorVoz } from '@/lib/voz/mensajes'
import { interpretarComandoVoz } from '@/lib/voz/intenciones-navegacion'

type TipoAviso = 'exito' | 'error' | 'info'
interface Aviso {
  tipo: TipoAviso
  texto: string
}

/**
 * Asistente de Navegación por Voz GLOBAL (solo ADMINISTRADOR).
 *
 * Se monta una sola vez en el layout autenticado (SidebarShell), por lo que
 * está disponible en cualquier pantalla de P1..P4. El rol se resuelve en el
 * servidor (`getCurrentUser`) y se pasa como prop; la comprobación se repite
 * aquí como defensa en profundidad: para cualquier otro rol no se renderiza
 * nada y, por tanto, nunca se activa el micrófono.
 *
 * Posición: esquina superior derecha del área de contenido, igual en todas las
 * rutas autenticadas (incluido CU18, que ya no tiene micrófono local propio).
 */
export function AsistenteVozGlobal({ esAdministrador }: { esAdministrador: boolean }) {
  const router = useRouter()
  const [aviso, setAviso] = useState<Aviso | null>(null)

  const alTerminar = useCallback(
    (texto: string) => {
      const resultado = interpretarComandoVoz(texto)
      if (resultado.tipo === 'navegacion') {
        setAviso({ tipo: 'exito', texto: `Entendido: ${resultado.resumen}. Abriendo…` })
        router.push(resultado.destino)
      } else {
        setAviso({ tipo: 'error', texto: resultado.mensaje })
      }
    },
    [router],
  )

  const voz = useVoiceRecognition({
    lang: 'es-BO',
    langAlternativo: 'es-ES',
    silencioMs: 2600,
    onFinal: alTerminar,
  })

  // El aviso se retira solo, pero nunca mientras se está escuchando.
  useEffect(() => {
    if (!aviso || voz.isListening) return
    const temporizador = setTimeout(() => setAviso(null), 7000)
    return () => clearTimeout(temporizador)
  }, [aviso, voz.isListening])

  // Al empezar, limpiamos avisos y transcripción anteriores.
  function iniciar() {
    if (!voz.isSupported) {
      setAviso({ tipo: 'error', texto: MSG_NAVEGADOR_SIN_VOZ })
      return
    }
    setAviso(null)
    voz.start()
  }

  if (!esAdministrador) return null

  const escuchando = voz.isListening
  const procesando = voz.estado === 'procesando' && !escuchando
  const posicion = 'right-4 top-16 md:right-6 md:top-4'

  const textoVivo = [voz.transcript, voz.interimTranscript].filter(Boolean).join(' ').trim()
  const mensajeError = voz.error ? mensajeErrorVoz(voz.error) : null
  const mostrarGlobo = escuchando || Boolean(textoVivo) || Boolean(aviso) || Boolean(mensajeError)
  const ariaLabel = escuchando
    ? 'Detener dictado del asistente de voz'
    : procesando
      ? 'Asistente de voz procesando la instrucción'
      : 'Iniciar asistente de navegación por voz'

  return (
    <div className={`fixed z-50 flex flex-col items-end ${posicion}`}>
      {mostrarGlobo && (
        <div
          className="absolute bottom-full right-0 mb-3 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-lime-200 bg-white p-3 text-left shadow-xl shadow-slate-900/10"
          aria-live="polite"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-lime-700">
              Asistente de voz
            </p>
            <button
              type="button"
              onClick={() => {
                setAviso(null)
                voz.reset()
              }}
              aria-label="Cerrar aviso del asistente de voz"
              className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {escuchando && (
            <p className="text-sm font-medium text-slate-700">
              Escuchando… diga, por ejemplo: «llévame a tickets de soporte».
            </p>
          )}

          {textoVivo && (
            <p className="mt-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
              <span className="sr-only">Transcripción: </span>
              {textoVivo}
            </p>
          )}

          {aviso && (
            <p
              role={aviso.tipo === 'error' ? 'alert' : 'status'}
              className={`mt-1.5 text-sm ${
                aviso.tipo === 'error'
                  ? 'font-medium text-rose-700'
                  : aviso.tipo === 'exito'
                    ? 'font-medium text-emerald-700'
                    : 'text-slate-600'
              }`}
            >
              {aviso.texto}
            </p>
          )}

          {mensajeError && (
            <p role="alert" className="mt-1.5 text-sm font-medium text-rose-700">
              {mensajeError}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={escuchando ? voz.stop : iniciar}
        aria-label={ariaLabel}
        aria-pressed={escuchando}
        aria-disabled={!voz.isSupported}
        title={voz.isSupported ? ariaLabel : MSG_NAVEGADOR_SIN_VOZ}
        className="relative inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-lime-500 text-white shadow-lg shadow-lime-300/60 ring-2 ring-white transition-all hover:bg-lime-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-lime-300 aria-disabled:cursor-help"
      >
        {escuchando && (
          <>
            <span
              className="absolute -inset-1 animate-ping rounded-full bg-lime-400/70"
              aria-hidden="true"
            />
            <span
              className="absolute -inset-2 animate-pulse rounded-full border-2 border-lime-300/80"
              aria-hidden="true"
            />
          </>
        )}
        {!voz.isSupported ? (
          <MicOff className="relative h-5 w-5" aria-hidden="true" />
        ) : procesando ? (
          <LoaderCircle className="relative h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <Mic className="relative h-5 w-5" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
