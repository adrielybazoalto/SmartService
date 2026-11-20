import type { ReactNode } from 'react'
import { requerirAccesoModulo } from '@/lib/permisos'

/**
 * Control de Permisos (RBAC) del módulo Alertas Preventivas (CU19).
 * Valida el permiso LEER de ALERTAS_PREVENTIVAS (/alertas).
 */
export default async function AlertasLayout({ children }: { children: ReactNode }) {
  await requerirAccesoModulo('/alertas')
  return <>{children}</>
}
