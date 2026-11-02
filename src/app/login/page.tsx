import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
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

  if (await getCurrentUser()) redirect(destino)

  // El diseño visual (tema claro PULSE, tarjeta blanca con acento menta) vive en LoginForm
  return <LoginForm destino={destino} />
}