import { requerirAccesoModulo } from '@/lib/permisos'

/** Protección RBAC de /cotizaciones: solo roles con permiso COTIZACIONES en la BD. */
export default async function LayoutCotizaciones({
  children,
}: {
  children: React.ReactNode
}) {
  await requerirAccesoModulo('/cotizaciones')
  return children
}