import { requerirAccesoModulo } from '@/lib/permisos'

/** Protección RBAC de /caja: solo roles con permiso CAJA en la BD. */
export default async function LayoutCaja({
  children,
}: {
  children: React.ReactNode
}) {
  await requerirAccesoModulo('/caja')
  return children
}