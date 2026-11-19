import type { ReactNode } from 'react'
import { requerirAccesoModulo } from '@/lib/permisos'

/**
 * Control de Permisos (RBAC) del módulo Tickets de Soporte (CU18).
 * Valida el permiso LEER de MANTENIMIENTO_TICKETS (/tickets-soporte).
 */
export default async function TicketsSoporteLayout({ children }: { children: ReactNode }) {
  await requerirAccesoModulo('/tickets-soporte')
  return <>{children}</>
}
