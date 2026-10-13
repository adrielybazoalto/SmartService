import { requerirAccesoModulo } from '@/lib/permisos'

/** Protección RBAC de /servicios: solo roles con permiso SERVICIOS en la BD. */
export default async function LayoutServicios({
  children,
}: {
  children: React.ReactNode
}) {
  await requerirAccesoModulo('/servicios')
  return children
}