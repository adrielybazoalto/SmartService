'use client'

import Link from 'next/link'
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
 * Tarjetas del Dashboard según el paquete seleccionado en el Sidebar.
 *
 * - Un paquete concreto (P1…P4): solo sus módulos.
 * - `TODOS` («Todos los módulos»): todos los módulos, **agrupados** por paquete.
 *
 * La selección se lee del estado compartido `usePaqueteSeleccionado`, que el
 * menú lateral actualiza al pulsar una cabecera de paquete o «Todos los
 * módulos». Los paquetes deshabilitados (P3/P4) muestran un estado de
 * «próximamente» en lugar de tarjetas.
 */
export function PanelModulos({ modulos }: { modulos: ModuloConPaquete[] }) {
  const { seleccionado } = usePaqueteSeleccionado()

  const paqueteSeleccionado = PAQUETES.find((p) => p.id === seleccionado)
  const deshabilitado =
    seleccionado !== TODOS && paqueteSeleccionado?.habilitado === false

  if (deshabilitado) {
    return (
      <EstadoVacio
        seleccionado={seleccionado}
        nombrePaquete={paqueteSeleccionado?.nombre}
        habilitado={false}
      />
    )
  }

  const visibles = PAQUETES.filter(
    (p) => seleccionado === TODOS || p.id === seleccionado,
  )

  const grupos = visibles
    .map((paquete) => ({
      paquete,
      items: modulos.filter((m) => m.paqueteId === paquete.id),
    }))
    .filter((grupo) => grupo.items.length > 0)

  if (grupos.length === 0) {
    return (
      <EstadoVacio
        seleccionado={seleccionado}
        nombrePaquete={paqueteSeleccionado?.nombre}
        habilitado={paqueteSeleccionado?.habilitado}
      />
    )
  }

  return (
    <section className="flex flex-col gap-8">
      {grupos.map(({ paquete, items }) => (
        <div key={paquete.id} className="flex flex-col gap-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500">
            {paquete.id} · {paquete.nombre}
          </h2>
          <div
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-label={`Módulos de ${paquete.nombre}`}
          >
            {items.map((modulo) => (
              <TarjetaModulo key={modulo.ruta} modulo={modulo} />
            ))}
          </div>
        </div>
      ))}
    </section>
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
