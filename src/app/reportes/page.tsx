import { listarOpcionesFiltroAction } from '@/app/actions/reportes'
import { tieneAccionModulo } from '@/lib/permisos'
import { ReportesForm } from './reportes-form'

export const metadata = {
  title: 'Reportes Gerenciales — SmartService',
}

// Los reportes se calculan en cada consulta (RN6): nunca se sirve una copia guardada.
export const dynamic = 'force-dynamic'

/**
 * CU20 — ReportesPage.
 * El layout ya validó el acceso (LEER). Aquí se cargan los catálogos de
 * técnicos activos y categorías (paso 3) y se resuelve si puede exportar.
 */
export default async function ReportesPage() {
  const [opciones, puedeExportar] = await Promise.all([
    listarOpcionesFiltroAction(),
    tieneAccionModulo('REPORTES', 'PROCESAR'),
  ])

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <ReportesForm
        tecnicos={opciones.ok ? opciones.data.tecnicos : []}
        categorias={opciones.ok ? opciones.data.categorias : []}
        puedeExportar={puedeExportar}
        errorInicial={opciones.ok ? null : opciones.error}
      />
    </main>
  )
}
