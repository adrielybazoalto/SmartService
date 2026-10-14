import { requerirAccesoModulo } from '@/lib/permisos'

/** Protección RBAC de /ventas: solo roles con el permiso VENTAS en la BD. */
export default async function LayoutVentas({
  children,
}: {
  children: React.ReactNode
}) {
  await requerirAccesoModulo('/ventas')
  return children
}
