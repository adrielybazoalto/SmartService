'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const CLASE_INPUT =
  'rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none transition-all focus:border-lime-400 focus:ring-2 focus:ring-lime-300/50'

export interface ValoresFiltros {
  q: string
  estado: string
  cuadrilla: string
}

const VALORES_POR_DEFECTO: ValoresFiltros = { q: '', estado: 'programadas', cuadrilla: 'todas' }

export function FiltrosOrdenes({ valoresIniciales }: { valoresIniciales: ValoresFiltros }) {
  const router = useRouter()
  const [valores, setValores] = useState<ValoresFiltros>(valoresIniciales)

  function aplicar(v: ValoresFiltros) {
    const params = new URLSearchParams()
    if (v.q.trim()) params.set('q', v.q.trim())
    if (v.estado !== VALORES_POR_DEFECTO.estado) params.set('estado', v.estado)
    if (v.cuadrilla !== VALORES_POR_DEFECTO.cuadrilla) params.set('cuadrilla', v.cuadrilla)
    const qs = params.toString()
    router.push(qs ? `/asignar-tecnicos?${qs}` : '/asignar-tecnicos')
  }

  function cambiar(campo: 'estado' | 'cuadrilla', valor: string) {
    const siguiente = { ...valores, [campo]: valor }
    setValores(siguiente)
    aplicar(siguiente)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        aplicar(valores)
      }}
      className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="ord-q" className="text-xs font-medium text-slate-500">
          Código de orden
        </label>
        <input
          id="ord-q"
          type="text"
          maxLength={50}
          placeholder="Ej: OT-2026"
          value={valores.q}
          onChange={(e) => setValores({ ...valores, q: e.target.value })}
          className={CLASE_INPUT}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ord-estado" className="text-xs font-medium text-slate-500">
          Estado
        </label>
        <select
          id="ord-estado"
          value={valores.estado}
          onChange={(e) => cambiar('estado', e.target.value)}
          className={CLASE_INPUT}
        >
          <option value="programadas">Programadas</option>
          <option value="en_curso">En curso</option>
          <option value="finalizadas">Finalizadas</option>
          <option value="canceladas">Canceladas</option>
          <option value="todas">Todas</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="ord-cuadrilla" className="text-xs font-medium text-slate-500">
          Cuadrilla
        </label>
        <select
          id="ord-cuadrilla"
          value={valores.cuadrilla}
          onChange={(e) => cambiar('cuadrilla', e.target.value)}
          className={CLASE_INPUT}
        >
          <option value="todas">Todas</option>
          <option value="sin_asignar">Sin asignar</option>
          <option value="asignadas">Con cuadrilla</option>
        </select>
      </div>

      <button
        type="submit"
        className="cursor-pointer rounded-xl bg-lime-400 px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-sm shadow-lime-200/60 transition-colors hover:bg-lime-300"
      >
        Buscar
      </button>
      <button
        type="button"
        onClick={() => {
          setValores(VALORES_POR_DEFECTO)
          aplicar(VALORES_POR_DEFECTO)
        }}
        className="cursor-pointer rounded-xl border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
      >
        Limpiar
      </button>
    </form>
  )
}
