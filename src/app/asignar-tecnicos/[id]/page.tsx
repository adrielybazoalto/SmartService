import Link from 'next/link'
import { obtenerOrdenConTecnicosAction } from '@/app/actions/asignaciones'
import { PageHeaderBadge } from '@/components/page-header-badge'
import { GestorCuadrilla } from '../gestor-cuadrilla'

export const metadata = {
  title: 'Asignar cuadrilla — SmartService',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AsignarCuadrillaPage({ params }: PageProps) {
  const { id } = await params
  const ordenId = Number(id)

  let datos: Awaited<ReturnType<typeof obtenerOrdenConTecnicosAction>> | null = null
  let errorMensaje: string | null = null

  try {
    datos = await obtenerOrdenConTecnicosAction(ordenId)
  } catch (err) {
    errorMensaje = err instanceof Error ? err.message : 'Error al cargar la orden de trabajo.'
  }

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-1.5">
        <PageHeaderBadge
          paquete="P3"
          cu="CU11"
          titulo="PROGRAMAR Y ASIGNAR PERSONAL TÉCNICO"
        />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {datos && !datos.modificable ? 'Cuadrilla de la orden' : 'Asignar cuadrilla'}
        </h1>
        <Link href="/asignar-tecnicos" className="text-sm text-slate-500 hover:text-slate-700">
          ← Volver a las órdenes
        </Link>
      </div>

      {errorMensaje || !datos ? (
        <p className="mensaje-error">{errorMensaje ?? 'No se pudo cargar la orden.'}</p>
      ) : (
        <GestorCuadrilla datos={datos} />
      )}
    </main>
  )
}
