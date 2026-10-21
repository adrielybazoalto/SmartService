'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { OrdenConTecnicos } from '@/backend/asignaciones'
import { asignarCuadrillaAction, modificarCuadrillaAction } from '@/app/actions/asignaciones'

function formatearTs(ts: string | null): string {
  return ts ? ts.replace('T', ' ').slice(0, 16) : '—'
}

export function GestorCuadrilla({ datos }: { datos: OrdenConTecnicos }) {
  const router = useRouter()
  const { orden, tecnicos } = datos
  const [seleccion, setSeleccion] = useState<number[]>(tecnicos.filter((t) => t.asignado).map((t) => t.id))
  const [liderId, setLiderId] = useState<number | null>(tecnicos.find((t) => t.esLider)?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()

  const bloqueado = !datos.ventanaDefinida
  const hayDisponibles = tecnicos.some((t) => t.disponible)

  function alternar(id: number) {
    setError(null)
    setExito(null)
    if (seleccion.includes(id)) {
      setSeleccion(seleccion.filter((x) => x !== id))
      if (liderId === id) setLiderId(null)
    } else {
      setSeleccion([...seleccion, id])
    }
  }

  function confirmar() {
    setError(null)
    setExito(null)
    const payload = { orden_trabajo_id: orden.id, tecnico_ids: seleccion, lider_id: liderId }
    startTransition(async () => {
      const r = datos.tieneCuadrilla
        ? await modificarCuadrillaAction(payload)
        : await asignarCuadrillaAction(payload)
      if (r.ok) {
        router.push(`/asignar-tecnicos?ok=${datos.tieneCuadrilla ? 'modificada' : 'asignada'}`)
      } else {
        setError(r.error)
      }
    })
  }

  if (!datos.modificable) return <CuadrillaSoloLectura datos={datos} />

  return (
    <div className="flex flex-col gap-4">
      <ResumenOrden datos={datos} />

      {!datos.ventanaDefinida && (
        <p className="mensaje-error">
          La orden no tiene una ventana horaria programada; defínala antes de asignar la cuadrilla
        </p>
      )}
      {!bloqueado && !hayDisponibles && (
        <p className="mensaje-error">No hay técnicos disponibles en la ventana horaria seleccionada</p>
      )}

      {tecnicos.length === 0 ? (
        <p className="rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          No hay técnicos activos registrados.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-500">Asignar</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Técnico</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Disponibilidad</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Líder</th>
              </tr>
            </thead>
            <tbody>
              {tecnicos.map((t) => {
                const marcado = seleccion.includes(t.id)
                return (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Asignar a ${t.nombre}`}
                        checked={marcado}
                        disabled={bloqueado || pendiente || (!t.disponible && !marcado)}
                        onChange={() => alternar(t.id)}
                        className="h-4 w-4 cursor-pointer accent-lime-500 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{t.nombre}</p>
                      {t.telefono && <p className="text-xs text-slate-500">{t.telefono}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {bloqueado ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : t.disponible ? (
                        <span className="rounded-md border border-lime-200 bg-lime-100 px-2 py-0.5 text-xs font-semibold text-lime-700">
                          Disponible
                        </span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className="w-fit rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                            No disponible
                          </span>
                          {t.motivos.map((m) => (
                            <span key={m} className="text-xs text-slate-500">
                              {m}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="radio"
                        name="lider"
                        aria-label={`Designar líder a ${t.nombre}`}
                        checked={liderId === t.id}
                        disabled={bloqueado || pendiente || !marcado}
                        onChange={() => {
                          setError(null)
                          setExito(null)
                          setLiderId(t.id)
                        }}
                        className="h-4 w-4 cursor-pointer accent-lime-500 disabled:cursor-not-allowed"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="mensaje-error whitespace-pre-line">{error}</p>}
      {exito && (
        <p className="rounded-xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm text-lime-800">{exito}</p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={confirmar}
          disabled={bloqueado || pendiente || seleccion.length === 0}
          className="cursor-pointer rounded-xl bg-lime-400 px-4 py-1.5 text-sm font-semibold text-slate-900 shadow-sm shadow-lime-200/60 transition-colors hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendiente ? 'Guardando…' : datos.tieneCuadrilla ? 'Guardar cambios' : 'Asignar cuadrilla'}
        </button>
      </div>
    </div>
  )
}

function ResumenOrden({ datos }: { datos: OrdenConTecnicos }) {
  const { orden } = datos
  return (
    <div className="grid gap-3 rounded-xl border border-slate-200/60 bg-white p-4 text-sm shadow-sm sm:grid-cols-4">
      <div>
        <p className="text-xs font-medium text-slate-500">Orden</p>
        <p className="font-semibold text-slate-900">{orden.codigo_orden}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">Tipo de trabajo</p>
        <p className="text-slate-900">{orden.tipo_trabajo}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">Estado</p>
        <p className="text-slate-900">{orden.estado}</p>
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">Ventana programada</p>
        <p className="text-slate-900">
          {datos.ventanaDefinida
            ? `${formatearTs(orden.fecha_inicio_programada)} a ${formatearTs(orden.fecha_fin_programada)}`
            : 'Sin ventana definida'}
        </p>
      </div>
    </div>
  )
}

/** Subflujo "Consultar cuadrilla": solo lectura, para órdenes que ya no están Programadas. */
function CuadrillaSoloLectura({ datos }: { datos: OrdenConTecnicos }) {
  return (
    <div className="flex flex-col gap-4">
      <ResumenOrden datos={datos} />
      <p className="rounded-xl border border-slate-200/60 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        La orden está en estado {datos.orden.estado}: la cuadrilla solo puede consultarse.
      </p>
      {datos.cuadrilla.length === 0 ? (
        <p className="rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
          La orden no tiene cuadrilla asignada.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200/60 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 font-semibold text-slate-500">Técnico</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Teléfono</th>
                <th className="px-4 py-3 font-semibold text-slate-500">Rol en la cuadrilla</th>
              </tr>
            </thead>
            <tbody>
              {datos.cuadrilla.map((m) => (
                <tr key={m.usuario_id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{m.nombre}</td>
                  <td className="px-4 py-3">{m.telefono ?? '—'}</td>
                  <td className="px-4 py-3">
                    {m.esLider ? (
                      <span className="rounded-md border border-lime-200 bg-lime-100 px-2 py-0.5 text-xs font-semibold text-lime-700">
                        Técnico líder
                      </span>
                    ) : (
                      <span className="text-slate-600">Técnico</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
