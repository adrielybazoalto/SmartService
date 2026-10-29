'use client'

import { useState } from 'react'
import {
  registrarInicioOrdenAccion,
  registrarFinOrdenAccion,
  procesarReporteCampoAccion,
  obtenerOrdenTrabajoDetalleAccion,
  listarProductosParaConsumoAccion,
  actualizarVentanaOrdenAccion,
} from '@/app/actions/ordenes-trabajo'
import { useRouter } from 'next/navigation'

interface Material {
  producto_id: number
  cantidad_utilizada: number
  observacion?: string
}

interface Producto {
  id: number
  codigo: string
  nombre: string
  unidad_medida: string
  stock_disponible: string
}

interface Props {
  ordenes: any[]
  esTecnico: boolean
  usuarioId: number
}

export function IU_GestionarOrdenesTrabajo({ ordenes, esTecnico, usuarioId }: Props) {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<any>(null)
  const [mostrarReporte, setMostrarReporte] = useState(false)
  const [diagnostico, setDiagnostico] = useState('')
  const [materiales, setMateriales] = useState<Material[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [productoSeleccionado, setProductoSeleccionado] = useState('')
  const [cantidadMaterial, setCantidadMaterial] = useState('')
  const [obsMaterial, setObsMaterial] = useState('')

  async function iniciarOrden(id: number) {
    setCargando(true)
    setMensaje(null)
    try {
      const res = await registrarInicioOrdenAccion(id)
      if (res.ok) {
        setMensaje({ tipo: 'ok', texto: res.mensaje })
        router.refresh()
      } else {
        setMensaje({ tipo: 'error', texto: res.error })
      }
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    } finally {
      setCargando(false)
    }
  }

  async function finalizarOrden(id: number) {
    setCargando(true)
    setMensaje(null)
    try {
      const res = await registrarFinOrdenAccion(id)
      if (res.ok) {
        setMensaje({ tipo: 'ok', texto: res.mensaje })
        router.refresh()
      } else {
        setMensaje({ tipo: 'error', texto: res.error })
      }
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    } finally {
      setCargando(false)
    }
  }

  async function abrirReporte(orden: any) {
    setOrdenSeleccionada(orden)
    setDiagnostico('')
    setMateriales([])
    setMostrarReporte(true)
    setMensaje(null)
    const res = await listarProductosParaConsumoAccion()
    if (res.ok) {
      setProductos(res.data)
    }
  }

  function agregarMaterial() {
    if (!productoSeleccionado || !cantidadMaterial) {
      setMensaje({ tipo: 'error', texto: 'Seleccione un producto y cantidad' })
      return
    }
    const prod = productos.find((p) => p.id === parseInt(productoSeleccionado))
    if (!prod) return

    setMateriales([
      ...materiales,
      {
        producto_id: prod.id,
        cantidad_utilizada: parseFloat(cantidadMaterial),
        observacion: obsMaterial || undefined,
      },
    ])
    setProductoSeleccionado('')
    setCantidadMaterial('')
    setObsMaterial('')
    setMensaje(null)
  }

  function eliminarMaterial(index: number) {
    setMateriales(materiales.filter((_, i) => i !== index))
  }

  async function procesarReporte() {
    if (!ordenSeleccionada) return
    if (!diagnostico.trim()) {
      setMensaje({ tipo: 'error', texto: 'El diagnóstico es obligatorio' })
      return
    }

    setCargando(true)
    setMensaje(null)
    try {
      const res = await procesarReporteCampoAccion({
        ordenId: ordenSeleccionada.id,
        diagnostico,
        materiales,
      })
      if (res.ok) {
        setMensaje({ tipo: 'ok', texto: res.mensaje })
        setMostrarReporte(false)
        router.refresh()
      } else {
        setMensaje({ tipo: 'error', texto: res.error })
      }
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    } finally {
      setCargando(false)
    }
  }

  const getEstadoBadge = (estado: string) => {
    const estilos: Record<string, string> = {
      PROGRAMADA: 'bg-blue-100 text-blue-800',
      EN_PROGRESO: 'bg-yellow-100 text-yellow-800',
      FINALIZADA: 'bg-emerald-100 text-emerald-800',
      COMPLETADA: 'bg-emerald-100 text-emerald-800',
      CANCELADA: 'bg-red-100 text-red-800',
    }
    return estilos[estado] || 'bg-gray-100 text-gray-800'
  }

  const formatearVentana = (inicio: string | null, fin: string | null) => {
    if (!inicio || !fin) return <span className="text-amber-600 font-medium text-xs">Sin ventana</span>
    const dIni = new Date(inicio)
    const dFin = new Date(fin)
    const fecha = dIni.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const hIni = dIni.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
    const hFin = dFin.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
    return `${fecha} (${hIni} - ${hFin})`
  }

  return (
    <div className="space-y-6">
      {mensaje && (
        <div
          className={`rounded-xl p-4 ${
            mensaje.tipo === 'ok' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Lista de Órdenes */}
      <section className="tarjeta overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200">
          <h2 className="text-lg font-bold text-slate-900">
            {esTecnico ? 'Mis Órdenes Asignadas' : 'Órdenes de Trabajo'}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Código</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Ventana Programada</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Inicio Real</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Fin Real</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {ordenes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-500">
                    No hay órdenes de trabajo
                  </td>
                </tr>
              )}
              {ordenes.map((orden) => (
                <tr key={orden.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">{orden.codigo_orden}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">{orden.tipo_trabajo}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getEstadoBadge(orden.estado)}`}>
                      {orden.estado}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600">
                    {formatearVentana(orden.fecha_inicio_programada, orden.fecha_fin_programada)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {orden.fecha_inicio_real ? new Date(orden.fecha_inicio_real).toLocaleString('es-BO') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {orden.fecha_fin_real ? new Date(orden.fecha_fin_real).toLocaleString('es-BO') : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    {esTecnico && orden.estado === 'PROGRAMADA' && (
                      <button
                        onClick={() => iniciarOrden(orden.id)}
                        disabled={cargando}
                        className="text-emerald-600 hover:text-emerald-900 disabled:opacity-50"
                      >
                        Marcar Inicio
                      </button>
                    )}
                    {esTecnico && orden.estado === 'EN_PROGRESO' && (
                      <>
                        <button
                          onClick={() => finalizarOrden(orden.id)}
                          disabled={cargando}
                          className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                        >
                          Marcar Fin
                        </button>
                        <button
                          onClick={() => abrirReporte(orden)}
                          disabled={cargando}
                          className="text-purple-600 hover:text-purple-900 disabled:opacity-50"
                        >
                          Reporte de Campo
                        </button>
                      </>
                    )}
                    {!esTecnico && orden.estado === 'PROGRAMADA' && (
                      <button
                        onClick={async () => {
                          if (confirm('¿Convertir esta cotización a orden de trabajo?')) {
                            // Aquí se podría implementar desde otra vista
                          }
                        }}
                        className="text-slate-400 cursor-not-allowed"
                        title="Usar desde Cotizaciones"
                      >
                        -
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Modal Reporte de Campo */}
      {mostrarReporte && ordenSeleccionada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Reporte de Campo - {ordenSeleccionada.codigo_orden}</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Diagnóstico *</label>
                <textarea
                  value={diagnostico}
                  onChange={(e) => setDiagnostico(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                  placeholder="Describa el diagnóstico y trabajo realizado..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Materiales Utilizados</label>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2">
                  <select
                    value={productoSeleccionado}
                    onChange={(e) => setProductoSeleccionado(e.target.value)}
                    className="md:col-span-2 px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="">Seleccionar producto</option>
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} - {p.nombre} (Stock: {p.stock_disponible})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={cantidadMaterial}
                    onChange={(e) => setCantidadMaterial(e.target.value)}
                    placeholder="Cantidad"
                    className="px-3 py-2 border border-slate-300 rounded-lg"
                  />
                  <button
                    onClick={agregarMaterial}
                    type="button"
                    className="px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700"
                  >
                    Agregar
                  </button>
                </div>
                <input
                  type="text"
                  value={obsMaterial}
                  onChange={(e) => setObsMaterial(e.target.value)}
                  placeholder="Observación del material (opcional)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-3"
                />
                {materiales.length > 0 && (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-left">Cantidad</th>
                          <th className="px-3 py-2 text-left">Obs.</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {materiales.map((m, idx) => {
                          const prod = productos.find((p) => p.id === m.producto_id)
                          return (
                            <tr key={idx} className="border-t">
                              <td className="px-3 py-2">{prod?.nombre}</td>
                              <td className="px-3 py-2">{m.cantidad_utilizada}</td>
                              <td className="px-3 py-2">{m.observacion || '-'}</td>
                              <td className="px-3 py-2">
                                <button onClick={() => eliminarMaterial(idx)} className="text-red-600 hover:text-red-800">
                                  Eliminar
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
              <button
                onClick={() => setMostrarReporte(false)}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={procesarReporte}
                disabled={cargando}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {cargando ? 'Procesando...' : 'Finalizar Orden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
