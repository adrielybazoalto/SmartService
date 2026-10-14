'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { logoutAction } from '@/app/actions/auth'
import { NavegacionPaquetes } from '@/components/sidebar-nav'
import { BadgeRol } from '@/components/badge-rol'
import { PaqueteSeleccionadoProvider } from '@/components/paquete-seleccionado'

/**
 * Marco de la aplicación (Client Component) responsable del comportamiento
 * responsive del menú lateral:
 *
 *  - Móvil / tablet (< md, 768 px): el Sidebar es un panel deslizante
 *    (off-canvas) que se abre con el botón hamburguesa de la barra superior y
 *    se cierra al pulsar el fondo, la ✕ o al navegar a otra ruta. No ocupa
 *    espacio fijo en pantalla.
 *  - md en adelante (≥ 768 px): el Sidebar queda fijo a la izquierda (sticky),
 *    tal como en escritorio.
 *
 * También comparte la selección de paquete (Provider) entre Sidebar y
 * Dashboard, y bloquea el scroll del fondo mientras el panel está abierto.
 */
export function SidebarShell({
  nombre,
  rolNombre,
  permisos,
  children,
}: {
  nombre: string
  rolNombre?: string | null
  permisos: string[]
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const pathname = usePathname()

  // Cierra el panel al cambiar de ruta (al pulsar cualquier enlace del menú).
  useEffect(() => {
    setAbierto(false)
  }, [pathname])

  // Evita el scroll del contenido de fondo mientras el panel móvil está abierto.
  useEffect(() => {
    if (!abierto) return
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [abierto])

  return (
    <PaqueteSeleccionadoProvider>
      <div className="flex min-h-screen bg-[#F4F5F7] text-slate-900">
        {/* Fondo oscurecido al abrir el panel en móvil */}
        <div
          onClick={() => setAbierto(false)}
          aria-hidden="true"
          className={`fixed inset-0 z-30 bg-slate-900/40 transition-opacity duration-300 md:hidden ${
            abierto ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        />

        {/* ── Barra Lateral Izquierda ────────────────────────────────
            Móvil/tablet: panel deslizante (off-canvas).
            md+: fijo a la izquierda (sticky), igual que en escritorio. */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col overflow-hidden border-r border-slate-200/80 bg-white shadow-xl transition-transform duration-300 ease-out md:sticky md:top-0 md:z-auto md:translate-x-0 md:shadow-none ${
            abierto ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Sección superior: logo y navegación por paquetes (scrollable) */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200/80 p-4">
              <Link
                href="/"
                className="block px-3 py-2 text-xl font-bold tracking-wider text-slate-900"
              >
                SmartService
              </Link>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar menú"
                className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 md:hidden"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <NavegacionPaquetes permisos={permisos} />
            </div>
          </div>

          {/* Sección inferior: usuario, rol y cerrar sesión (siempre visible) */}
          <div className="flex-shrink-0 space-y-3 border-t border-slate-200/80 p-4">
            <div className="flex items-center gap-3 px-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold uppercase text-slate-700">
                {nombre.trim().charAt(0) || '?'}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">{nombre}</p>
                <BadgeRol rol={rolNombre} className="mt-1" />
              </div>
            </div>

            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-5 w-5 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="m16 17 5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
                Cerrar sesión
              </button>
            </form>
          </div>
        </aside>

        {/* ── Columna de contenido ─────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Barra superior móvil con botón hamburguesa (oculta en md+) */}
          <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur md:hidden">
            <button
              type="button"
              onClick={() => setAbierto(true)}
              aria-label="Abrir menú"
              aria-expanded={abierto}
              className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-slate-700 transition-colors hover:bg-slate-100"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-6 w-6"
                aria-hidden="true"
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            </button>
            <Link href="/" className="text-lg font-bold tracking-wider text-slate-900">
              SmartService
            </Link>
          </header>

          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
    </PaqueteSeleccionadoProvider>
  )
}
