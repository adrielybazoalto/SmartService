'use client'

/**
 * Bus de eventos de voz para formularios (P1..P4).
 *
 * `AsistenteVozGlobal` publica una solicitud con los valores ya extraídos y
 * cada formulario se suscribe mediante `useVozFormulario`. El bus guarda la
 * última solicitud como "pendiente", de modo que si el formulario vive en una
 * subruta todavía no montada, los datos se aplican en cuanto ese formulario
 * registra su esquema (sin formularios automáticos: sólo se rellena).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Suspense } from 'react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'next/navigation'
import type {
  EsquemaFormularioVoz,
  OpcionVoz,
  ResultadoExtraccionVoz,
  ValoresVoz,
} from '@/lib/voz/extractor-formularios'
import { esquemaPorId } from '@/lib/voz/esquemas-formularios'

export const PARAMETRO_VOZ = 'voz'

export interface SolicitudVozFormulario {
  id: string
  esquemaId: string
  valores: ValoresVoz
  texto: string
  origen: 'dictado' | 'parametro'
}

interface RegistroFormulario {
  abrir: (() => void) | undefined
  aplicar: (valores: ValoresVoz) => void
  activo: boolean
  obtenerOpciones: () => Record<string, OpcionVoz[]> | undefined
}

interface BusVozFormulario {
  solicitud: SolicitudVozFormulario | null
  resultado: ResultadoExtraccionVoz | null
  publicarSolicitud: (solicitud: SolicitudVozFormulario) => void
  notificarResultado: (resultado: ResultadoExtraccionVoz) => void
  limpiarResultado: () => void
  suscribir: (esquemaId: string, registro: RegistroFormulario) => () => void
  obtenerEsquema: (id: string) => EsquemaFormularioVoz | undefined
}

const ContextoVozFormulario = createContext<BusVozFormulario | null>(null)

export function codificarSolicitudVoz(solicitud: SolicitudVozFormulario): string {
  return encodeURIComponent(JSON.stringify(solicitud))
}

export function decodificarSolicitudVoz(codificado: string | null): SolicitudVozFormulario | null {
  if (!codificado) return null
  try {
    const dato: unknown = JSON.parse(decodeURIComponent(codificado))
    if (!dato || typeof dato !== 'object') return null
    const obj = dato as Partial<SolicitudVozFormulario>
    if (
      typeof obj.id !== 'string' ||
      typeof obj.esquemaId !== 'string' ||
      typeof obj.texto !== 'string' ||
      !obj.valores ||
      typeof obj.valores !== 'object' ||
      (obj.origen !== 'dictado' && obj.origen !== 'parametro')
    ) return null
    return obj as SolicitudVozFormulario
  } catch {
    return null
  }
}

/** Envuelve el layout autenticado para compartir el bus entre asistente y formularios. */
export function VozFormularioProvider({ children }: { children: ReactNode }) {
  const [solicitud, setSolicitud] = useState<SolicitudVozFormulario | null>(null)
  const [resultado, setResultado] = useState<ResultadoExtraccionVoz | null>(null)
  const solicitudRef = useRef<SolicitudVozFormulario | null>(null)
  const registrosRef = useRef<Map<string, Map<number, RegistroFormulario>>>(new Map())
  const contadorRef = useRef(0)

  const aplicarARegistros = useCallback((solicitudActual: SolicitudVozFormulario) => {
    const registros = registrosRef.current.get(solicitudActual.esquemaId)
    if (!registros) return
    for (const registro of registros.values()) {
      if (!registro.activo) continue
      registro.abrir?.()
      registro.aplicar(solicitudActual.valores)
    }
  }, [])

  const publicarSolicitud = useCallback(
    (nueva: SolicitudVozFormulario) => {
      solicitudRef.current = nueva
      setSolicitud(nueva)
      setResultado(null)
      aplicarARegistros(nueva)
    },
    [aplicarARegistros],
  )

  const notificarResultado = useCallback((nuevo: ResultadoExtraccionVoz) => {
    setResultado(nuevo)
  }, [])

  const limpiarResultado = useCallback(() => setResultado(null), [])

  const suscribir = useCallback(
    (esquemaId: string, registro: RegistroFormulario) => {
      const id = ++contadorRef.current
      const grupo = registrosRef.current.get(esquemaId) ?? new Map<number, RegistroFormulario>()
      grupo.set(id, registro)
      registrosRef.current.set(esquemaId, grupo)

      const pendiente = solicitudRef.current
      if (pendiente && pendiente.esquemaId === esquemaId) {
        if (registro.activo) {
          registro.abrir?.()
          registro.aplicar(pendiente.valores)
        }
      }

      return () => {
        grupo.delete(id)
        if (!grupo.size) registrosRef.current.delete(esquemaId)
      }
    },
    [],
  )

  const obtenerEsquema = useCallback((id: string) => {
    const base = esquemaPorId(id)
    if (!base) return undefined
    const opciones: Record<string, OpcionVoz[]> = {}
    for (const registro of registrosRef.current.get(id)?.values() ?? []) {
      Object.assign(opciones, registro.obtenerOpciones() ?? {})
    }
    if (!Object.keys(opciones).length) return base
    return {
      ...base,
      campos: base.campos.map((campo) =>
        opciones[campo.nombre] ? { ...campo, opciones: opciones[campo.nombre] } : campo,
      ),
    }
  }, [])

  const valor = useMemo<BusVozFormulario>(
    () => ({ solicitud, resultado, publicarSolicitud, notificarResultado, limpiarResultado, suscribir, obtenerEsquema }),
    [solicitud, resultado, publicarSolicitud, notificarResultado, limpiarResultado, suscribir, obtenerEsquema],
  )

  return (
    <ContextoVozFormulario.Provider value={valor}>
      <Suspense fallback={null}>
        <SincronizadorParametrosVoz publicar={publicarSolicitud} />
      </Suspense>
      {children}
    </ContextoVozFormulario.Provider>
  )
}

