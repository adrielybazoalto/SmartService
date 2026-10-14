'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { PAQUETES } from '@/lib/navigation'
import { TarjetaModulo } from '@/components/tarjeta-modulo'
import { TODOS, usePaqueteSeleccionado } from '@/components/paquete-seleccionado'

/** Módulo permitido junto con el paquete funcional al que pertenece. */
export interface ModuloConPaquete {
  paqueteId: string
  clave: string
  ruta: string
  etiqueta: string
  descripcion: string
}

/**
 * Panel de tarjetas del Dashboard con pestañas de filtrado por paquete.
 *
 * La selección (Todos, P1…P4) se lee del estado compartido
 * `usePaqueteSeleccionado`, por lo que también reacciona a lo que se pulse en
 * el menú lateral. Los paquetes deshabilitados (P3/P4) muestran un estado de
 * «próximamente» en lugar de tarjetas.
 */
export function PanelModulos({ modulos }: { modulos: ModuloConPaquete[] }) {
  const { seleccionado, seleccionar } = usePaqueteSeleccionado()

  const filtrados =
    seleccionado === TODOS
      ? modulos
      : modulos.filter((m) => m.paqueteId === seleccionado)

  const paquete = PAQUETES.find((p) => p.id === seleccionado)

  return (
    <section className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Filtrar módulos por paquete funcional"
        className="flex flex-wrap gap-2"
      >
        <BotonTab activo={seleccionado === TODOS} onClick={() => seleccionar(TODOS)}>
          Todos
        </BotonTab>
        {PAQUETES.map((p) => (
          <BotonTab
            key={p.id}
            activo={seleccionado === p.id}
            title={p.nombre}
            onClick={() => seleccionar(p.id)}
          >
            {p.id}
          </BotonTab>
        ))}
      </div>

      {paquete && (
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-700">
            {paquete.id} · {paquete.nombre}
          </span>
          {!paquete.habilitado && ' — próximamente'}
        </p>
      )}

      {filtrados.length > 0 ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Módulos disponibles"
        >
          {filtrados.map((modulo) => (
            <TarjetaModulo key={modulo.ruta} modulo={modulo} />
          ))}
        </div>
      ) : (
        <EstadoVacio
          seleccionado={seleccionado}
          nombrePaquete={paquete?.nombre}
          habilitado={paquete?.habilitado}
        />
      )}
    </section>
  )
}

/** Pestaña de filtrado por paquete. */
function BotonTab({
  activo,
  onClick,
  title,
  children,
}: {
  activo: boolean
  onClick: () => void
  title?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={activo}
      title={title}
      onClick={onClick}
      className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
        activo
          ? 'border-lime-300 bg-lime-100 text-lime-800'
          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

/** Estado mostrado cuando el paquete seleccionado no tiene tarjetas. */
function EstadoVacio({
  seleccionado,
  nombrePaquete,
  habilitado,
}: {
  seleccionado: string
  nombrePaquete?: string
  habilitado?: boolean
}) {
  const deshabilitado = seleccionado !== TODOS && habilitado === false

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center">
      {deshabilitado && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 text-slate-400"
          aria-hidden="true"
        >
          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      )}

      <p className="text-slate-500">
        {deshabilitado ? (
          <>
            <span className="font-semibold text-slate-600">
              {seleccionado} · {nombrePaquete}
            </span>{' '}
            estará disponible próximamente.
          </>
        ) : seleccionado === TODOS ? (
          'No tienes módulos asignados a tu rol.'
        ) : (
          'No tienes módulos asignados en este paquete.'
        )}
      </p>

      {seleccionado === TODOS && (
        <Link
          href="/perfil"
          className="text-sm font-semibold text-lime-700 hover:text-lime-800 hover:underline"
        >
          Ir a mi perfil
        </Link>
      )}
    </div>
  )
}
