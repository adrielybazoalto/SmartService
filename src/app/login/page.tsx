import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Iniciar sesión — SmartService',
}

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  const destino = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'

  // El diseño visual (fondo oscuro, efectos, tarjeta glass) vive en LoginForm
  return <LoginForm destino={destino} />
}