/** Permite recargar/abrir directamente una URL con `?voz=…` y autorellenar. */
function SincronizadorParametrosVoz({
  publicar,
}: {
  publicar: (solicitud: SolicitudVozFormulario) => void
}) {
  const parametros = useSearchParams()
  const codificado = parametros.get(PARAMETRO_VOZ)
  const procesadoRef = useRef<string | null>(null)

  useEffect(() => {
    if (!codificado || procesadoRef.current === codificado) return
    const solicitud = decodificarSolicitudVoz(codificado)
    procesadoRef.current = codificado
    if (solicitud) publicar(solicitud)
    const nuevos = new URLSearchParams(parametros.toString())
    nuevos.delete(PARAMETRO_VOZ)
    const query = nuevos.toString()
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    )
  }, [codificado, parametros, publicar])

  return null
}

export function useBusVozFormulario(): BusVozFormulario {
  const contexto = useContext(ContextoVozFormulario)
  if (!contexto) {
    throw new Error('useBusVozFormulario debe usarse dentro de VozFormularioProvider')
  }
  return contexto
}

export interface ConfiguracionVozFormulario {
  /** Identificador del esquema declarado en `esquemas-formularios.ts`. */
  esquemaId: string
  aplicar: (valores: ValoresVoz) => void
  abrir?: () => void
  /** Opciones reales de catálogos de base de datos, por nombre de campo. */
  opcionesPorCampo?: Record<string, OpcionVoz[]>
  activo?: boolean
}

/**
 * Conecta un formulario al bus de voz. Nunca envía el formulario: sólo abre el
 * modal/panel (si hace falta) y aplica los valores en el estado del componente.
 */
export function useVozFormulario(config: ConfiguracionVozFormulario): void {
  const { suscribir } = useBusVozFormulario()
  const configRef = useRef(config)
  const esquemaId = config.esquemaId

  // El bus puede invocar los callbacks antes de que termine el render inicial;
  // el ref ya contiene la configuración con la que se montó el formulario.
  useEffect(() => {
    configRef.current = config
  })

  useEffect(() => {
    return suscribir(esquemaId, {
      abrir: () => configRef.current.abrir?.(),
      aplicar: (valores) => configRef.current.aplicar(valores),
      activo: configRef.current.activo ?? true,
      obtenerOpciones: () => configRef.current.opcionesPorCampo,
    })
  }, [suscribir, esquemaId])
}
