'use client'

import { useState, useTransition, type FormEvent } from 'react'
import type { Servicio } from '@/backend/servicios'
import {
  actualizarServicioAction,
  cambiarEstadoServicioAction,
  crearServicioAction,
} from '@/app/actions/servicios'

const CLASE_INPUT =
  'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none transition-all focus:border-lime-400 focus:ring-2 focus:ring-lime-300/50'

function formatearTarifa(valor: string | number): string {
  return Number(valor).toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

interface GestorServiciosProps {
  servicios: Servicio[]
  hayFiltros: boolean
}

export function GestorServicios({ servicios, hayFiltros }: GestorServiciosProps) {
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
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setFormulario({ servicio: null })}
          className="cursor-pointer rounded-xl bg-lime-400 px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-sm shadow-lime-200/60 transition-colors hover:bg-lime-300"
        >
          Nuevo servicio
        </button>
      </div>

      {error && <p className="mensaje-error">{error}</p>}

      {servicios.length === 0 ? (
        <p className="rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          {hayFiltros
            ? 'No se encontraron servicios para los filtros seleccionados.'
            : 'Aún no hay servicios registrados.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-500">ID</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Nombre</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-500">
                  Tarifa por hora
                </th>
                <th className="px-4 py-3 font-semibold text-slate-500">Estado</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {servicios.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">{s.id}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{s.nombre}</p>
                    {s.descripcion && (
                      <p className="text-xs text-slate-500">{s.descripcion}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatearTarifa(s.precio_hora_base)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        s.activo
                          ? 'rounded-md border border-lime-200 bg-lime-100 px-2 py-0.5 text-xs font-semibold text-lime-700'
                          : 'rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500'
                      }
                    >
                      {s.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formulario && (
        <FormularioServicio
          key={formulario.servicio?.id ?? 'nuevo'}
          servicio={formulario.servicio}
          onCerrar={() => setFormulario(null)}
        />
      )}
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
  const [descripcion, setDescripcion] = useState(servicio?.descripcion ?? '')
  const [tarifa, setTarifa] = useState(
    servicio ? String(Number(servicio.precio_hora_base)) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const valor = Number(tarifa.trim().replace(',', '.'))
    if (Number.isNaN(valor)) {
      setError('La tarifa por hora debe ser un número')
      return
    }

    const datos = {
      nombre,
      descripcion: descripcion.trim() === '' ? null : descripcion,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-slate-200/60 bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-bold text-slate-900">
          {servicio ? 'Modificar servicio' : 'Nuevo servicio'}
        </h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="srv-nombre" className="text-xs font-medium text-slate-500">
            Nombre
          </label>
          <input
            id="srv-nombre"
            type="text"
            maxLength={150}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={CLASE_INPUT}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="srv-descripcion" className="text-xs font-medium text-slate-500">
            Descripción
          </label>
          <textarea
            id="srv-descripcion"
            rows={3}
            maxLength={1000}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            className={CLASE_INPUT}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="srv-tarifa" className="text-xs font-medium text-slate-500">
            Tarifa por hora
          </label>
          <input
            id="srv-tarifa"
            type="text"
            inputMode="decimal"
            placeholder="Ej: 80.00"
            value={tarifa}
            onChange={(e) => setTarifa(e.target.value)}
            className={CLASE_INPUT}
          />
        </div>

        {error && <p className="mensaje-error">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            disabled={pendiente}
            className="cursor-pointer rounded-xl border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pendiente}
            className="cursor-pointer rounded-xl bg-lime-400 px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-sm shadow-lime-200/60 transition-colors hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendiente ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}