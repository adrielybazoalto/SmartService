'use client'

import { useEffect } from 'react'

/** Error inesperado al renderizar /inventario (los errores de negocio se muestran en la página). */
export default function ErrorInventario({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('[CU16] Error al mostrar el inventario:', error)
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-8">
      <div role="alert" className="mensaje-error">
        <p className="font-semibold">No se pudo mostrar el inventario.</p>
        <p className="mt-1">Intente nuevamente. Si el problema continúa, contacte al administrador.</p>
      </div>
      <button type="button" onClick={() => retry()} className="btn-primario w-fit">
        Reintentar
      </button>
    </main>
  )
}
