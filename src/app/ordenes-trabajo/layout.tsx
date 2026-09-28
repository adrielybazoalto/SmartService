import { requerirAccesoModulo } from '@/lib/permisos'

/** Protección RBAC de /ordenes-trabajo: solo roles con permiso ORDENES_TRABAJO en la BD. */
export default async function LayoutOrdenesTrabajo({
  children,
}: {
  children: React.ReactNode
}) {
  await requerirAccesoModulo('/ordenes-trabajo')
  return children
}