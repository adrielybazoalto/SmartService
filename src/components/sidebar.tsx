import Link from 'next/link'
import type { ReactNode } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { getPermisosDeRol } from '@/lib/permisos'
import { logoutAction } from '@/app/actions/auth'
import { NavegacionPaquetes } from '@/components/sidebar-nav'
import { BadgeRol } from '@/components/badge-rol'

/**
 * LAYOUT GLOBAL (Sidebar izquierda + contenido) — tema claro "PULSE".
 * La navegación por paquetes (ver lib/navigation.ts) se delega en
 * `NavegacionPaquetes`, un Client Component en formato acordeón:
 *
 *   P1 / P2 → paquetes habilitados; muestran SOLO los ítems cuyo permiso
 *             está activo en ROL_PERMISO (BD).
 *   P3 / P4 → paquetes deshabilitados en este ciclo: al desplegarlos indican
 *             «Bloqueado · sin permisos», sin enlaces.
 *
 * Sin sesión activa se devuelve la página tal cual (login, recuperar).
 */
export async function SidebarLayout({ children }: { children: ReactNode }) {
  const usuario = await getCurrentUser()
  if (!usuario) return <>{children}</>

  const permisos = await getPermisosDeRol(usuario.rol_id)

  return (
    <div className="flex min-h-screen bg-[#F4F5F7] text-slate-900">
      {/* ── Barra Lateral Izquierda (fija) ─────────────────────────── */}
      <aside className="sticky top-0 flex h-screen w-64 flex-col justify-between border-r border-slate-200/80 bg-white p-4">
        {/* Sección superior: logo y navegación por paquetes */}
        <div className="space-y-6">
          <Link href="/" className="block px-3 py-2 text-xl font-bold tracking-wider text-slate-900">
            SmartService
          </Link>

          <NavegacionPaquetes permisos={permisos} />
        </div>

        {/* Sección inferior: usuario, rol y cerrar sesión */}
        <div className="space-y-3 border-t border-slate-200/80 pt-4">
          <div className="flex items-center gap-3 px-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold uppercase text-slate-700">
              {usuario.nombre.trim().charAt(0) || '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{usuario.nombre}</p>
              <BadgeRol rol={usuario.rol?.nombre} className="mt-1" />
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

      {/* ── Área de contenido principal ────────────────────────────── */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  )
}