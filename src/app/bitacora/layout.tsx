import { requerirAccesoModulo } from '@/lib/permisos'

/** Protección RBAC de /bitacora: solo roles con permiso BITACORA en la BD. */
export default async function LayoutBitacora({
  children,
}: {
  children: React.ReactNode
}) {
  await requerirAccesoModulo('/bitacora')
  return children
}