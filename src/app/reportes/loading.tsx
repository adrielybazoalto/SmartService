export default function CargandoReportes() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <div className="tarjeta flex flex-col gap-3 p-5 sm:p-6">
        <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200" />
        <div className="h-7 w-72 max-w-full animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-100" />
      </div>
      <div className="tarjeta h-48 animate-pulse p-4 sm:p-5" />
    </main>
  )
}
