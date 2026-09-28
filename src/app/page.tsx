import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { getModulosPermitidos } from '@/lib/permisos'
import { TarjetaModulo } from '@/components/tarjeta-modulo'

/**
 * Panel principal: además de la bienvenida renderiza un grid de tarjetas con
 * los módulos permitidos del rol (leídos de ROL_PERMISO ⋈ PERMISO en la BD),
 * cada una con título, descripción, icono y acceso directo a la ruta.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>
}) {
  const usuario = await getCurrentUser()
  const { aviso } = await searchParams
  const sinPermiso = aviso === 'sin_permiso'
  const modulos = await getModulosPermitidos()

  return (
    <main className="mx-auto flex min-h-full w-full max-w-6xl flex-1 flex-col gap-8 bg-zinc-50 px-4 py-8 dark:bg-black">
      {sinPermiso && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          No tiene permisos para acceder a este módulo.
        </div>
      )}

      {usuario && (
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Hola, {usuario.nombre}
            </h1>
            {usuario.rol?.nombre && (
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {usuario.rol.nombre}
              </span>
            )}
          </div>
          <p className="text-zinc-500 dark:text-zinc-400">
            Bienvenido a SmartService. Accede a los módulos disponibles para tu
            rol.
          </p>
        </header>
      )}

      {modulos.length > 0 ? (
        <section
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Módulos disponibles"
        >
          {modulos.map((modulo) => (
            <TarjetaModulo key={modulo.ruta} modulo={modulo} />
          ))}
        </section>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-zinc-500 dark:text-zinc-400">
            No tienes módulos asignados a tu rol.
          </p>
          <Link href="/perfil" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">
            Ir a mi perfil
          </Link>
        </div>
      )}
    </main>
  )
}