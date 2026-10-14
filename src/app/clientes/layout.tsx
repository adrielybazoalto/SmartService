import { requerirAccesoModulo } from '@/lib/permisos'

/** Protección RBAC de /clientes: solo roles con permiso CLIENTES en la BD. */
export default async function LayoutClientes({
  children,
}: {
  children: React.ReactNode
}) {
  await requerirAccesoModulo('/clientes')
  return children
}