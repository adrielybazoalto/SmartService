import { listarServiciosAction } from '@/app/actions/servicios'
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
    <GestorServicios
      servicios={servicios}
      hayFiltros={q !== '' || estado !== 'todos'}
      valoresFiltros={{ q, estado }}
      errorMensaje={errorMensaje}
    />
  )
}