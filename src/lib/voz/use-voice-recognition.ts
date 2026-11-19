'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/**
 * Hook genérico de dictado por voz (Web Speech API). Lo usa el CU18 y lo
 * reutilizará el CU20 (Reportes).
 *
 * - Chrome (escritorio y Android) y Edge: window.SpeechRecognition o
 *   window.webkitSpeechRecognition. Requiere HTTPS o localhost.
 * - Seguro para SSR: `window` solo se lee en efectos, eventos y en el
 *   snapshot de cliente de useSyncExternalStore.
 * - Se detiene con stop() o tras `silencioMs` sin resultados nuevos.
 * - En Chrome el audio se transcribe en los servidores del navegador.
 */

// ---------------------------------------------------------------------
// Tipos de la Web Speech API (no todas las versiones de lib.dom los traen)
// ---------------------------------------------------------------------
interface AlternativaVoz {
  readonly transcript: string
  readonly confidence: number
}

interface ResultadoVoz {
  readonly isFinal: boolean
  readonly length: number
  [indice: number]: AlternativaVoz
}

interface ListaResultadosVoz {
  readonly length: number
  [indice: number]: ResultadoVoz
}

interface EventoResultadoVoz extends Event {
  readonly resultIndex: number
  readonly results: ListaResultadosVoz
}

interface EventoErrorVoz extends Event {
  readonly error: string
  readonly message: string
}

interface ReconocedorVoz extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((evento: EventoResultadoVoz) => void) | null
  onerror: ((evento: EventoErrorVoz) => void) | null
  onend: ((evento: Event) => void) | null
  onstart: ((evento: Event) => void) | null
}

type ConstructorReconocedor = new () => ReconocedorVoz

interface VentanaConVoz {
  SpeechRecognition?: ConstructorReconocedor
  webkitSpeechRecognition?: ConstructorReconocedor
}

function constructorReconocedor(): ConstructorReconocedor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as VentanaConVoz
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// ---------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------
export type ErrorVoz = 'not-allowed' | 'no-speech' | 'audio-capture' | 'network' | 'desconocido'
export type EstadoVoz = 'inactivo' | 'escuchando' | 'procesando'

export interface OpcionesVoz {
  /** Idioma principal. Por defecto 'es-BO'. */
  lang?: string
  /** Idioma si el navegador no admite el principal. Por defecto 'es-ES'. */
  langAlternativo?: string
  /** Resultados parciales mientras se habla. Por defecto true. */
  interimResults?: boolean
  /** Silencio tras el que se detiene solo. Por defecto 3000 ms. */
  silencioMs?: number
  /** Se llama una vez al terminar, con el texto final (no vacío). */
  onFinal?: (texto: string) => void
}

export interface ReconocimientoVoz {
  isSupported: boolean
  isListening: boolean
  estado: EstadoVoz
  transcript: string
  interimTranscript: string
  error: ErrorVoz | null
  start: () => void
  stop: () => void
  reset: () => void
}

function aErrorVoz(codigo: string): ErrorVoz | null {
  switch (codigo) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'not-allowed'
    case 'no-speech':
      return 'no-speech'
    case 'audio-capture':
      return 'audio-capture'
    case 'network':
      return 'network'
    case 'aborted':
      return null
    default:
      return 'desconocido'
  }
}

const suscribirNada = () => () => {}

