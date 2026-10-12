'use client'

/**
 * Piezas de interfaz propias de CU15 (tema claro "PULSE"). Modal, Campo,
 * Spinner y demás se reutilizan de /inventario (CU16) sin modificarlos.
 */

/**
 * Insignia de paquete y caso de uso con el mismo estilo que PageHeaderBadge
 * (local por el mismo motivo que InsigniaCU16: lib/navigation.ts aún describe
 * el P2 del Ciclo 1).
 */
export function InsigniaCU15() {
  const partes = ['P2: GESTIÓN COMERCIAL, CLIENTES, CATÁLOGO Y VENTAS', 'CU15', 'REGISTRAR COMPRAS DE EQUIPOS E INSUMOS']
  return (
    <span className="inline-flex w-fit flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-lime-200 bg-lime-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-lime-700 print:hidden">
      {partes.map((parte, i) => (
        <span key={parte} className="inline-flex items-center gap-x-1.5">
          {i > 0 && (
            <span aria-hidden="true" className="text-lime-500">
              •
            </span>
          )}
          {parte}
        </span>
      ))}
    </span>
  )
}

/** Tipo de documento de respaldo como etiqueta (FACTURA / NOTA). */
export function EtiquetaDocumento({ tipo }: { tipo: string }) {
  const factura = tipo === 'FACTURA'
  return (
    <span
      className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        factura ? 'border-sky-200 bg-sky-50 text-sky-700' : 'border-violet-200 bg-violet-50 text-violet-700'
      }`}
    >
      {tipo}
    </span>
  )
}

/** Abre el diálogo de impresión del navegador (sin dependencias). */
export function BotonImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 print:hidden"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z" />
      </svg>
      Imprimir comprobante
    </button>
  )
}
