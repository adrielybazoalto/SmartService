import type { ReactNode } from 'react'
import { requerirAccesoModulo } from '@/lib/permisos'

// CU13: solo roles con el permiso NOTAS_SERVICIO (Administrador y Encargado).
export default async function LiquidacionLayout({ children }: { children: ReactNode }) {
  await requerirAccesoModulo('/liquidacion')
  return <>{children}</>
}
