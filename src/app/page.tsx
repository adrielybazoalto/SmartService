import Link from 'next/link'
import { redirect } from 'next/navigation' // 1. Importa redirect de Next.js
import { getCurrentUser } from '@/lib/auth'
import { getPermisosDeRol } from '@/lib/permisos'
import { PAQUETES } from '@/lib/navigation'
import { TarjetaModulo } from '@/components/tarjeta-modulo'
import { BadgeRol } from '@/components/badge-rol'
import { PageHeaderBadge } from '@/components/page-header-badge'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>
}) {
  const usuario = await getCurrentUser()

  // ---------------------------------------------------------------------------
  // CORRECCIÓN CLAVE (CU01): Si no hay un usuario autenticado en la sesión,
  // se fuerza la redirección inmediata al formulario de inicio de sesión.
  // ---------------------------------------------------------------------------
  if (!usuario) {
    redirect('/login')
  }

  const { aviso } = await searchParams
  const sinPermiso = aviso === 'sin_permiso'

  const paqueteP1 = PAQUETES.find((p) => p.id === 'P1')
  const itemsP1 = paqueteP1?.habilitado
    ? paqueteP1.items.filter((item) => item.id !== 'inicio' && item.clave !== '')
    : []

  const permisos = await getPermisosDeRol(usuario.rol_id)
  const modulos = itemsP1
    .filter((item) => permisos.includes(item.clave))
    .map((item) => ({
      clave: item.clave,
      ruta: item.ruta,
      etiqueta: item.etiqueta,
      descripcion: item.descripcion ?? '',
    }))

  return (
    <main className="mx-auto flex min-h-full w-full max-w-6xl flex-1 flex-col gap-8 bg-slate-100/70 px-4 py-8">
      {sinPermiso && (
        <div className="mensaje-error text-center">
          No tiene permisos para acceder a este módulo.
        </div>
      )}

      <header className="flex flex-col gap-2">
        <PageHeaderBadge paquete="P1" cu="CU01" />
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