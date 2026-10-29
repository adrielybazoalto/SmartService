import type { ReactNode } from 'react'
import { requerirAccesoModulo } from '@/lib/permisos'

/**
 * Control de Permisos (RBAC) para el módulo de Personal Técnico y Jornadas (CU10).
 * Valida que el usuario tenga acceso al módulo registrado para /personal-tecnico.
 */
export default async function PersonalTecnicoLayout({ children }: { children: ReactNode }) {
  await requerirAccesoModulo('/personal-tecnico')
  return <>{children}</>
}
