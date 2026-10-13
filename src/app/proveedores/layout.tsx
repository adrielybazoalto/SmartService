import { requerirAccesoModulo } from '@/lib/permisos'

/** Protección RBAC de /proveedores: solo roles con el permiso PROVEEDORES en la BD. */
export default async function LayoutProveedores({
  children,
}: {
  children: React.ReactNode
}) {
  await requerirAccesoModulo('/proveedores')
  return children
}
