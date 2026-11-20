import type { ReactNode } from 'react'
import { requerirAccesoModulo } from '@/lib/permisos'

/**
 * Control de Permisos (RBAC) del módulo Reportes (CU20).
 * Paso 2: valida el permiso LEER de REPORTES (/reportes). Sin sesión, CU01.
 */
export default async function ReportesLayout({ children }: { children: ReactNode }) {
  await requerirAccesoModulo('/reportes')
  return <>{children}</>
}
