'use client'

import { useState, useTransition, type FormEvent } from 'react'
import type { Servicio } from '@/backend/servicios'
import {
  actualizarServicioAction,
  cambiarEstadoServicioAction,
  crearServicioAction,
} from '@/app/actions/servicios'
import { PageHeaderBadge } from '@/components/page-header-badge'
import { FiltrosServicios } from './filtros-servicios'

const CLASE_INPUT =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition-all focus:border-lime-400 focus:ring-2 focus:ring-lime-300/50 placeholder:text-slate-400'

function formatearTarifa(valor: string | number): string {
  return Number(valor).toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface GestorServiciosProps {
  servicios: Servicio[]
  hayFiltros: boolean
  valoresFiltros: { q: string; estado: string }
  errorMensaje?: string | null
}

export function GestorServicios({
  servicios,
  hayFiltros,
  valoresFiltros,
  errorMensaje,
}: GestorServiciosProps) {
  // null = cerrado; { servicio: null } = nuevo; { servicio } = editar
  const [formulario, setFormulario] = useState<{ servicio: Servicio | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  function handleEstado(s: Servicio) {
    const verbo = s.activo ? 'desactivar' : 'reactivar'
    if (!window.confirm(`¿Desea ${verbo} el servicio "${s.nombre}"?`)) return
    setError(null)
    startTransition(async () => {
      const r = await cambiarEstadoServicioAction(s.id, !s.activo)
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div className="min-h-screen bg-slate-100/70 p-4 sm:p-6 md:p-10 text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ── Cabecera Principal ─────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200/60">
          <div>
            <PageHeaderBadge
              paquete="P2"
              cu="CU17"
              titulo="GESTIONAR CATÁLOGO DE SERVICIOS TÉCNICOS Y TARIFAS"
            />
            <h1 className="text-2xl font-bold mt-2 text-slate-900">
              Servicios Técnicos y Tarifas
            </h1>
            <p className="text-sm text-slate-500">
              Administración de tarifas base por hora y catálogo de servicios técnicos.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormulario({ servicio: null })}
            className="w-full md:w-auto px-5 py-2.5 bg-lime-400 hover:bg-lime-300 text-slate-900 font-semibold text-sm rounded-xl shadow-sm shadow-lime-200/60 transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <span className="text-lg leading-none">+</span> Nuevo Servicio
          </button>
        </div>

        {/* ── Filtros ─────────────────────────────────────────────────────── */}
        <FiltrosServicios valoresIniciales={valoresFiltros} />

        {/* ── Notificaciones de Error ─────────────────────────────────────── */}
        {errorMensaje && (
          <div className="p-4 rounded-xl text-sm font-medium border border-rose-200 bg-rose-50 text-rose-700">
            ⚠ {errorMensaje}
          </div>
        )}
        {error && (
          <div className="p-4 rounded-xl text-sm font-medium border border-rose-200 bg-rose-50 text-rose-700">
            ⚠ {error}
          </div>
        )}

        {/* ── Tabla Directorio de Servicios ───────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Directorio de Servicios</h2>
              <p className="text-xs text-slate-500">
                {servicios.length} servicio{servicios.length === 1 ? '' : 's'} disponible{servicios.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-4 text-center w-16">ID</th>
                  <th className="p-4">Servicio Técnico</th>
                  <th className="p-4">Descripción</th>
                  <th className="p-4 text-right">Tarifa por Hora</th>
                  <th className="p-4 text-center">Estado</th>
                  <th className="p-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {servicios.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-slate-500">
                      {hayFiltros
                        ? 'No se encontraron servicios para los filtros seleccionados.'
                        : 'Aún no hay servicios registrados en el catálogo.'}
                    </td>
                  </tr>
                ) : (
                  servicios.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-4 text-center font-mono text-xs text-slate-500">{s.id}</td>
                      <td className="p-4 font-semibold text-slate-900">{s.nombre}</td>
                      <td className="p-4 text-xs text-slate-500 max-w-xs">{s.descripcion || '—'}</td>
                      <td className="p-4 text-right font-semibold text-slate-900 whitespace-nowrap">
                        Bs. {formatearTarifa(s.precio_hora_base)}
                      </td>
                      <td className="p-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-lg border ${
                            s.activo
                              ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                              : 'border-slate-200 bg-slate-100 text-slate-500'
                          }`}
                        >
                          {s.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => setFormulario({ servicio: s })}
                            className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
                          >
                            Modificar
                          </button>
                          <button
                            type="button"
                            disabled={pendiente}
                            onClick={() => handleEstado(s)}
                            className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {s.activo ? 'Desactivar' : 'Reactivar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {formulario && (
          <FormularioServicio
            key={formulario.servicio?.id ?? 'nuevo'}
            servicio={formulario.servicio}
            onCerrar={() => setFormulario(null)}
          />
        )}
      </div>
    </div>
  )
}

function FormularioServicio({
  servicio,
  onCerrar,
}: {
  servicio: Servicio | null
  onCerrar: () => void
}) {
  const [nombre, setNombre] = useState(servicio?.nombre ?? '')
  const [tarifa, setTarifa] = useState(
    servicio ? String(Number(servicio.precio_hora_base)) : '',
  )
  const [descripcion, setDescripcion] = useState(servicio?.descripcion ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!nombre.trim()) {
      setError('El nombre del servicio es obligatorio')
      return
    }

    const valor = Number(tarifa.trim().replace(',', '.'))
    if (Number.isNaN(valor) || valor <= 0) {
      setError('La tarifa por hora debe ser un número mayor a cero')
      return
    }

    const datos = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() === '' ? null : descripcion.trim(),
      precio_hora_base: valor,
    }

    startTransition(async () => {
      const r = servicio
        ? await actualizarServicioAction(servicio.id, datos)
        : await crearServicioAction(datos)
      if (r.ok) onCerrar()
      else setError(r.error)
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={servicio ? 'Modificar servicio' : 'Nuevo servicio'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-6 shadow-xl max-h-[90dvh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {servicio ? 'Modificar Servicio Técnico' : 'Nuevo Servicio Técnico'}
            </h2>
            <p className="text-xs text-slate-500">
              {servicio
                ? `ID #${servicio.id} · Ajuste de denominación y tarifa horaria`
                : 'Definición de servicio y tarifa base para cotizaciones'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            ⚠ {error}
          </div>
        )}

        {/* 1. Nombre */}
        <div className="flex flex-col gap-1">
          <label htmlFor="srv-nombre" className="text-xs font-semibold text-slate-600">
            Nombre del Servicio *
          </label>
          <input
            id="srv-nombre"
            type="text"
            required
            placeholder="Ej. Mantenimiento Preventivo CCTV"
            maxLength={150}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={CLASE_INPUT}
          />
        </div>

        {/* 2. Tarifa Base por Hora */}
        <div className="flex flex-col gap-1">
          <label htmlFor="srv-tarifa" className="text-xs font-semibold text-slate-600">
            Tarifa Base por Hora (Bs.) *
          </label>
          <input
            id="srv-tarifa"
            type="text"
            inputMode="decimal"
            placeholder="Ej. 80.00"
            value={tarifa}
            onChange={(e) => setTarifa(e.target.value)}
            className={CLASE_INPUT}
          />
        </div>

        {/* 3. Descripción */}
        <div className="flex flex-col gap-1">
          <label htmlFor="srv-descripcion" className="text-xs font-semibold text-slate-600">
            Descripción del Servicio (opcional)
          </label>
          <textarea
            id="srv-descripcion"
            rows={3}
            placeholder="Detalles sobre el alcance, actividades o herramientas contempladas en este servicio..."
            maxLength={1000}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className={CLASE_INPUT}
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente}
            className="cursor-pointer rounded-xl bg-lime-400 px-5 py-2 text-sm font-semibold text-slate-900 shadow-sm shadow-lime-200/60 transition-colors hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendiente ? 'Guardando…' : 'Guardar Servicio'}
          </button>
        </div>
      </form>
    </div>
  )
}