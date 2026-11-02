'use client'

import { useState } from 'react'
import {
  registrarInicioOrdenAccion,
  registrarFinOrdenAccion,
  procesarReporteCampoAccion,
  obtenerOrdenTrabajoDetalleAccion,
  listarProductosParaConsumoAccion,
  obtenerCotizadoOrdenAccion,
  actualizarVentanaOrdenAccion,
  cancelarOrdenAccion,
  crearOrdenCorrectivaAccion,
} from '@/app/actions/ordenes-trabajo'
import { textoAnticipo } from '@/app/cotizaciones/anticipo'
import { horasEntre } from '@/backend/asignaciones/disponibilidad'
import { ESTADO_ORDEN } from '@/backend/ordenes/estados'
import { formatearFechaHora } from '@/lib/fechas'
import { ModalVentana, type DatosVentana } from './modal-ventana'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

/**
 * Línea del reporte de campo. Las que vienen de la cotización traen la cantidad
 * cotizada y el técnico solo corrige lo realmente usado (0 = no se usó).
 * Las adicionales (cotizada = null) son materiales que no estaban cotizados.
 */
interface LineaMaterial {
  producto_id: number
  nombre: string
  codigo: string | null
  unidad_medida: string
  cotizada: number | null
  usada: string
  observacion: string
}

interface Producto {
  id: number
  codigo: string
  nombre: string
  unidad_medida: string
  stock_disponible: string
}

type NotaResumen = { numero_nota: string; estado: string; monto_total: number }

/** Lo que devuelve obtenerOrdenTrabajoDetalleAccion. */
interface DetalleOrden {
  codigo_orden: string
  estado: string
  horas_trabajadas: number | null
  observaciones_tecnico: string | null
  cotizacion: Parameters<typeof textoAnticipo>[0]
  orden_trabajo_tecnico?: { usuario_id: number; es_lider: boolean; usuario?: { nombre: string } | null }[]
  detalle_consumo_material?: {
    id: number
    cantidad_utilizada: number
    observacion: string | null
    producto?: { nombre: string; unidad_medida: string } | null
  }[]
  nota_servicio?: NotaResumen | NotaResumen[] | null
}

interface Props {
  ordenes: any[]
  esTecnico: boolean
  usuarioId: number
  /** Calculados en el servidor con los permisos de ROL_FUNCION. */
  permisos: { gestionar: boolean; liquidar: boolean; crearOrden: boolean }
}

