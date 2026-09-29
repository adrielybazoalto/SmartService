import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { getModulosPermitidos } from '@/lib/permisos'
import { TarjetaModulo } from '@/components/tarjeta-modulo'
import { BadgeRol } from '@/components/badge-rol'

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
    <main className="mx-auto flex min-h-full w-full max-w-6xl flex-1 flex-col gap-8 bg-slate-100/70 px-4 py-8">
      {sinPermiso && (
        <div className="mensaje-error text-center">
          No tiene permisos para acceder a este módulo.
        </div>
      )}

      {usuario && (
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Hola, {usuario.nombre}
            </h1>
            {usuario.rol?.nombre && <BadgeRol rol={usuario.rol.nombre} />}
          </div>
          <p className="text-slate-500">
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
          <p className="text-slate-500">
            No tienes módulos asignados a tu rol.
          </p>
          <Link href="/perfil" className="text-sm font-semibold text-lime-700 hover:underline hover:text-lime-800">
            Ir a mi perfil
          </Link>
        </div>
      )}
    </main>
  )
}