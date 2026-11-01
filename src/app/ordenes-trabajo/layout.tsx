import type { ReactNode } from 'react'
import { requerirAccesoModulo } from '@/lib/permisos'

/**
 * Control de Permisos (RBAC) para el módulo de Órdenes de Trabajo (CU12).
 * Valida que el usuario tenga el permiso ORDENES_TRABAJO (/ordenes-trabajo).
 */
export default async function OrdenesTrabajoLayout({ children }: { children: ReactNode }) {
  await requerirAccesoModulo('/ordenes-trabajo')
  return <>{children}</>
}
