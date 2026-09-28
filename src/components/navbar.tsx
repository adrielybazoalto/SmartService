import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { logoutAction } from '@/app/actions/auth'

const enlaces = [
  { href: '/perfil', etiqueta: 'Mi perfil' },
  { href: '/usuarios', etiqueta: 'Usuarios' },
  { href: '/roles', etiqueta: 'Roles' },
  { href: '/bitacora', etiqueta: 'Bitácora' },
] as const

/**
 * Barra de navegación global (CU05 a CU06). Solo se renderiza con sesión
 * activa: muestra el acceso a todas las rutas unificadas del equipo y el
 * botón de cerrar sesión (Server Action). Los enlaces también se obtienen
 * gracias a que el layout es dinámico (getCurrentUser lee la sesión).
 */
export async function Navbar() {
  const usuario = await getCurrentUser()
  if (!usuario) return null

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4">
        {/* Marca */}
        <Link
          href="/"
          className="shrink-0 text-lg font-semibold tracking-tight text-zinc-900 transition-colors hover:text-emerald-600 dark:text-zinc-50 dark:hover:text-emerald-400"
        >
          SmartService
        </Link>

        {/* Enlaces a las rutas unificadas */}
        <nav className="hidden items-center gap-1 sm:flex" aria-label="Navegación principal">
          {enlaces.map((enlace) => (
            <Link
              key={enlace.href}
              href={enlace.href}
              className="rounded-full px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              {enlace.etiqueta}
            </Link>
          ))}
        </nav>

        {/* Usuario y cierre de sesión */}
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-sm text-zinc-500 dark:text-zinc-400 md:block">
            {usuario.nombre}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="cursor-pointer rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      </div>

      {/* Enlaces de bajo ancho (móvil) */}
      <nav
        className="flex items-center justify-center gap-1 border-t border-zinc-200 py-2 sm:hidden dark:border-zinc-800"
        aria-label="Navegación móvil"
      >
        {enlaces.map((enlace) => (
          <Link
            key={enlace.href}
            href={enlace.href}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
          >
            {enlace.etiqueta}
          </Link>
        ))}
      </nav>
    </header>
  )
}