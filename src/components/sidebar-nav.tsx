'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { PAQUETES } from '@/lib/navigation'
import { EnlaceSidebar } from '@/components/sidebar-enlace'
import { TODOS, usePaqueteSeleccionado } from '@/components/paquete-seleccionado'

/**
 * Navegación lateral por paquetes funcionales en formato acordeón.
 *
 * Cada paquete (P1–P4) es una cabecera clicable con una flecha indicadora:
 * al pulsarla se expande o se colapsa la lista de sus módulos. El paquete que
 * contiene la ruta activa se muestra abierto por defecto (y P1 si la ruta no
 * pertenece a ninguno); el usuario puede abrir/cerrar cualquier paquete.
 *
 * Además, cada cabecera comparte su selección con la vista principal: al
 * pulsar un paquete se actualiza `usePaqueteSeleccionado`, el mismo estado que
 * consume el Dashboard (`panel-modulos.tsx`). El paquete seleccionado queda
 * resaltado y se abre automáticamente. Al final de la lista se añade «Todos
 * los módulos», que selecciona el paquete especial `TODOS` (todo agrupado).
 *
 * Seguridad: un paquete deshabilitado (P3/P4) o un paquete habilitado sin
 * módulos permitidos para el rol muestran una indicación de bloqueo / sin
 * permisos en lugar de enlaces.
 */
export function NavegacionPaquetes({ permisos }: { permisos: string[] }) {
  const pathname = usePathname()
  const { seleccionado, seleccionar } = usePaqueteSeleccionado()
  const paqueteActivo = idDePaqueteActivo(pathname)

  // Solo se guardan las elecciones manuales del usuario; el resto se deriva
  // del paquete activo y del seleccionado para que se abran solos.
  const [elecciones, setElecciones] = useState<Record<string, boolean>>({})

  const estaAbierto = (id: string) =>
    elecciones[id] ?? (id === paqueteActivo || id === seleccionado)

  return (
    <nav className="space-y-2" aria-label="Navegación principal">
      {PAQUETES.map((paquete) => {
        const abierto = estaAbierto(paquete.id)
        const esSeleccionado = seleccionado === paquete.id
        const visibles = paquete.items.filter(
          (item) => item.clave === '' || permisos.includes(item.clave),
        )

        return (
          <div key={paquete.id}>
            <button
              type="button"
              onClick={() => {
                seleccionar(paquete.id)
                setElecciones((prev) => ({ ...prev, [paquete.id]: !abierto }))
              }}
              aria-expanded={abierto}
              aria-controls={`paquete-${paquete.id}`}
              aria-current={esSeleccionado ? 'true' : undefined}
              className={`group flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                esSeleccionado ? 'bg-lime-50' : 'hover:bg-slate-100'
              }`}
            >
              <span
                className={`text-[10px] font-bold uppercase leading-tight tracking-widest ${
                  paquete.habilitado
                    ? esSeleccionado
                      ? 'text-slate-800'
                      : 'text-slate-500 group-hover:text-slate-700'
                    : 'text-slate-400'
                }`}
              >
                {paquete.id} · {paquete.nombre}
              </span>
              <Flecha
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                  abierto ? 'rotate-180' : ''
                }`}
              />
            </button>

            {abierto && (
              <div id={`paquete-${paquete.id}`} className="mt-1 space-y-1 pl-1">
                {!paquete.habilitado ? (
                  <AvisoBloqueado />
                ) : visibles.length > 0 ? (
                  visibles.map((item) => (
                    <EnlaceSidebar
                      key={item.id}
                      ruta={item.ruta}
                      etiqueta={item.etiqueta}
                      clave={item.clave || 'INICIO'}
                    />
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-slate-400">
                    Sin módulos asignados a tu rol.
                  </p>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Entrada especial: muestra los módulos de todos los paquetes agrupados */}
      <div className="border-t border-slate-200/80 pt-2">
        <button
          type="button"
          onClick={() => seleccionar(TODOS)}
          aria-current={seleccionado === TODOS ? 'true' : undefined}
          className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
            seleccionado === TODOS
              ? 'bg-[#BDEB9D] font-semibold text-slate-900'
              : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          <IconoCuadricula className="h-5 w-5 shrink-0" />
          <span className="truncate">Todos los módulos</span>
        </button>
      </div>
    </nav>
  )
}

/** Id del paquete que contiene la ruta activa; 'P1' si ninguna coincide. */
function idDePaqueteActivo(pathname: string): string {
  const paquete = PAQUETES.find(
    (p) =>
      p.habilitado &&
      p.items.some(
        (item) =>
          item.ruta !== '' &&
          item.ruta !== '/' &&
          (pathname === item.ruta || pathname.startsWith(`${item.ruta}/`)),
      ),
  )
  return paquete?.id ?? 'P1'
}

/** Flecha indicadora de despliegue; gira 180° cuando el paquete está abierto. */
function Flecha({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

/** Icono de cuadrícula (cuatro cuadritos) para «Todos los módulos». */
function IconoCuadricula({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </svg>
  )
}

/** Indicación para paquetes deshabilitados (P3/P4) o sin permisos. */
function AvisoBloqueado() {
  return (
    <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-4 w-4 shrink-0"
        aria-hidden="true"
      >
        <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      Bloqueado · sin permisos
    </p>
  )
}
