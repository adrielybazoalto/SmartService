import { listarBitacoraAction } from '@/app/actions/bitacora'
import { FiltrosBitacora } from './filtros-bitacora'
import { FechaHoraBolivia } from './fecha-hora'
import { PageHeaderBadge } from '@/components/page-header-badge'

export const metadata = {
  title: 'Bitácora de Auditoría — SmartService',
}

interface PageProps {
  searchParams: Promise<{
    fecha_inicio?: string
    fecha_fin?: string
    usuario_id?: string
    accion?: string
    ip?: string
  }>
}

export default async function BitacoraPage({ searchParams }: PageProps) {
  const params = await searchParams

  const filtros = {
    fecha_inicio: params.fecha_inicio || undefined,
    fecha_fin: params.fecha_fin || undefined,
    usuario_id: params.usuario_id ? Number(params.usuario_id) : undefined,
    accion: params.accion || undefined,
    ip: params.ip || undefined,
  }

  let eventos: Awaited<ReturnType<typeof listarBitacoraAction>> = []
  let errorMensaje: string | null = null

  try {
    eventos = await listarBitacoraAction(filtros)
  } catch (err) {
    errorMensaje = err instanceof Error ? err.message : 'Error al cargar la bitácora.'
  }

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-1.5">
        <PageHeaderBadge paquete="P1" cu="CU06" titulo="GESTIONAR BITÁCORA DE AUDITORÍA" />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Bitácora de Auditoría
        </h1>
      </div>

      <FiltrosBitacora
        valoresIniciales={{
          fecha_inicio: params.fecha_inicio ?? '',
          fecha_fin: params.fecha_fin ?? '',
          usuario_id: params.usuario_id ?? '',
          accion: params.accion ?? '',
          ip: params.ip ?? '',
        }}
      />

      {errorMensaje && (
        <p className="mensaje-error">
          {errorMensaje}
        </p>
      )}

      {!errorMensaje && eventos.length === 0 && (
        <p className="rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          No se encontraron registros de bitácora para los filtros seleccionados.
        </p>
      )}

      {!errorMensaje && eventos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-500">Fecha y hora</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Usuario (ID)</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Acción</th>
                <th className="px-4 py-3 font-semibold text-slate-500">IP de origen</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((evento) => (
                <tr key={evento.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <FechaHoraBolivia fecha={evento.fecha_hora} />
                  </td>
                  <td className="px-4 py-3">{evento.usuario_id}</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{evento.accion}</td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-slate-600">
                    {evento.ip && evento.ip !== 'null' && evento.ip.trim() !== '' ? evento.ip : '127.0.0.1'}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{evento.descripcion || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}