export function IU_GestionarOrdenesTrabajo({ ordenes, esTecnico, usuarioId, permisos }: Props) {
  const router = useRouter()
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<any>(null)
  const [mostrarReporte, setMostrarReporte] = useState(false)
  const [diagnostico, setDiagnostico] = useState('')
  const [materiales, setMateriales] = useState<LineaMaterial[]>([])
  const [serviciosCotizados, setServiciosCotizados] = useState<{ nombre: string; horas_estimadas: number }[]>([])
  const [numeroCotizacion, setNumeroCotizacion] = useState<string | null>(null)
  const [confirmarSinMateriales, setConfirmarSinMateriales] = useState(false)
  const [productos, setProductos] = useState<Producto[]>([])
  const [productoSeleccionado, setProductoSeleccionado] = useState('')
  const [cantidadMaterial, setCantidadMaterial] = useState('')
  const [obsMaterial, setObsMaterial] = useState('')
  const [detalle, setDetalle] = useState<DetalleOrden | null>(null)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [creandoCorrectiva, setCreandoCorrectiva] = useState(false)
  const [ordenVentana, setOrdenVentana] = useState<{ id: number; codigo_orden: string } | null>(null)
  const ordenesVisibles = filtroEstado ? ordenes.filter((o) => o.estado === filtroEstado) : ordenes

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
    setServiciosCotizados([])
    setNumeroCotizacion(null)
    setConfirmarSinMateriales(false)
    setMostrarReporte(true)
    setMensaje(null)
    const [prods, cotizado] = await Promise.all([listarProductosParaConsumoAccion(), obtenerCotizadoOrdenAccion(orden.id)])
    if (prods.ok) setProductos(prods.data)
    if (cotizado.ok) {
      // Se precargan los materiales cotizados con la cantidad cotizada; el técnico corrige lo usado
      setNumeroCotizacion(cotizado.data.numero_cotizacion)
      setServiciosCotizados(cotizado.data.servicios)
      setMateriales(
        cotizado.data.materiales.map((m) => ({
          producto_id: m.producto_id,
          nombre: m.nombre,
          codigo: m.codigo,
          unidad_medida: m.unidad_medida,
          cotizada: m.cantidad_cotizada,
          usada: String(m.cantidad_cotizada),
          observacion: '',
        })),
      )
    } else {
      setMensaje({ tipo: 'error', texto: cotizado.error })
    }
  }

  /** Material adicional (no cotizado). Si ya está en la lista, se suma a la cantidad usada. */
  function agregarMaterial() {
    const cantidad = parseFloat(cantidadMaterial)
    if (!productoSeleccionado || !Number.isFinite(cantidad) || cantidad <= 0) {
      setMensaje({ tipo: 'error', texto: 'Seleccione un producto y una cantidad mayor a 0' })
      return
    }
    const prod = productos.find((p) => p.id === parseInt(productoSeleccionado))
    if (!prod) return

    const existente = materiales.find((m) => m.producto_id === prod.id)
    if (existente) {
      setMateriales(
        materiales.map((m) =>
          m.producto_id === prod.id
            ? { ...m, usada: String((parseFloat(m.usada) || 0) + cantidad), observacion: obsMaterial || m.observacion }
            : m,
        ),
      )
    } else {
      setMateriales([
        ...materiales,
        {
          producto_id: prod.id,
          nombre: prod.nombre,
          codigo: prod.codigo,
          unidad_medida: prod.unidad_medida,
          cotizada: null,
          usada: String(cantidad),
          observacion: obsMaterial,
        },
      ])
    }
    setProductoSeleccionado('')
    setCantidadMaterial('')
    setObsMaterial('')
    setMensaje(null)
  }

  function cambiarLinea(index: number, cambios: Partial<LineaMaterial>) {
    setMateriales(materiales.map((m, i) => (i === index ? { ...m, ...cambios } : m)))
  }

  function eliminarMaterial(index: number) {
    setMateriales(materiales.filter((_, i) => i !== index))
  }

  // Lo que se envía: solo las líneas con cantidad usada > 0
  const materialesUsados = materiales
    .map((m) => ({ ...m, cantidad: parseFloat(m.usada) }))
    .filter((m) => Number.isFinite(m.cantidad) && m.cantidad > 0)
  const hayCantidadInvalida = materiales.some((m) => m.usada.trim() !== '' && !(parseFloat(m.usada) >= 0))
  const habiaCotizados = materiales.some((m) => m.cotizada !== null)

  async function procesarReporte() {
    if (!ordenSeleccionada) return
    if (!diagnostico.trim()) {
      setMensaje({ tipo: 'error', texto: 'El diagnóstico es obligatorio' })
      return
    }
    if (hayCantidadInvalida) {
      setMensaje({ tipo: 'error', texto: 'Revise las cantidades usadas: deben ser números mayores o iguales a 0' })
      return
    }
    if (materialesUsados.length === 0 && habiaCotizados && !confirmarSinMateriales) {
      setMensaje({ tipo: 'error', texto: 'Confirme que no se usó ningún material de la cotización' })
      return
    }

    setCargando(true)
    setMensaje(null)
    try {
      const res = await procesarReporteCampoAccion({
        ordenId: ordenSeleccionada.id,
        diagnostico,
        materiales: materialesUsados.map((m) => ({
          producto_id: m.producto_id,
          cantidad_utilizada: m.cantidad,
          observacion:
            [m.cotizada === null ? 'Adicional (no cotizado)' : m.cantidad !== m.cotizada ? `Cotizado: ${m.cotizada}` : '', m.observacion.trim()]
              .filter(Boolean)
              .join(' · ') || null,
        })),
        confirmarSinMateriales: materialesUsados.length === 0 && confirmarSinMateriales,
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

  async function verDetalle(id: number) {
    setCargando(true)
    setMensaje(null)
    const res = await obtenerOrdenTrabajoDetalleAccion(id)
    setCargando(false)
    if (res.ok) setDetalle(res.data)
    else setMensaje({ tipo: 'error', texto: res.error })
  }

  /** Devuelve el error para mostrarlo dentro del modal, o null si salió bien. */
  async function confirmarVentana(d: DatosVentana): Promise<string | null> {
    const ventana = { fecha_programada: d.fecha, hora_inicio: d.horaInicio, hora_fin: d.horaFin }
    const res = ordenVentana
      ? await actualizarVentanaOrdenAccion(ordenVentana.id, ventana)
      : await crearOrdenCorrectivaAccion({ ...ventana, tipo_trabajo: d.tipoTrabajo })
    if (!res.ok) return res.error
    setMensaje({ tipo: 'ok', texto: res.mensaje })
    setOrdenVentana(null)
    setCreandoCorrectiva(false)
    router.refresh()
    return null
  }

  async function cancelarOrden(orden: { id: number; codigo_orden: string }) {
    if (!confirm(`¿Cancelar la orden ${orden.codigo_orden}? Esta acción no se puede deshacer.`)) return
    setCargando(true)
    setMensaje(null)
    const res = await cancelarOrdenAccion(orden.id)
    setCargando(false)
    if (res.ok) {
      setMensaje({ tipo: 'ok', texto: res.mensaje })
      router.refresh()
    } else {
      setMensaje({ tipo: 'error', texto: res.error })
    }
  }

  // nota_servicio es 1:1 con la orden (uq_nota_orden), pero puede llegar como lista.
  const notaDe = (orden: Pick<DetalleOrden, 'nota_servicio'>) =>
    Array.isArray(orden.nota_servicio) ? orden.nota_servicio[0] : orden.nota_servicio

  const getEstadoBadge = (estado: string) => {
    const estilos: Record<string, string> = {
      PROGRAMADA: 'bg-blue-100 text-blue-800',
      EN_PROGRESO: 'bg-yellow-100 text-yellow-800',
      FINALIZADA: 'bg-emerald-100 text-emerald-800',
      CANCELADA: 'bg-red-100 text-red-800',
    }
    return estilos[estado] || 'bg-gray-100 text-gray-800'
  }

  const notaDetalle = detalle ? notaDe(detalle) : null

  const formatearVentana = (inicio: string | null, fin: string | null) => {
    if (!inicio || !fin) return <span className="text-amber-600 font-medium text-xs">Sin ventana</span>
    return `${formatearFechaHora(inicio)} a ${formatearFechaHora(fin)}`
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
        <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-slate-900">
            {esTecnico ? 'Mis Órdenes Asignadas' : 'Órdenes de Trabajo'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filtrar por estado"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
            >
              <option value="">Todos los estados</option>
              {ESTADO_ORDEN.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            {permisos.crearOrden && (
              <button
                onClick={() => setCreandoCorrectiva(true)}
                className="px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
              >
                Nueva orden correctiva
              </button>
            )}
          </div>
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
                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Horas</th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {ordenesVisibles.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-sm text-slate-500">
                    No hay órdenes de trabajo
                  </td>
                </tr>
              )}
              {ordenesVisibles.map((orden) => (
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
                    {formatearFechaHora(orden.fecha_inicio_real)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {formatearFechaHora(orden.fecha_fin_real)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {horasEntre(orden.fecha_inicio_real, orden.fecha_fin_real) ?? '-'}
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
                    {/* 1° Marcar fin (horas técnicas)  ->  2° Reporte de campo (materiales y diagnóstico) -> FINALIZADA */}
                    {esTecnico && orden.estado === 'EN_PROGRESO' && !orden.fecha_fin_real && (
                      <button
                        onClick={() => finalizarOrden(orden.id)}
                        disabled={cargando}
                        className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                      >
                        Marcar Fin
                      </button>
                    )}
                    {esTecnico && orden.estado === 'EN_PROGRESO' && orden.fecha_fin_real && (
                      <>
                        <span className="text-xs text-amber-700">Labor terminada · falta reporte</span>
                        <button
                          onClick={() => abrirReporte(orden)}
                          disabled={cargando}
                          className="text-purple-600 hover:text-purple-900 disabled:opacity-50"
                        >
                          Reporte de Campo
                        </button>
                      </>
                    )}
                    {permisos.gestionar && orden.estado === 'PROGRAMADA' && (
                      <>
                        <Link href={`/asignar-tecnicos/${orden.id}`} className="text-blue-600 hover:text-blue-900">
                          {orden.orden_trabajo_tecnico?.length ? 'Modificar cuadrilla' : 'Asignar cuadrilla'}
                        </Link>
                        <button onClick={() => setOrdenVentana(orden)} className="text-blue-600 hover:text-blue-900">
                          {orden.fecha_inicio_programada ? 'Cambiar ventana' : 'Definir ventana'}
                        </button>
                        <button
                          onClick={() => cancelarOrden(orden)}
                          disabled={cargando}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        >
                          Cancelar orden
                        </button>
                      </>
                    )}
                    {permisos.liquidar && orden.estado === 'FINALIZADA' && (
                      <Link href={`/liquidacion/${orden.id}`} className="text-emerald-600 hover:text-emerald-900">
                        {notaDe(orden) ? 'Ver nota' : 'Liquidar'}
                      </Link>
                    )}
                    <button
                      onClick={() => verDetalle(orden.id)}
                      disabled={cargando}
                      className="text-slate-600 hover:text-slate-900 disabled:opacity-50"
                    >
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {(creandoCorrectiva || ordenVentana) && (
        <ModalVentana
          titulo={ordenVentana ? `Ventana - ${ordenVentana.codigo_orden}` : 'Nueva orden correctiva'}
          conTipo={creandoCorrectiva}
          onConfirmar={confirmarVentana}
          onCerrar={() => {
            setOrdenVentana(null)
            setCreandoCorrectiva(false)
          }}
        />
      )}

      {/* Modal Detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">Detalle - {detalle.codigo_orden}</h3>
            </div>
            <div className="p-6 space-y-4 text-sm text-slate-700">
              <p>
                <span className="font-semibold">Estado:</span> {detalle.estado}
              </p>
              <p>
                <span className="font-semibold">Horas trabajadas:</span>{' '}
                {detalle.horas_trabajadas === null ? '-' : `${detalle.horas_trabajadas} h`}
              </p>
              <p>
                <span className="font-semibold">Anticipo:</span> {textoAnticipo(detalle.cotizacion)}
              </p>
              <div>
                <p className="font-semibold">Diagnóstico</p>
                <p className="whitespace-pre-wrap">{detalle.observaciones_tecnico || 'Sin diagnóstico'}</p>
              </div>
              <div>
                <p className="font-semibold">Cuadrilla</p>
                {detalle.orden_trabajo_tecnico?.length ? (
                  <ul className="list-disc pl-5">
                    {detalle.orden_trabajo_tecnico.map((t) => (
                      <li key={t.usuario_id}>
                        {t.usuario?.nombre ?? `Técnico ${t.usuario_id}`}
                        {t.es_lider ? ' (líder)' : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Sin cuadrilla asignada</p>
                )}
              </div>
              <div>
                <p className="font-semibold">Materiales consumidos</p>
                {detalle.detalle_consumo_material?.length ? (
                  <ul className="list-disc pl-5">
                    {detalle.detalle_consumo_material.map((m) => (
                      <li key={m.id}>
                        {m.producto?.nombre}: {m.cantidad_utilizada} {m.producto?.unidad_medida}
                        {m.observacion ? ` (${m.observacion})` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Sin materiales</p>
                )}
              </div>
              <div>
                <p className="font-semibold">Nota de servicio</p>
                {notaDetalle ? (
                  <p>
                    {notaDetalle.numero_nota} · {notaDetalle.estado} · Bs {notaDetalle.monto_total}
                  </p>
                ) : (
                  <p>Sin nota emitida</p>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setDetalle(null)}
                className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

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

              {serviciosCotizados.length > 0 && (
                <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                  <p className="font-medium">Servicios cotizados ({numeroCotizacion})</p>
                  <p className="text-xs text-slate-500">
                    La mano de obra se liquida con las horas reales (inicio y fin marcados) y la tarifa cotizada.
                    Si hubo trabajos adicionales, descríbalos en el diagnóstico.
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {serviciosCotizados.map((s, i) => (
                      <li key={i}>
                        {s.nombre} · {s.horas_estimadas} h estimadas
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Materiales utilizados</label>
                <p className="mb-2 text-xs text-slate-500">
                  {habiaCotizados
                    ? 'Se cargaron los materiales de la cotización. Corrija la cantidad realmente usada (0 si no se usó) y agregue los adicionales.'
                    : 'Orden sin materiales cotizados: agregue los materiales usados en campo, si hubo.'}
                </p>
                {materiales.length > 0 && (
                  <div className="mb-3 overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-right">Cotizado</th>
                          <th className="px-3 py-2 text-left">Usado</th>
                          <th className="px-3 py-2 text-left">Obs.</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {materiales.map((m, idx) => (
                          <tr key={m.producto_id} className="border-t">
                            <td className="px-3 py-2">
                              {m.nombre}
                              {m.cotizada === null && (
                                <span className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800">Adicional</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-500">
                              {m.cotizada === null ? '—' : `${m.cotizada} ${m.unidad_medida}`}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                value={m.usada}
                                onChange={(e) => cambiarLinea(idx, { usada: e.target.value })}
                                className="w-24 rounded border border-slate-300 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={m.observacion}
                                onChange={(e) => cambiarLinea(idx, { observacion: e.target.value })}
                                placeholder="Opcional"
                                className="w-full rounded border border-slate-300 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              {m.cotizada === null ? (
                                <button onClick={() => eliminarMaterial(idx)} className="text-red-600 hover:text-red-800">
                                  Quitar
                                </button>
                              ) : (
                                <button onClick={() => cambiarLinea(idx, { usada: '0' })} className="text-slate-500 hover:text-slate-800">
                                  No se usó
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="mb-1 text-xs font-medium text-slate-600">Agregar material adicional (no cotizado)</p>
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
                  placeholder="Observación del material adicional (opcional)"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-3"
                />

                {habiaCotizados && materialesUsados.length === 0 && (
                  <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    <input
                      type="checkbox"
                      checked={confirmarSinMateriales}
                      onChange={(e) => setConfirmarSinMateriales(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>Confirmo que no se usó ningún material de la cotización (la liquidación quedará sin materiales).</span>
                  </label>
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
