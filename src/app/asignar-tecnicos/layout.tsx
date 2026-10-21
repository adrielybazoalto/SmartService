import type { ReactNode } from 'react'
import { requerirAccesoModulo } from '@/lib/permisos'

export default async function AsignarTecnicosLayout({ children }: { children: ReactNode }) {
  await requerirAccesoModulo('/asignar-tecnicos')
  return <>{children}</>
}
