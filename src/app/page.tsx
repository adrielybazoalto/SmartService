import { getCurrentUser } from '@/lib/auth'

export default async function Home() {
  const usuario = await getCurrentUser()

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-4 dark:bg-black">
      {usuario ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">
            Hola, {usuario.nombre}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">
            Bienvenido a SmartService. Usa la barra de navegación para acceder
            a los módulos.
          </p>
        </>
      ) : (
        <p className="text-zinc-500">Redirigiendo a /login…</p>
      )}
    </main>
  )
}