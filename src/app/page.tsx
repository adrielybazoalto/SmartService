import { getCurrentUser } from '@/lib/auth'

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>
}) {
  const usuario = await getCurrentUser()
  const { aviso } = await searchParams
  const sinPermiso = aviso === 'sin_permiso'

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 dark:bg-black">
      {sinPermiso && (
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          No tiene permisos para acceder a este módulo.
        </div>
      )}

      {usuario ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">
            Hola, {usuario.nombre}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Bienvenido a SmartService. Usa la barra de navegación para acceder
            a los módulos permitidos de tu rol.
          </p>
        </>
      ) : (
        <p className="text-zinc-500">Redirigiendo a /login…</p>
      )}
    </main>
  )
}