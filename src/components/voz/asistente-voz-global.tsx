'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LoaderCircle, Mic, MicOff, X } from 'lucide-react'
import { useVoiceRecognition } from '@/lib/voz/use-voice-recognition'
import { MSG_NAVEGADOR_SIN_VOZ, mensajeErrorVoz } from '@/lib/voz/mensajes'
import { interpretarComandoVoz } from '@/lib/voz/intenciones-navegacion'
import { ESQUEMAS_FORMULARIOS } from '@/lib/voz/esquemas-formularios'
import { extraerDatosFormulario, seleccionarEsquema } from '@/lib/voz/extractor-formularios'
import {
  PARAMETRO_VOZ,
  codificarSolicitudVoz,
  useBusVozFormulario,
} from '@/components/voz/voz-formulario-provider'

type TipoAviso = 'exito' | 'error' | 'info'
interface Aviso {
  tipo: TipoAviso
  texto: string
}

/** Añade el parámetro `voz` a una ruta que ya puede tener otros query params. */
function conParametroVoz(destino: string, codificado: string): string {
  const [ruta, query = ''] = destino.split('?')
  const parametros = new URLSearchParams(query)
  parametros.set(PARAMETRO_VOZ, codificado)
  return `${ruta}?${parametros.toString()}`
}

function mismaRuta(ruta: string, prefijo: string): boolean {
  return ruta === prefijo || ruta.startsWith(`${prefijo}/`)
}

/**
 * Asistente de voz GLOBAL (solo ADMINISTRADOR), con flujo conversacional en 2 pasos:
 *
 * 1. Navegación a cualquier módulo de P1..P4.
 * 2. Dictado de una acción de creación/registro: se abre el modal o la subruta
 *    correspondiente y se rellenan los campos, sin enviar el formulario.
 *
 * Se monta una sola vez en el layout autenticado (SidebarShell). El rol se
 * resuelve en el servidor y se comprueba también aquí como defensa en profundidad.
 */
export function AsistenteVozGlobal({ esAdministrador }: { esAdministrador: boolean }) {
  const router = useRouter()
  const pathname = usePathname()
  const bus = useBusVozFormulario()
  const [aviso, setAviso] = useState<Aviso | null>(null)

  const alTerminar = useCallback(
    (texto: string) => {
      const navegacion = interpretarComandoVoz(texto)
      const rutaDestino = navegacion.tipo === 'navegacion' ? navegacion.ruta : pathname
      const esquema = seleccionarEsquema(
        texto,
        ESQUEMAS_FORMULARIOS,
        pathname,
        rutaDestino,
      )

      if (esquema) {
        const esquemaCompleto = bus.obtenerEsquema(esquema.id) ?? esquema
        const resultado = extraerDatosFormulario(texto, esquemaCompleto)
        const solicitud = {
          id: `voz-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          esquemaId: esquema.id,
          valores: resultado.valores,
          texto,
          origen: 'dictado' as const,
        }

        // Se publica antes de navegar: el bus conserva la solicitud pendiente y
        // el formulario de destino la recibe en cuanto se monta.
        bus.publicarSolicitud(solicitud)
        bus.notificarResultado(resultado)
        setAviso({
          tipo: 'exito',
          texto: 'Formulario preparado. Revise los datos y confirme manualmente con Guardar.',
        })

        const yaEstaEnElFormulario = mismaRuta(pathname, esquema.ruta)
        if (yaEstaEnElFormulario && navegacion.tipo !== 'navegacion') return

        const destino =
          navegacion.tipo === 'navegacion' ? navegacion.destino : esquema.ruta
        router.push(conParametroVoz(destino, codificarSolicitudVoz(solicitud)))
        return
      }

      bus.limpiarResultado()
      if (navegacion.tipo === 'navegacion') {
        setAviso({ tipo: 'exito', texto: `Entendido: ${resultadoResumen(navegacion.resumen)} Abriendo…` })
        router.push(navegacion.destino)
      } else {
        setAviso({ tipo: 'error', texto: navegacion.mensaje })
      }
    },
    [bus, pathname, router],
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
    const temporizador = setTimeout(() => setAviso(null), 11000)
    return () => clearTimeout(temporizador)
  }, [aviso, voz.isListening])

  function iniciar() {
    if (!voz.isSupported) {
      setAviso({ tipo: 'error', texto: MSG_NAVEGADOR_SIN_VOZ })
      return
    }
    setAviso(null)
    bus.limpiarResultado()
    voz.start()
  }

  if (!esAdministrador) return null

  const escuchando = voz.isListening
  const procesando = voz.estado === 'procesando' && !escuchando
  const posicion = 'right-4 top-16 md:right-6 md:top-4'

  const textoVivo = [voz.transcript, voz.interimTranscript].filter(Boolean).join(' ').trim()
  const mensajeError = voz.error ? mensajeErrorVoz(voz.error) : null
  const mostrarGlobo = escuchando || Boolean(textoVivo) || Boolean(aviso) || Boolean(mensajeError) || Boolean(bus.resultado)
  const ariaLabel = escuchando
    ? 'Detener dictado del asistente de voz'
    : procesando
      ? 'Asistente de voz procesando la instrucción'
      : 'Iniciar asistente de navegación y rellenado por voz'

  return (
    <div className={`fixed z-50 flex flex-col items-end ${posicion}`}>
      {mostrarGlobo && (
        <div
          className="absolute right-0 top-full mt-3 max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-2xl border border-lime-200 bg-white p-3 text-left shadow-xl shadow-slate-900/10"
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
                bus.limpiarResultado()
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
              Escuchando… puede decir «ir a clientes» o «registrar cliente Empresa Sur, nit 123».
            </p>
          )}

          {textoVivo && (
            <p className="mt-1.5 rounded-xl bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">
              <span className="sr-only">Transcripción: </span>
              {textoVivo}
            </p>
          )}

          {bus.resultado && (
            <div className="mt-2 rounded-xl border border-lime-100 bg-lime-50/70 p-2.5">
              <p className="text-sm font-semibold text-lime-900">
                Formulario abierto: {bus.resultado.formulario}
              </p>
              {bus.resultado.camposRellenados.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-xs text-slate-700">
                  {bus.resultado.camposRellenados.map((campo) => (
                    <li key={campo.nombre}>
                      <span className="font-medium">{campo.etiqueta}:</span>{' '}
                      <span className="break-words">{campo.texto}</span>
                    </li>
                  ))}
                </ul>
              )}
              {bus.resultado.faltantes.length > 0 ? (
                <p className="mt-1.5 text-xs font-medium text-amber-700">
                  Faltan por completar manualmente:{' '}
                  {bus.resultado.faltantes.map((f) => f.etiqueta).join(', ')}.
                </p>
              ) : (
                <p className="mt-1.5 text-xs font-medium text-emerald-700">
                  Campos obligatorios completos. Confirme manualmente con Guardar.
                </p>
              )}
            </div>
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

function resultadoResumen(resumen: string): string {
  return resumen.charAt(0).toLowerCase() + resumen.slice(1)
}
