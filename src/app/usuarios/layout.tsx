import { requerirAccesoModulo } from '@/lib/permisos'

/** Protección RBAC de /usuarios: solo roles con permiso USUARIOS en la BD. */
export default async function LayoutUsuarios({
  children,
}: {
  children: React.ReactNode
}) {
  await requerirAccesoModulo('/usuarios')
  return children
}