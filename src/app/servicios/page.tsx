import { listarServiciosAction } from '@/app/actions/servicios'
import { PageHeaderBadge } from '@/components/page-header-badge'
import { FiltrosServicios } from './filtros-servicios'
import { GestorServicios } from './gestor-servicios'

export const metadata = {
  title: 'Servicios Técnicos y Tarifas — SmartService',
}

const ESTADOS = ['todos', 'activos', 'inactivos'] as const

interface PageProps {
  searchParams: Promise<{ q?: string; estado?: string }>
}

export default async function ServiciosPage({ searchParams }: PageProps) {
  const params = await searchParams
  const q = (params.q ?? '').trim().slice(0, 100)
  const estado = ESTADOS.find((e) => e === params.estado) ?? 'todos'

  let servicios: Awaited<ReturnType<typeof listarServiciosAction>> = []
  let errorMensaje: string | null = null

  try {
    servicios = await listarServiciosAction({ q: q || undefined, estado })
  } catch (err) {
    errorMensaje = err instanceof Error ? err.message : 'Error al cargar los servicios.'
  }

  return (
    <main className="flex flex-col gap-6 p-8">
      <div className="flex flex-col gap-1.5">
        <PageHeaderBadge
          paquete="P3"
          cu="CU17"
          titulo="GESTIONAR CATÁLOGO DE SERVICIOS TÉCNICOS Y TARIFAS"
        />
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Servicios Técnicos y Tarifas
        </h1>
      </div>

      <FiltrosServicios valoresIniciales={{ q, estado }} />

      {errorMensaje ? (
        <p className="mensaje-error">{errorMensaje}</p>
      ) : (
        <GestorServicios servicios={servicios} hayFiltros={q !== '' || estado !== 'todos'} />
      )}
    </main>
  )
}