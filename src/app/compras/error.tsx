'use client'

import Link from 'next/link'
import { useEffect } from 'react'

/** Error inesperado al renderizar /compras (los errores de negocio se muestran en la página). */
export default function ErrorCompras({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('[CU15] Error al mostrar compras:', error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-8">
      <div role="alert" className="mensaje-error">
        <p className="font-semibold">No se pudo mostrar el módulo de compras.</p>
        <p className="mt-1">Intente nuevamente. Si el problema continúa, contacte al administrador.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => retry()} className="btn-primario w-fit">
          Reintentar
        </button>
        <Link href="/compras" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Ir al listado de compras
        </Link>
      </div>
    </main>
  )
}
