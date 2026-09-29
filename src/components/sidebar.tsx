import Link from 'next/link'
import type { ReactNode } from 'react'
import { getCurrentUser } from '@/lib/auth'
import { getPermisosDeRol } from '@/lib/permisos'
import { PAQUETES } from '@/lib/navigation'
import { logoutAction } from '@/app/actions/auth'
import { EnlaceSidebar } from '@/components/sidebar-enlace'
import { BadgeRol } from '@/components/badge-rol'

/**
 * LAYOUT GLOBAL (Sidebar izquierda + contenido) — tema claro "PULSE".
 * La navegación se agrupa por PAQUETES (ver lib/navigation.ts):
 *
 *   P1: SEGURIDAD Y ACCESOS  → habilitado; muestra SOLO los ítems cuyo
 *                              permiso está activo en ROL_PERMISO (BD).
 *   P2 / P3                  → paquetes deshabilitados en este ciclo:
 *                              ítem NO clicable (opacity-50, cursor-not-allowed,
 *                              pointer-events-none, aria-disabled), sin rutas.
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

          <nav className="space-y-4" aria-label="Navegación principal">
            {PAQUETES.map((paquete) => (
              <div key={paquete.id}>
                {paquete.habilitado ? (
                  <>
                    <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {paquete.id} · {paquete.nombre}
                    </p>
                    <div className="space-y-1">
                      {paquete.items
                        .filter((item) => item.clave === '' || permisos.includes(item.clave))
                        .map((item) => (
                          <EnlaceSidebar
                            key={item.id}
                            ruta={item.ruta}
                            etiqueta={item.etiqueta}
                            clave={item.clave || 'INICIO'}
                          />
                        ))}
                    </div>
                  </>
                ) : (
                  /* Paquete deshabilitado: solo el nombre, sin ruta ni enlace */
                  <div
                    aria-disabled="true"
                    className="flex cursor-not-allowed select-none items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 opacity-50 pointer-events-none"
                    title="Disponible en un próximo ciclo"
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
                      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span className="truncate">
                      {paquete.id} · {paquete.nombre}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </nav>
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