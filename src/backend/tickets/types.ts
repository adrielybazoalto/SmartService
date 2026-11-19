import type { Tables } from '@/lib/supabase/types'
import type { EstadoTicket, TipoTicket, UrgenciaTicket } from './constantes'
import type { SistemaBuscable } from './busqueda'

export type MantenimientoTicket = Tables<'mantenimiento_ticket'>

/** Sistema instalado elegible para un ticket (cliente y establecimiento activos). */
export type SistemaOpcion = SistemaBuscable

/** Fila del listado de tickets (CU18, paso 1). */
export interface TicketListado {
  id: number
  codigo: string
  fecha_reporte: string
  estado: EstadoTicket
  tipo: TipoTicket
  urgencia: UrgenciaTicket | null
  descripcion: string
  sistema: { id: number; nombre: string }
  establecimiento: { id: number; nombre: string }
  cliente: { id: number; nombre: string }
  orden: { id: number; codigo_orden: string; estado: string } | null
}
