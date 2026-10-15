'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

interface FiltrosServiciosProps {
  valoresIniciales: { q: string; estado: string }
}

const CLASE_INPUT =
  'rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none transition-all focus:border-lime-400 focus:ring-2 focus:ring-lime-300/50'

export function FiltrosServicios({ valoresIniciales }: FiltrosServiciosProps) {
  const router = useRouter()
  const [filtros, setFiltros] = useState(valoresIniciales)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (filtros.q.trim()) params.set('q', filtros.q.trim())
    if (filtros.estado && filtros.estado !== 'todos') params.set('estado', filtros.estado)
    const qs = params.toString()
    router.push(qs ? `/servicios?${qs}` : '/servicios')
  }

  function handleLimpiar() {
    setFiltros({ q: '', estado: 'todos' })
    router.push('/servicios')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-4 rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-6 shadow-sm"
    >
      <div className="flex flex-col gap-1 w-full sm:w-auto">
        <label htmlFor="q" className="text-xs font-medium text-slate-500">
          Nombre del servicio
        </label>
        <input
          id="q"
          type="text"
          placeholder="Ej: CCTV"
          value={filtros.q}
          onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
          className={`w-full sm:w-64 ${CLASE_INPUT}`}
        />
      </div>

      <div className="flex flex-col gap-1 w-full sm:w-auto">
        <label htmlFor="estado" className="text-xs font-medium text-slate-500">
          Estado
        </label>
        <select
          id="estado"
          value={filtros.estado}
          onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
          className={`w-full sm:w-auto ${CLASE_INPUT}`}
        >
          <option value="todos">Todos</option>
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
        </select>
      </div>

      <div className="flex w-full sm:w-auto gap-2">
        <button
          type="submit"
          className="flex-1 sm:flex-initial cursor-pointer rounded-xl bg-lime-400 px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-sm shadow-lime-200/60 transition-colors hover:bg-lime-300 text-center"
        >
          Filtrar
        </button>
        <button
          type="button"
          onClick={handleLimpiar}
          className="flex-1 sm:flex-initial cursor-pointer rounded-xl border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 text-center"
        >
          Limpiar
        </button>
      </div>
    </form>
  )
}