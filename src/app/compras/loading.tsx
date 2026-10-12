/** Estado de carga de /compras (esqueleto; no muestra datos). */
export default function CargandoCompras() {
  return (
    <main aria-busy="true" className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <p className="sr-only">Cargando compras…</p>
      <div className="tarjeta h-28 animate-pulse bg-white" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="tarjeta h-20 animate-pulse" />
        ))}
      </div>
      <div className="tarjeta h-24 animate-pulse" />
      <div className="tarjeta space-y-3 p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    </main>
  )
}
