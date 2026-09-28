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
      className="flex flex-wrap items-end gap-4 rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="fecha_inicio" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Desde
        </label>
        <input
          id="fecha_inicio"
          type="date"
          value={filtros.fecha_inicio}
          onChange={(e) => setFiltros({ ...filtros, fecha_inicio: e.target.value })}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="fecha_fin" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Hasta
        </label>
        <input
          id="fecha_fin"
          type="date"
          value={filtros.fecha_fin}
          onChange={(e) => setFiltros({ ...filtros, fecha_fin: e.target.value })}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="usuario_id" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          ID de usuario
        </label>
        <input
          id="usuario_id"
          type="number"
          min={1}
          placeholder="Todos"
          value={filtros.usuario_id}
          onChange={(e) => setFiltros({ ...filtros, usuario_id: e.target.value })}
          className="w-28 rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="accion" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Tipo de acción
        </label>
        <input
          id="accion"
          type="text"
          placeholder="Ej: INICIO_SESION"
          value={filtros.accion}
          onChange={(e) => setFiltros({ ...filtros, accion: e.target.value })}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900"
        >
          Filtrar
        </button>
        <button
          type="button"
          onClick={handleLimpiar}
          className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
        >
          Limpiar
        </button>
      </div>
    </form>
  )
}