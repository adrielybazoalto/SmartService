import { listarAlertasAccion } from '@/app/actions/alertas'
import { tieneAccionModulo } from '@/lib/permisos'
import { IUAlertasPreventivas } from './iu-alertas-preventivas'

export const metadata = {
  title: 'Alertas Preventivas — SmartService',
}

/**
 * CU19 — Panel de Alertas Preventivas.
 * El layout valida el acceso (LEER); aquí se resuelve la acción de actualizar
 * y se cargan las alertas con sus datos relacionados (leídas incluidas para
 * poder alternar Pendientes / Todas en el panel).
 */
export default async function AlertasPage({
  searchParams,
}: {
  // Filtro enviado por el asistente de navegación por voz (CU19).
  searchParams: Promise<{ filtro?: string }>
}) {
  const { filtro } = await searchParams
  const [actualizar, listado] = await Promise.all([
    tieneAccionModulo('ALERTAS_PREVENTIVAS', 'ACTUALIZAR'),
    listarAlertasAccion(true),
  ])

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <IUAlertasPreventivas
        key={filtro ?? ''}
        alertasIniciales={listado.ok ? listado.data : []}
        permisos={{ actualizar }}
        errorInicial={listado.ok ? null : listado.error}
        filtroInicial={filtro}
      />
    </main>
  )
}
