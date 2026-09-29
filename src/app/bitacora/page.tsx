import { listarBitacoraAction } from '@/app/actions/bitacora'
import { FiltrosBitacora } from './filtros-bitacora'
import { FechaHoraBolivia } from './fecha-hora'

export const metadata = {
  title: 'Bitácora de Auditoría — SmartService',
}

interface PageProps {
  searchParams: Promise<{
    fecha_inicio?: string
    fecha_fin?: string
    usuario_id?: string
    accion?: string
  }>
}

export default async function BitacoraPage({ searchParams }: PageProps) {
  const params = await searchParams

  const filtros = {
    fecha_inicio: params.fecha_inicio || undefined,
    fecha_fin: params.fecha_fin || undefined,
    usuario_id: params.usuario_id ? Number(params.usuario_id) : undefined,
    accion: params.accion || undefined,
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
      <h1 className="text-2xl font-semibold text-slate-100">
        Bitácora de Auditoría
      </h1>

      <FiltrosBitacora
        valoresIniciales={{
          fecha_inicio: params.fecha_inicio ?? '',
          fecha_fin: params.fecha_fin ?? '',
          usuario_id: params.usuario_id ?? '',
          accion: params.accion ?? '',
        }}
      />

      {errorMensaje && (
        <p className="mensaje-error">
          {errorMensaje}
        </p>
      )}

      {!errorMensaje && eventos.length === 0 && (
        <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-400">
          No se encontraron registros de bitácora para los filtros seleccionados.
        </p>
      )}

      {!errorMensaje && eventos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/60">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-400">Fecha y hora</th>
                <th className="px-4 py-3 font-medium text-slate-400">Usuario (ID)</th>
                <th className="px-4 py-3 font-medium text-slate-400">Acción</th>
                <th className="px-4 py-3 font-medium text-slate-400">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((evento) => (
                <tr key={evento.id} className="border-t border-slate-800">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <FechaHoraBolivia fecha={evento.fecha_hora} />
                  </td>
                  <td className="px-4 py-3">{evento.usuario_id}</td>
                  <td className="px-4 py-3">{evento.accion}</td>
                  <td className="px-4 py-3">{evento.descripcion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}