import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getPermisosDeRol } from '@/lib/permisos'
import { PAQUETES } from '@/lib/navigation'
import { PanelModulos, type ModuloConPaquete } from '@/components/panel-modulos'
import { BadgeRol } from '@/components/badge-rol'
import { PageHeaderBadge } from '@/components/page-header-badge'

/**
 * Panel principal. Muestra las tarjetas de los casos de uso de TODOS los
 * paquetes habilitados en lib/navigation.ts (filtrados por el permiso activo
 * del rol — RBAC en BD, ROL_FUNCION ⋈ FUNCION, acción LEER) y las filtra por paquete con
 * las pestañas de `PanelModulos` (Todos / P1–P4). La selección se comparte con
 * el Sidebar mediante `PaqueteSeleccionadoProvider` (ver sidebar.tsx).
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>
}) {
  const usuario = await getCurrentUser()

  // ---------------------------------------------------------------------------
  // CORRECCIÓN CLAVE (CU01): Si no hay un usuario autenticado en la sesión, se
  // fuerza la redirección inmediata al formulario de inicio de sesión.
  // ---------------------------------------------------------------------------
  if (!usuario) {
    redirect('/login')
  }

  const { aviso } = await searchParams
  const sinPermiso = aviso === 'sin_permiso'

  const permisos = await getPermisosDeRol(usuario.rol_id)

  // Módulos permitidos de cada paquete habilitado (excluye "Inicio"), etiquetados
  // con su paquete para que el panel pueda filtrarlos por pestaña.
  const modulos: ModuloConPaquete[] = PAQUETES.filter((p) => p.habilitado).flatMap(
    (paquete) =>
      paquete.items
        .filter(
          (item) =>
            item.id !== 'inicio' &&
            item.clave !== '' &&
            permisos.includes(item.clave),
        )
        .map((item) => ({
          paqueteId: paquete.id,
          clave: item.clave,
          ruta: item.ruta,
          etiqueta: item.etiqueta,
          descripcion: item.descripcion ?? '',
        })),
  )

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

      <PanelModulos modulos={modulos} />
    </main>
  )
}
