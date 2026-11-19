'use client'

import { useId, useState } from 'react'
import { Search } from 'lucide-react'
import { etiquetaSistema, filtrarSistemasLibre } from '@/backend/tickets/busqueda'
import type { SistemaOpcion } from '@/backend/tickets/types'

const MAX_VISIBLES = 50

/** Selector buscable de sistema instalado: muestra Cliente > Establecimiento > Sistema. */
export function SelectorSistema({
  sistemas,
  valor,
  onCambiar,
  resaltado = false,
  error,
}: {
  sistemas: SistemaOpcion[]
  valor: number | null
  onCambiar: (id: number | null) => void
  resaltado?: boolean
  error?: string
}) {
  const id = useId()
  const [consulta, setConsulta] = useState('')
  const [buscando, setBuscando] = useState(false)
  const seleccionado = sistemas.find((s) => s.id === valor) ?? null
  const visibles = filtrarSistemasLibre(sistemas, consulta).slice(0, MAX_VISIBLES)
  const marco = resaltado ? 'ring-2 ring-lime-400 bg-lime-50' : ''

  if (seleccionado && !buscando) {
    return (
      <div className={`flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between ${marco}`}>
        <div className="text-sm">
          <p className="font-semibold text-slate-900">{seleccionado.nombre_sistema}</p>
          <p className="text-slate-600">
            {seleccionado.cliente.nombre} &gt; {seleccionado.establecimiento.nombre}
            {seleccionado.numero_serie ? ` · Serie ${seleccionado.numero_serie}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setBuscando(true)
            setConsulta('')
          }}
          className="cursor-pointer self-start rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 sm:self-auto"
        >
          Cambiar
        </button>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-2 rounded-xl ${marco}`}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          id={id}
          type="search"
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Buscar por cliente, establecimiento, sistema o serie…"
          aria-invalid={Boolean(error)}
          aria-controls={`${id}-lista`}
          className="campo-input pl-9"
        />
      </div>
      <ul
        id={`${id}-lista`}
        role="listbox"
        aria-label="Sistemas instalados"
        className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white"
      >
        {visibles.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Sin coincidencias.</li>}
        {visibles.map((s) => (
          <li key={s.id} role="option" aria-selected={s.id === valor}>
            <button
              type="button"
              onClick={() => {
                onCambiar(s.id)
                setBuscando(false)
              }}
              className={`w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-lime-50 ${s.id === valor ? 'bg-lime-100' : ''}`}
            >
              {etiquetaSistema(s)}
              {s.numero_serie && <span className="text-slate-400"> · {s.numero_serie}</span>}
            </button>
          </li>
        ))}
      </ul>
      {seleccionado && (
        <button type="button" onClick={() => setBuscando(false)} className="cursor-pointer self-start text-xs text-slate-500 underline">
          Mantener {seleccionado.nombre_sistema}
        </button>
      )}
    </div>
  )
}
