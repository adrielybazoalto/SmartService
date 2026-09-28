import { requerirAccesoModulo } from '@/lib/permisos'

/** Protección RBAC de /roles: solo roles con permiso ROLES en la BD. */
export default async function LayoutRoles({
  children,
}: {
  children: React.ReactNode
}) {
  await requerirAccesoModulo('/roles')
  return children
}