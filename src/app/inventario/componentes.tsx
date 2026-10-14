'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/**
 * Piezas de interfaz de CU16 (tema claro "PULSE"). Locales al módulo para no
 * modificar componentes compartidos.
 */

/**
 * Insignia de paquete y caso de uso con el mismo estilo que PageHeaderBadge.
 * Es local porque este módulo usa su propia insignia; el P2 del sistema es
 * «Gestión Comercial, Clientes, Catálogo y Ventas» (ver lib/navigation.ts).
 */
export function InsigniaCU16() {
  const partes = ['P2: GESTIÓN COMERCIAL, CLIENTES, CATÁLOGO Y VENTAS', 'CU16', 'GESTIONAR INVENTARIO Y KÁRDEX']
  return (
    <span className="inline-flex w-fit flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-lime-200 bg-lime-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-lime-700">
      {partes.map((parte, i) => (
        <span key={parte} className="inline-flex items-center gap-x-1.5">
          {i > 0 && (
            <span aria-hidden="true" className="text-lime-500">
              •
            </span>
          )}
          {parte}
        </span>
      ))}
    </span>
  )
}

export function Modal({
  titulo,
  subtitulo,
  onCerrar,
  bloqueado = false,
  children,
}: {
  titulo: string
  subtitulo?: string
  onCerrar: () => void
  /** true mientras se guarda: no se puede cerrar. */
  bloqueado?: boolean
  children: ReactNode
}) {
  const idTitulo = useId()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !bloqueado) onCerrar()
    }
    document.addEventListener('keydown', alPulsar)
    return () => document.removeEventListener('keydown', alPulsar)
  }, [bloqueado, onCerrar])

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('input, select, textarea, button[type="submit"]')?.focus()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-100 pb-3">
          <div>
            <h2 id={idTitulo} className="text-lg font-bold text-slate-900">
              {titulo}
            </h2>
            {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            disabled={bloqueado}
            aria-label="Cerrar"
            className="cursor-pointer rounded-lg p-1 font-bold text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Campo({
  etiqueta,
  error,
  ayuda,
  obligatorio = false,
  children,
  htmlFor,
}: {
  etiqueta: string
  error?: string
  ayuda?: string
  obligatorio?: boolean
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-slate-600">
        {etiqueta}
        {obligatorio && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1 text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : (
        ayuda && <p className="mt-1 text-xs text-slate-400">{ayuda}</p>
      )}
    </div>
  )
}

/** Pie de formulario: Cancelar + botón principal con estado de carga. */
export function AccionesFormulario({
  pendiente,
  textoEnviar,
  textoPendiente = 'Guardando…',
  onCancelar,
  deshabilitado = false,
  peligro = false,
}: {
  pendiente: boolean
  textoEnviar: string
  textoPendiente?: string
  onCancelar: () => void
  deshabilitado?: boolean
  peligro?: boolean
}) {
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end sm:gap-3">
      <button
        type="button"
        onClick={onCancelar}
        disabled={pendiente}
        className="cursor-pointer rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={pendiente || deshabilitado}
        aria-busy={pendiente}
        className={
          peligro
            ? 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50'
            : 'btn-primario'
        }
      >
        {pendiente && <Spinner />}
        {pendiente ? textoPendiente : textoEnviar}
      </button>
    </div>
  )
}

export function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
    />
  )
}

/** Error general del formulario (respuesta del servidor). */
export function ErrorFormulario({ mensaje }: { mensaje: string | null }) {
  if (!mensaje) return null
  return (
    <p role="alert" className="mensaje-error">
      ⚠ {mensaje}
    </p>
  )
}

export function EstadoProducto({ activo, critico }: { activo: boolean; critico: boolean }) {
  if (!activo) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
        Inactivo
      </span>
    )
  }
  if (critico) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
        Stock crítico
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
      Normal
    </span>
  )
}

/**
 * Fotografía de producto (IMAGEN_PRODUCTO). Si no hay URL o la imagen no carga,
 * muestra un respaldo neutro. Se usa <img> (no next/image) para no exigir el
 * registro de dominios remotos en next.config.ts, igual que el módulo de ventas.
 */
export function FotoProducto({
  url,
  nombre,
  className = 'h-10 w-10',
  ajuste = 'cover',
}: {
  url: string | null
  nombre: string
  /** Tamaño y forma del recuadro (clases de Tailwind). */
  className?: string
  /** cover: recorta para llenar (miniaturas). contain: foto completa, centrada (vista grande). */
  ajuste?: 'cover' | 'contain'
}) {
  const [urlFallida, setUrlFallida] = useState<string | null>(null)

  if (!url || urlFallida === url) {
    return (
      <span
        role="img"
        aria-label={nombre ? `${nombre}: sin fotografía` : 'Sin fotografía'}
        className={`flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400 ${className}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-1/2 w-1/2 max-h-12 max-w-12">
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="9" cy="10" r="1.75" />
          <path d="m4 18 5-5 3.5 3.5L15 14l5 4.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={nombre}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setUrlFallida(url)}
      // Si la imagen falló ANTES de hidratar (HTML del servidor), onError ya no
      // se dispara: al montar se revisa si terminó de cargar sin contenido.
      ref={(img) => {
        if (img?.complete && img.naturalWidth === 0) setUrlFallida(url)
      }}
      className={`shrink-0 rounded-lg border border-slate-200 ${ajuste === 'contain' ? 'bg-slate-50 object-contain object-center p-2' : 'bg-white object-cover'} ${className}`}
    />
  )
}
