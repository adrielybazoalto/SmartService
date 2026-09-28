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

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <LoginForm destino={destino} />
    </main>
  )
}