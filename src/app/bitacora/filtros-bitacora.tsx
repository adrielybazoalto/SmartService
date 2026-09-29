'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'

interface FiltrosBitacoraProps {
  valoresIniciales: {
    fecha_inicio: string
    fecha_fin: string
    usuario_id: string
    accion: string
  }
}

export function FiltrosBitacora({ valoresIniciales }: FiltrosBitacoraProps) {
  const router = useRouter()
  const [filtros, setFiltros] = useState(valoresIniciales)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()

    // Los <input type="date"> entregan "YYYY-MM-DD"; el schema exige
    // ISO datetime completo, así que convertimos aquí antes de enviar.
    if (filtros.fecha_inicio) {
      params.set('fecha_inicio', new Date(`${filtros.fecha_inicio}T00:00:00`).toISOString())
    }
    if (filtros.fecha_fin) {
      params.set('fecha_fin', new Date(`${filtros.fecha_fin}T23:59:59`).toISOString())
    }
    if (filtros.usuario_id) params.set('usuario_id', filtros.usuario_id)
    if (filtros.accion) params.set('accion', filtros.accion)

    router.push(`/bitacora?${params.toString()}`)
  }

  function handleLimpiar() {
    setFiltros({ fecha_inicio: '', fecha_fin: '', usuario_id: '', accion: '' })
    router.push('/bitacora')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="fecha_inicio" className="text-xs font-medium text-slate-500">
          Desde
        </label>
        <input
          id="fecha_inicio"
          type="date"
          value={filtros.fecha_inicio}
          onChange={(e) => setFiltros({ ...filtros, fecha_inicio: e.target.value })}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none transition-all focus:border-lime-400 focus:ring-2 focus:ring-lime-300/50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fecha_fin" className="text-xs font-medium text-slate-500">
          Hasta
        </label>
        <input
          id="fecha_fin"
          type="date"
          value={filtros.fecha_fin}
          onChange={(e) => setFiltros({ ...filtros, fecha_fin: e.target.value })}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none transition-all focus:border-lime-400 focus:ring-2 focus:ring-lime-300/50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="usuario_id" className="text-xs font-medium text-slate-500">
          ID de usuario
        </label>
        <input
          id="usuario_id"
          type="number"
          min={1}
          placeholder="Todos"
          value={filtros.usuario_id}
          onChange={(e) => setFiltros({ ...filtros, usuario_id: e.target.value })}
          className="w-28 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none transition-all focus:border-lime-400 focus:ring-2 focus:ring-lime-300/50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="accion" className="text-xs font-medium text-slate-500">
          Tipo de acción
        </label>
        <input
          id="accion"
          type="text"
          placeholder="Ej: INICIO_SESION"
          value={filtros.accion}
          onChange={(e) => setFiltros({ ...filtros, accion: e.target.value })}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none transition-all focus:border-lime-400 focus:ring-2 focus:ring-lime-300/50"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="cursor-pointer rounded-xl bg-lime-400 px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-sm shadow-lime-200/60 transition-colors hover:bg-lime-300"
        >
          Filtrar
        </button>
        <button
          type="button"
          onClick={handleLimpiar}
          className="cursor-pointer rounded-xl border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Limpiar
        </button>
      </div>
    </form>
  )
}