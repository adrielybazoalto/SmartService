'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'
import type { ProveedorCompraDTO } from '@/backend/compras/types'
import { Spinner } from '../inventario/componentes'
import { queryFiltrosCompras, type ValoresFiltrosCompras } from './logica'

const VACIO: ValoresFiltrosCompras = { proveedor: '', tipo: '', nro: '', desde: '', hasta: '' }

/** Filtros del listado en la URL (?proveedor=&tipo=&nro=&desde=&hasta=), como en /inventario. */
export function FiltrosCompras({
  valores,
  proveedores,
  hoy,
}: {
  valores: ValoresFiltrosCompras
  proveedores: ProveedorCompraDTO[]
  hoy: string
}) {
  const router = useRouter()
  const ruta = usePathname()
  const [f, setF] = useState(valores)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()

  function navegar(v: ValoresFiltrosCompras) {
    const qs = queryFiltrosCompras(v)
    iniciar(() => router.push(qs ? `${ruta}?${qs}` : ruta))
  }

  function alEnviar(e: FormEvent) {
    e.preventDefault()
    if (f.desde && f.hasta && f.desde > f.hasta) {
      setError('La fecha inicial no puede ser posterior a la final.')
      return
    }
    setError(null)
    navegar(f)
  }

  function limpiar() {
    setF(VACIO)
    setError(null)
    navegar(VACIO)
  }

  const etiqueta = 'mb-1 block text-xs font-semibold text-slate-500'

  return (
    <form
      onSubmit={alEnviar}
      role="search"
      noValidate
      className="tarjeta grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1.6fr_0.9fr_1.2fr_1fr_1fr_auto] lg:items-end"
    >
      <div>
        <label htmlFor="fc-proveedor" className={etiqueta}>
          Proveedor
        </label>
        <select id="fc-proveedor" value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} className="campo-select">
          <option value="">Todos</option>
          {/* Un filtro de la URL con un proveedor ya inactivo se conserva */}
          {f.proveedor && !proveedores.some((p) => String(p.id) === f.proveedor) && (
            <option value={f.proveedor}>Proveedor #{f.proveedor}</option>
          )}
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.razonSocial}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="fc-tipo" className={etiqueta}>
          Documento
        </label>
        <select
          id="fc-tipo"
          value={f.tipo}
          onChange={(e) => setF({ ...f, tipo: e.target.value as ValoresFiltrosCompras['tipo'] })}
          className="campo-select"
        >
          <option value="">Todos</option>
          <option value="FACTURA">Factura</option>
          <option value="NOTA">Nota</option>
        </select>
      </div>
      <div>
        <label htmlFor="fc-nro" className={etiqueta}>
          N.º de documento
        </label>
        <input
          id="fc-nro"
          type="search"
          value={f.nro}
          onChange={(e) => setF({ ...f, nro: e.target.value })}
          maxLength={50}
          placeholder="Ej. 001-2345"
          className="campo-input"
        />
      </div>
      <div>
        <label htmlFor="fc-desde" className={etiqueta}>
          Desde
        </label>
        <input id="fc-desde" type="date" value={f.desde} max={f.hasta || hoy} onChange={(e) => setF({ ...f, desde: e.target.value })} className="campo-input" />
      </div>
      <div>
        <label htmlFor="fc-hasta" className={etiqueta}>
          Hasta
        </label>
        <input
          id="fc-hasta"
          type="date"
          value={f.hasta}
          min={f.desde || undefined}
          max={hoy}
          onChange={(e) => setF({ ...f, hasta: e.target.value })}
          className="campo-input"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'fc-error' : undefined}
        />
      </div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
        <button type="submit" disabled={pendiente} className="btn-primario flex-1 lg:flex-none">
          {pendiente && <Spinner />}
          Filtrar
        </button>
        <button
          type="button"
          onClick={limpiar}
          disabled={pendiente}
          className="flex-1 cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 lg:flex-none"
        >
          Limpiar
        </button>
      </div>
      {error && (
        <p id="fc-error" role="alert" className="text-xs font-medium text-rose-600 sm:col-span-2 lg:col-span-6">
          {error}
        </p>
      )}
    </form>
  )
}