export function useVoiceRecognition(opciones: OpcionesVoz = {}): ReconocimientoVoz {
  const {
    lang = 'es-BO',
    langAlternativo = 'es-ES',
    interimResults = true,
    silencioMs = 3000,
  } = opciones

  const isSupported = useSyncExternalStore(
    suscribirNada,
    () => constructorReconocedor() !== null,
    () => false,
  )

  const [estado, setEstado] = useState<EstadoVoz>('inactivo')
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<ErrorVoz | null>(null)

  const reconocedorRef = useRef<ReconocedorVoz | null>(null)
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const finalRef = useRef('')
  const onFinalRef = useRef(opciones.onFinal)
  const reintentoIdiomaRef = useRef(false)
  /** Para reintentar con el idioma alternativo desde dentro del propio reconocedor. */
  const iniciarConRef = useRef<(idioma: string) => void>(() => undefined)

  useEffect(() => {
    onFinalRef.current = opciones.onFinal
  }, [opciones.onFinal])

  const limpiarTemporizador = useCallback(() => {
    if (temporizadorRef.current) clearTimeout(temporizadorRef.current)
    temporizadorRef.current = null
  }, [])

  const stop = useCallback(() => {
    limpiarTemporizador()
    const r = reconocedorRef.current
    if (!r) return
    setEstado('procesando')
    try {
      r.stop()
    } catch {
      // ya estaba detenido
    }
  }, [limpiarTemporizador])

  const programarSilencio = useCallback(() => {
    limpiarTemporizador()
    temporizadorRef.current = setTimeout(stop, silencioMs)
  }, [limpiarTemporizador, silencioMs, stop])

  const iniciarCon = useCallback(
    (idioma: string) => {
      const Constructor = constructorReconocedor()
      if (!Constructor) return

      const r = new Constructor()
      // Chrome Android repite resultados en modo continuo: allí termina solo tras la pausa
      const esAndroid = /Android/i.test(navigator.userAgent)
      r.lang = idioma
      r.continuous = !esAndroid
      r.interimResults = interimResults
      r.maxAlternatives = 1

      r.onstart = () => {
        setEstado('escuchando')
        programarSilencio()
      }

      r.onresult = (evento) => {
        let final = ''
        let parcial = ''
        for (let i = 0; i < evento.results.length; i++) {
          const resultado = evento.results[i]
          const texto = resultado[0]?.transcript ?? ''
          if (resultado.isFinal) final += `${texto} `
          else parcial += texto
        }
        finalRef.current = final.replace(/\s+/g, ' ').trim()
        setTranscript(finalRef.current)
        setInterimTranscript(parcial.trim())
        programarSilencio()
      }

      r.onerror = (evento) => {
        if (evento.error === 'language-not-supported' && !reintentoIdiomaRef.current && langAlternativo !== idioma) {
          reintentoIdiomaRef.current = true
          r.onend = null
          reconocedorRef.current = null
          iniciarConRef.current(langAlternativo)
          return
        }
        const tipo = aErrorVoz(evento.error)
        if (tipo) setError(tipo)
      }

      r.onend = () => {
        limpiarTemporizador()
        reconocedorRef.current = null
        setEstado('inactivo')
        setInterimTranscript('')
        const texto = finalRef.current
        if (texto) onFinalRef.current?.(texto)
      }

      reconocedorRef.current = r
      try {
        r.start()
      } catch {
        reconocedorRef.current = null
        setEstado('inactivo')
        setError('desconocido')
      }
    },
    [interimResults, langAlternativo, limpiarTemporizador, programarSilencio],
  )

  useEffect(() => {
    iniciarConRef.current = iniciarCon
  }, [iniciarCon])

  const start = useCallback(() => {
    if (reconocedorRef.current) return
    finalRef.current = ''
    reintentoIdiomaRef.current = false
    setTranscript('')
    setInterimTranscript('')
    setError(null)
    setEstado('procesando')
    iniciarCon(lang)
  }, [iniciarCon, lang])

  const reset = useCallback(() => {
    finalRef.current = ''
    setTranscript('')
    setInterimTranscript('')
    setError(null)
  }, [])

  // Al desmontar: soltar el micrófono
  useEffect(
    () => () => {
      limpiarTemporizador()
      const r = reconocedorRef.current
      if (r) {
        r.onend = null
        r.abort()
      }
      reconocedorRef.current = null
    },
    [limpiarTemporizador],
  )

  return {
    isSupported,
    isListening: estado === 'escuchando',
    estado,
    transcript,
    interimTranscript,
    error,
    start,
    stop,
    reset,
  }
}
