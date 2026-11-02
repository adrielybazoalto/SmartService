'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  obtenerCotizacionesAccion,
  confirmarAnticipoTarjetaAction,
  rechazarCotizacionAccion,
  permisosCotizacionesAccion,
} from '@/app/actions/cotizaciones'
import { convertirCotizacionAOrdenAccion } from '@/app/actions/ordenes-trabajo'
import { textoAnticipo } from './anticipo'
import { ModalAnticipo, type CotizacionParaAprobar } from './modal-anticipo'

const MSG_PAGO_NO_CONFIRMADO = 'El pago con tarjeta no fue confirmado. La cotización sigue pendiente.'

interface CotizacionParaConvertir {
  id: number
  nro: string
  cliente: string
  sinAnticipo: boolean
}

export default function CotizacionesPage() {
  const router = useRouter()
  const [cotizaciones, setCotizaciones] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)
  const [permisos, setPermisos] = useState({ crear: false, actualizar: false, crearOrden: false, procesar: false })
  const [cotizacionParaAprobar, setCotizacionParaAprobar] = useState<CotizacionParaAprobar | null>(null)
  const [avisoPago, setAvisoPago] = useState<{ ok: boolean; texto: string } | null>(null)
  const retornoAtendido = useRef(false)

  // Estado para el modal de programación y conversión (CU08 -> CU12 -> CU11)
  const [cotizacionParaConvertir, setCotizacionParaConvertir] = useState<CotizacionParaConvertir | null>(null)
  const [fechaProgramada, setFechaProgramada] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [convirtiendo, setConvirtiendo] = useState(false)

  const cargarCotizaciones = async () => {
    setCargando(true)
    try {
      const data = await obtenerCotizacionesAccion()
      setCotizaciones(data)
    } catch (err) {
      console.error('Error al cargar cotizaciones:', err)
    }
    setCargando(false)
  }

  useEffect(() => {
    cargarCotizaciones()
    permisosCotizacionesAccion().then(setPermisos)
  }, [])

  // Retorno de Stripe (?anticipo=exito&session_id=... o ?anticipo=cancelado): se atiende una sola vez
  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search)
    const anticipo = parametros.get('anticipo')
    if (!anticipo || retornoAtendido.current) return
    retornoAtendido.current = true
    const sessionId = parametros.get('session_id')
    window.history.replaceState(null, '', window.location.pathname)

    const resultado =
      anticipo === 'exito' && sessionId
        ? confirmarAnticipoTarjetaAction(sessionId)
        : Promise.resolve({ success: false, message: MSG_PAGO_NO_CONFIRMADO })
    resultado.then((r) => {
      setAvisoPago({ ok: r.success, texto: r.message })
      cargarCotizaciones()
    })
  }, [])

  const handleRechazar = async (id: number, nro: string) => {
    if (confirm(`¿Rechazar la cotización ${nro}?`)) {
      try {
        await rechazarCotizacionAccion(id)
        alert('Cotización rechazada.')
        cargarCotizaciones()
      } catch (err: any) {
        alert('Error: ' + err.message)
      }
    }
  }

  const handleAbrirModalConvertir = (cot: any) => {
    setFechaProgramada('')
    setHoraInicio('')
    setHoraFin('')
    setCotizacionParaConvertir({
      id: cot.id,
      nro: cot.numero_cotizacion,
      cliente: cot.cliente?.nombre || `Cliente #${cot.cliente_id}`,
      sinAnticipo: Number(cot.anticipo_monto ?? 0) <= 0,
    })
  }

  const handleConfirmarConvertir = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cotizacionParaConvertir) return

    if (!fechaProgramada || !horaInicio || !horaFin) {
      alert('Por favor complete todos los datos de fecha y horario programados.')
      return
    }

    if (horaFin <= horaInicio) {
      alert('La hora de fin programada debe ser posterior a la hora de inicio.')
      return
    }

    setConvirtiendo(true)
    try {
      const res = await convertirCotizacionAOrdenAccion(cotizacionParaConvertir.id, {
        fecha_programada: fechaProgramada,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
      })
      if (res.ok) {
        alert(res.mensaje)
        setCotizacionParaConvertir(null)
        router.push(`/asignar-tecnicos/${res.data.id}`)
      } else {
        alert(res.error)
      }
    } catch (err: any) {
      alert('Error: ' + err.message)
    } finally {
      setConvirtiendo(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-4">
        <span className="inline-block bg-[#eefccb] text-[#558a06] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
          P2: GESTIÓN COMERCIAL · CU08 · ELABORAR COTIZACIONES
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Gestión de Cotizaciones y Proformas</h1>
        {permisos.crear && (
        <Link 
          href="/cotizaciones/nuevo" 
          className="bg-[#9fe82e] hover:bg-[#8be01c] text-gray-900 font-semibold px-4 py-2 rounded-xl text-sm shadow-sm transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          + Nueva Cotización
        </Link>
        )}
      </div>

      {avisoPago && (
        <p
          role={avisoPago.ok ? 'status' : 'alert'}
          className={`mb-4 rounded-xl border p-3 text-sm ${
            avisoPago.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {avisoPago.texto}
        </p>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                <th className="py-3 px-4">Nro. Cotización</th>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-4">Fecha Emisión</th>
                <th className="py-3 px-4">Vencimiento</th>
                <th className="py-3 px-4">Total (Bs.)</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4 text-center">Acciones / Gestión</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
              {cargando ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">Cargando cotizaciones...</td>
                </tr>
              ) : cotizaciones.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">No hay cotizaciones registradas aún. ¡Crea la primera!</td>
                </tr>
              ) : (
                cotizaciones.map(cot => (
                  <tr key={cot.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 px-4 font-medium text-gray-900">{cot.numero_cotizacion}</td>
                    <td className="py-4 px-4 font-medium text-gray-800">{cot.cliente?.nombre || `Cliente #${cot.cliente_id}`}</td>
                    <td className="py-4 px-4">{cot.fecha_emision}</td>
                    <td className="py-4 px-4">{cot.fecha_vencimiento || 'N/A'}</td>
                    <td className="py-4 px-4 font-semibold text-blue-600">Bs. {Number(cot.total).toFixed(2)}</td>
                    <td className="py-4 px-4">
                      <span
                        className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-md border ${
                          cot.estado === 'APROBADA' ? 'bg-green-100 text-green-800 border-green-300' :
                          cot.estado === 'RECHAZADA' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        {cot.estado}
                      </span>
                      {cot.estado === 'APROBADA' && (
                        <p className="mt-1 text-[11px] text-gray-500">Anticipo: {textoAnticipo(cot)}</p>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {permisos.procesar && cot.estado === 'PENDIENTE' && (
                          <>
                            <button
                              onClick={() =>
                                setCotizacionParaAprobar({
                                  id: cot.id,
                                  nro: cot.numero_cotizacion,
                                  cliente: cot.cliente?.nombre || `Cliente #${cot.cliente_id}`,
                                  total: Number(cot.total),
                                })
                              }
                              className="text-green-700 hover:underline text-xs font-medium bg-green-50 px-2.5 py-1 rounded-lg shadow-xs cursor-pointer"
                            >
                              Aprobar
                            </button>
                            <button
                              onClick={() => handleRechazar(cot.id, cot.numero_cotizacion)}
                              className="text-red-700 hover:underline text-xs font-medium bg-red-50 px-2.5 py-1 rounded-lg shadow-xs cursor-pointer"
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                        {permisos.crearOrden && cot.estado === 'APROBADA' && (
                          <button
                            onClick={() => handleAbrirModalConvertir(cot)}
                            className="text-purple-600 hover:underline text-xs font-medium bg-purple-50 px-2.5 py-1 rounded-lg shadow-xs cursor-pointer"
                            title="Programar ventana y crear Orden de Trabajo (CU12 -> CU11)"
                          >
                            Crear OT
                          </button>
                        )}
                        <a 
                          href={`/cotizaciones/pdf/${cot.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs font-medium bg-blue-50 px-2.5 py-1 rounded-lg shadow-xs inline-block"
                        >
                          📄 Ver PDF
                        </a>

                        {permisos.actualizar && cot.estado === 'PENDIENTE' && (
                          <button 
                          onClick={() => router.push(`/cotizaciones/editar/${cot.id}`)}
                          className="text-amber-600 hover:underline text-xs font-medium bg-amber-50 px-2.5 py-1 rounded-lg shadow-xs cursor-pointer"
                        >
                          Editar
                        </button>
                        )}

                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {cotizacionParaAprobar && (
        <ModalAnticipo
          cotizacion={cotizacionParaAprobar}
          onCerrar={() => setCotizacionParaAprobar(null)}
          onAprobada={() => {
            setCotizacionParaAprobar(null)
            cargarCotizaciones()
          }}
        />
      )}

      {/* Modal Programar y Crear Orden de Trabajo (CU08 -> CU12 -> CU11) */}
      {cotizacionParaConvertir && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="p-5 sm:p-6 bg-slate-50 border-b border-slate-200">
              <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-full uppercase">
                CU12 / CU11
              </span>
              <h3 className="mt-2 text-lg font-bold text-slate-900">Programar y Crear Orden de Trabajo</h3>
              <p className="text-xs text-slate-500 mt-1">
                Defina la fecha y horario para la ejecución. Esta ventana horaria es obligatoria para la asignación de técnicos en CU11.
              </p>
            </div>

            <form onSubmit={handleConfirmarConvertir} className="p-5 sm:p-6 space-y-4">
              <div className="rounded-xl bg-purple-50/60 p-3 border border-purple-100 text-xs text-purple-900 space-y-1">
                <div><span className="font-semibold">Cotización:</span> {cotizacionParaConvertir.nro}</div>
                <div><span className="font-semibold">Cliente:</span> {cotizacionParaConvertir.cliente}</div>
              </div>

              {cotizacionParaConvertir.sinAnticipo && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
                  Esta cotización no tiene anticipo registrado. Puede continuar de todos modos.
                </p>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Fecha Programada *
                </label>
                <input
                  type="date"
                  required
                  value={fechaProgramada}
                  onChange={(e) => setFechaProgramada(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Hora Inicio *
                  </label>
                  <input
                    type="time"
                    required
                    value={horaInicio}
                    onChange={(e) => setHoraInicio(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Hora Fin *
                  </label>
                  <input
                    type="time"
                    required
                    value={horaFin}
                    onChange={(e) => setHoraFin(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCotizacionParaConvertir(null)}
                  disabled={convirtiendo}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={convirtiendo}
                  className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {convirtiendo ? 'Creando Orden...' : 'Confirmar y Crear OT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}