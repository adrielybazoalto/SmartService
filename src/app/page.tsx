import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth'
import { logoutAction } from '@/app/actions/auth'

export default async function Home() {
  const usuario = await getCurrentUser()

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-6 bg-zinc-50 px-4 dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight">SmartService</h1>

      {usuario ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-zinc-600 dark:text-zinc-400">
            Sesión iniciada como{' '}
            <span className="font-medium text-zinc-900 dark:text-zinc-50">
              {usuario.nombre}
            </span>
          </p>

          <div className="flex items-center gap-3">
            <Link
              href="/perfil"
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
            >
              Mi perfil (CU05)
            </Link>

            <form action={logoutAction}>
              <button
                type="submit"
                className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      ) : (
        <p className="text-zinc-500">Redirigiendo a /login…</p>
      )}
    </main>
  )
}