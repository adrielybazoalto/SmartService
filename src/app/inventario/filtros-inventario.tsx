'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
import type { CategoriaDTO } from '@/backend/inventario/types'
import { Spinner } from './componentes'

export interface ValoresFiltros {
  texto: string
  categoria: string
  estado: '' | 'todos'
  critico: boolean
}

/** Filtros del catálogo en la URL (?texto=&categoria=&estado=todos&critico=1), como en /bitacora. */
export function FiltrosInventario({ valores, categorias }: { valores: ValoresFiltros; categorias: CategoriaDTO[] }) {
  const router = useRouter()
  const ruta = usePathname()
  const [f, setF] = useState(valores)
  const [pendiente, iniciar] = useTransition()

  function navegar(v: ValoresFiltros) {
    const params = new URLSearchParams()
    if (v.texto.trim()) params.set('texto', v.texto.trim())
    if (v.categoria) params.set('categoria', v.categoria)
    if (v.estado) params.set('estado', v.estado)
    if (v.critico) params.set('critico', '1')
    const qs = params.toString()
    iniciar(() => router.push(qs ? `${ruta}?${qs}` : ruta))
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault()
    navegar(f)
  }

  function limpiar() {
    const vacio: ValoresFiltros = { texto: '', categoria: '', estado: '', critico: false }
    setF(vacio)
    navegar(vacio)
  }

  return (
    <form onSubmit={alEnviar} role="search" className="tarjeta grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] lg:items-end">
      <div>
        <label htmlFor="f-texto" className="mb-1 block text-xs font-semibold text-slate-500">
          Buscar
        </label>
        <input
          id="f-texto"
          type="search"
          value={f.texto}
          onChange={(e) => setF({ ...f, texto: e.target.value })}
          maxLength={100}
          placeholder="Nombre o código…"
          className="campo-input"
        />
      </div>
      <div>
        <label htmlFor="f-categoria" className="mb-1 block text-xs font-semibold text-slate-500">
          Categoría
        </label>
        <select id="f-categoria" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} className="campo-select">
          <option value="">Todas</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="f-estado" className="mb-1 block text-xs font-semibold text-slate-500">
          Estado
        </label>
        <select id="f-estado" value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as ValoresFiltros['estado'] })} className="campo-select">
          <option value="">Solo activos</option>
          <option value="todos">Activos e inactivos</option>
        </select>
      </div>
      <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center lg:col-span-1">
        <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-slate-600">
          <input
            type="checkbox"
            checked={f.critico}
            onChange={(e) => setF({ ...f, critico: e.target.checked })}
            className="h-4 w-4 accent-rose-600"
          />
          Solo stock crítico
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={pendiente} className="btn-primario flex-1 sm:flex-none">
            {pendiente && <Spinner />}
            Filtrar
          </button>
          <button
            type="button"
            onClick={limpiar}
            disabled={pendiente}
            className="flex-1 cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 sm:flex-none"
          >
            Limpiar
          </button>
        </div>
      </div>
    </form>
  )
}
