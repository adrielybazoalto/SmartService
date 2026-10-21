import Link from 'next/link'
import { listarOrdenesAction } from '@/app/actions/asignaciones'
import { PageHeaderBadge } from '@/components/page-header-badge'
import { FiltrosOrdenes } from './filtros-ordenes'

export const metadata = {
  title: 'Asignar Técnicos — SmartService',
}

const ESTADOS = ['programadas', 'en_curso', 'finalizadas', 'canceladas', 'todas'] as const
const CUADRILLAS = ['todas', 'sin_asignar', 'asignadas'] as const

interface PageProps {
  searchParams: Promise<{ q?: string; estado?: string; cuadrilla?: string; ok?: string }>
}

function formatearTs(ts: string | null): string {
  return ts ? ts.replace('T', ' ').slice(0, 16) : '—'
}

const ETIQUETA_ESTADO: Record<string, string> = {
  PROGRAMADA: 'Programada',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
}

export default async function AsignarTecnicosPage({ searchParams }: PageProps) {
  const params = await searchParams
  const q = (params.q ?? '').trim().slice(0, 50)
  const estado = ESTADOS.find((e) => e === params.estado) ?? 'programadas'
  const cuadrilla = CUADRILLAS.find((c) => c === params.cuadrilla) ?? 'todas'

    const mensajeOk =
    params.ok === 'asignada'
      ? 'Cuadrilla asignada correctamente.'
      : params.ok === 'modificada'
        ? 'Cuadrilla modificada correctamente.'
        : null
  let ordenes: Awaited<ReturnType<typeof listarOrdenesAction>> = []
  let errorMensaje: string | null = null

  try {
    ordenes = await listarOrdenesAction({ q: q || undefined, estado, cuadrilla })
  } catch (err) {
    errorMensaje = err instanceof Error ? err.message : 'Error al cargar las órdenes de trabajo.'
  }

  const hayFiltros = q !== '' || estado !== 'programadas' || cuadrilla !== 'todas'

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-1.5">
        <PageHeaderBadge
          paquete="P3"
          cu="CU11"
          titulo="PROGRAMAR Y ASIGNAR PERSONAL TÉCNICO"
        />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Asignar técnicos</h1>
        <p className="text-sm text-slate-500">
          Asigne o modifique la cuadrilla de las órdenes Programadas; en los demás estados puede consultarla.
        </p>
      </div>
      {mensajeOk && (
        <p className="rounded-xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm text-lime-800">
          {mensajeOk}
        </p>
      )}
      <FiltrosOrdenes valoresIniciales={{ q, estado, cuadrilla }} />

      {errorMensaje ? (
        <p className="mensaje-error">{errorMensaje}</p>
      ) : ordenes.length === 0 ? (
        <p className="rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          {hayFiltros
            ? 'No se encontraron órdenes de trabajo para los filtros seleccionados.'
            : 'No hay órdenes de trabajo programadas para asignar.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-500">Orden</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Tipo de trabajo</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Estado</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Ventana programada</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Cuadrilla</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ordenes.map(({ orden, totalTecnicos, liderNombre }) => {
                const programada = orden.estado === 'PROGRAMADA'
                return (
                  <tr key={orden.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{orden.codigo_orden}</td>
                    <td className="px-4 py-3">{orden.tipo_trabajo}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {ETIQUETA_ESTADO[orden.estado] ?? orden.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {orden.fecha_inicio_programada && orden.fecha_fin_programada
                        ? `${formatearTs(orden.fecha_inicio_programada)} a ${formatearTs(orden.fecha_fin_programada)}`
                        : 'Sin ventana definida'}
                    </td>
                    <td className="px-4 py-3">
                      {totalTecnicos === 0 ? (
                        <span className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                          Sin asignar
                        </span>
                      ) : (
                        <span className="text-slate-700">
                          {totalTecnicos} técnico(s){liderNombre ? ` · líder: ${liderNombre}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/asignar-tecnicos/${orden.id}`}
                        className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                      >
                        {!programada ? 'Ver cuadrilla' : totalTecnicos === 0 ? 'Asignar cuadrilla' : 'Modificar cuadrilla'}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
