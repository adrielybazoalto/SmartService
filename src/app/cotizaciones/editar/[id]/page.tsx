'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  obtenerClientesAccion, 
  obtenerEstablecimientosPorClienteAccion, 
  obtenerProductosConImagen, 
  obtenerServiciosTecnicosAccion, 
  obtenerCotizacionPorIdAccion,
  actualizarCotizacionCompletaAccion 
} from '@/app/actions/cotizaciones'

export default function EditarCotizacionPage() {
  const params = useParams()
  const router = useRouter()

  const [clientes, setClientes] = useState<any[]>([])
  const [establecimientos, setEstablecimientos] = useState<any[]>([])
  const [productosDisponibles, setProductosDisponibles] = useState<any[]>([])
  const [serviciosDisponibles, setServiciosDisponibles] = useState<any[]>([])

  const [clienteId, setClienteId] = useState<number>(0)
  const [establecimientoId, setEstablecimientoId] = useState<number>(0)
  const [estado, setEstado] = useState('PENDIENTE')
  const [numeroCotizacion, setNumeroCotizacion] = useState('')
  const [productosSeleccionados, setProductosSeleccionados] = useState<any[]>([])
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function inicializar() {
      try {
        const rawId = Array.isArray(params?.id) ? params.id[0] : params?.id
        const cotId = Number(rawId)
        if (!cotId) return

        // 1. Primero cargamos la cotización para saber qué cliente y establecimiento tiene
        const cotData = await obtenerCotizacionPorIdAccion(cotId)
        
        if (cotData) {
          setNumeroCotizacion(cotData.numero_cotizacion || '')
          const cliId = Number(cotData.cliente_id) || 0
          setClienteId(cliId)
          setEstado(cotData.estado || 'PENDIENTE')

          // 2. Cargamos en paralelo los catálogos generales y los establecimientos de ESTE cliente
          const [cliData, prodData, servData, estabsData] = await Promise.all([
            obtenerClientesAccion(),
            obtenerProductosConImagen(),
            obtenerServiciosTecnicosAccion(),
            cliId ? obtenerEstablecimientosPorClienteAccion(cliId) : Promise.resolve([])
          ])

          setClientes(cliData || [])
          setProductosDisponibles(prodData || [])
          setServiciosDisponibles(servData || [])
          setEstablecimientos(estabsData || [])
          
          // 3. Asignamos explícitamente el establecimiento que ya tenía registrado
          setEstablecimientoId(Number(cotData.establecimiento_id) || 0)

          // Cargar productos previamente guardados
          const prodsMap = (cotData.productos || []).map((p: any) => ({
            producto_id: p.producto_id,
            nombre: p.producto?.nombre || `Producto #${p.producto_id}`,
            cantidad: p.cantidad,
            precio_unitario: Number(p.precio_unitario),
            subtotal: Number(p.subtotal)
          }))
          setProductosSeleccionados(prodsMap)

          // Cargar servicios previamente guardados
          const servsMap = (cotData.servicios || []).map((s: any) => ({
            servicio_id: s.servicio_id,
            nombre: s.servicio?.nombre || `Servicio #${s.servicio_id}`,
            horas_estimadas: s.horas_estimadas,
            precio_hora: Number(s.precio_hora),
            subtotal: Number(s.subtotal)
          }))
          setServiciosSeleccionados(servsMap)
        }
      } catch (err) {
        console.error('Error al inicializar edición:', err)
      }
      setCargando(false)
    }
    if (params?.id) inicializar()
  }, [params?.id])

  const handleClienteChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = Number(e.target.value)
    setClienteId(id)
    setEstablecimientoId(0)
    if (id) {
      const data = await obtenerEstablecimientosPorClienteAccion(id)
      setEstablecimientos(data || [])
      if (data && data.length === 1) {
        setEstablecimientoId(Number(data[0].id))
      }
    } else {
      setEstablecimientos([])
    }
  }

  const agregarProducto = (prod: any) => {
    const precioUnit = (prod.precio_compra_actual || 100) * (1 + (prod.margen_ganancia || 20) / 100)
    const existe = productosSeleccionados.find(p => p.producto_id === prod.id)
    if (existe) {
      setProductosSeleccionados(productosSeleccionados.map(p => 
        p.producto_id === prod.id ? { ...p, cantidad: p.cantidad + 1, subtotal: (p.cantidad + 1) * p.precio_unitario } : p
      ))
    } else {
      setProductosSeleccionados([...productosSeleccionados, {
        producto_id: prod.id,
        nombre: prod.nombre,
        cantidad: 1,
        precio_unitario: precioUnit,
        subtotal: precioUnit
      }])
    }
  }

  const cambiarCantidadProducto = (index: number, delta: number) => {
    const nuevos = [...productosSeleccionados]
    const nuevaCant = nuevos[index].cantidad + delta
    if (nuevaCant <= 0) {
      setProductosSeleccionados(nuevos.filter((_, i) => i !== index))
    } else {
      nuevos[index].cantidad = nuevaCant
      nuevos[index].subtotal = nuevaCant * nuevos[index].precio_unitario
      setProductosSeleccionados(nuevos)
    }
  }

  const agregarServicio = (serv: any) => {
    const tarifa = Number(serv.precio_base || 70)
    const existe = serviciosSeleccionados.find(s => s.servicio_id === serv.id)
    if (existe) {
      setServiciosSeleccionados(serviciosSeleccionados.map(s => 
        s.servicio_id === serv.id ? { ...s, horas_estimadas: s.horas_estimadas + 1, subtotal: (s.horas_estimadas + 1) * s.precio_hora } : s
      ))
    } else {
      setServiciosSeleccionados([...serviciosSeleccionados, {
        servicio_id: serv.id,
        nombre: serv.nombre,
        horas_estimadas: 1,
        precio_hora: tarifa,
        subtotal: tarifa
      }])
    }
  }

  const cambiarHorasServicio = (index: number, delta: number) => {
    const nuevos = [...serviciosSeleccionados]
    const nuevasHoras = nuevos[index].horas_estimadas + delta
    if (nuevasHoras <= 0) {
      setServiciosSeleccionados(nuevos.filter((_, i) => i !== index))
    } else {
      nuevos[index].horas_estimadas = nuevasHoras
      nuevos[index].subtotal = nuevasHoras * nuevos[index].precio_hora
      setServiciosSeleccionados(nuevos)
    }
  }

  const subtotalEquipos = productosSeleccionados.reduce((acc, p) => acc + p.subtotal, 0)
  const subtotalServicios = serviciosSeleccionados.reduce((acc, s) => acc + s.subtotal, 0)
  const totalGeneral = subtotalEquipos + subtotalServicios

  const handleGuardarCambios = async () => {
    if (!clienteId || !establecimientoId) {
      alert('Por favor selecciona un cliente y un establecimiento.')
      return
    }

    const res = await actualizarCotizacionCompletaAccion(Number(params.id), {
      cliente_id: clienteId,
      establecimiento_id: establecimientoId,
      usuario_id: 1,
      productos: productosSeleccionados,
      servicios: serviciosSeleccionados,
      total: totalGeneral,
      estado: estado
    })

    if (res.success) {
      alert(res.message)
      router.push('/cotizaciones')
    } else {
      alert('Error: ' + res.message)
    }
  }

  if (cargando) return <div className="p-12 text-center text-gray-500">Cargando editor de proforma...</div>

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <span className="inline-block bg-[#eefccb] text-[#558a06] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
          P2: GESTIÓN COMERCIAL · CU08 · MODIFICAR COTIZACIÓN ({numeroCotizacion})
        </span>
        <Link href="/cotizaciones" className="text-xs text-gray-600 hover:underline">← Volver al listado</Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-800 mb-6">Modificar Proforma: {numeroCotizacion}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Columna Izquierda: Catálogos limpios */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Catálogo de Equipos */}
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-sm font-bold text-gray-800 uppercase mb-4">Catálogo de Equipos y Materiales</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
              {productosDisponibles.map(prod => {
                const precio = ((prod.precio_compra_actual || 100) * (1 + (prod.margen_ganancia || 20) / 100)).toFixed(2)
                const imgUrl = Array.isArray(prod.imagen_producto) && prod.imagen_producto.length > 0
                  ? prod.imagen_producto[0]?.url_imagen
                  : (prod.url_imagen || prod.imagenUrl || null)

                return (
                  <div key={prod.id} className="border border-gray-200 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 text-xs gap-3 hover:border-gray-300 transition-colors">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {imgUrl ? (
                        <img 
                          src={imgUrl} 
                          alt={prod.nombre} 
                          className="w-12 h-12 object-cover rounded-md border border-gray-200 bg-white shrink-0"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-100 rounded-md border border-gray-200 flex items-center justify-center text-base shrink-0">
                          📦
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-800 truncate" title={prod.nombre}>{prod.nombre}</p>
                        <p className="text-blue-600 font-bold mt-0.5">Bs. {precio}</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => agregarProducto(prod)} 
                      className="bg-gray-900 text-[#9fe82e] font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-gray-800 cursor-pointer shrink-0 w-full sm:w-auto text-center transition-colors"
                    >
                      + Agregar
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Catálogo de Servicios Técnicos */}
          <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-100">
            <h2 className="text-sm font-bold text-gray-800 uppercase mb-4">Catálogo de Servicios Técnicos / Mano de Obra</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
              {serviciosDisponibles.map(serv => (
                <div key={serv.id} className="border border-gray-200 p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 text-xs gap-3 hover:border-gray-300 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800 truncate" title={serv.nombre}>{serv.nombre}</p>
                    <p className="text-blue-600 font-bold mt-0.5">Bs. {serv.precio_base || 70} / hora</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => agregarServicio(serv)} 
                    className="bg-gray-900 text-[#9fe82e] font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-gray-800 cursor-pointer shrink-0 w-full sm:w-auto text-center transition-colors"
                  >
                    + Agregar
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Columna Derecha: Detalle Actualizado Interactivo */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-fit space-y-6">
          <h2 className="text-sm font-bold text-gray-800 uppercase border-b pb-3">Detalle Actualizado</h2>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Cliente</label>
              <select value={clienteId} onChange={handleClienteChange} className="w-full border rounded-lg p-2 text-xs bg-white">
                <option value={0}>Seleccione cliente...</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Establecimiento</label>
              <select 
                value={establecimientoId} 
                onChange={(e) => setEstablecimientoId(Number(e.target.value))} 
                className="w-full border rounded-lg p-2 text-xs bg-white"
              >
                <option value={0}>
                  {establecimientos.length === 0 ? 'Sin establecimientos registrados' : 'Seleccione establecimiento...'}
                </option>
                {establecimientos.map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre_establecimiento || e.nombre || `Establecimiento #${e.id}`} {e.direccion ? ` - ${e.direccion}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 mb-1">Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full border rounded-lg p-2 text-xs bg-white font-bold text-amber-700">
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="APROBADA">APROBADA</option>
                <option value="RECHAZADA">RECHAZADA</option>
              </select>
            </div>
          </div>

          <div className="border-t pt-3">
            <h3 className="text-xs font-bold text-gray-700 uppercase mb-2">Equipos y Materiales</h3>
            {productosSeleccionados.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">Ningún equipo agregado.</p>
            ) : (
              productosSeleccionados.map((p, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs py-1.5 border-b">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-medium text-gray-800 truncate">{p.nombre}</p>
                    <p className="text-[11px] text-blue-600 font-semibold">Bs. {p.subtotal.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => cambiarCantidadProducto(idx, -1)} className="bg-gray-200 hover:bg-gray-300 px-1.5 py-0.5 rounded text-xs font-bold">-</button>
                    <span className="text-xs font-bold w-4 text-center">{p.cantidad}</span>
                    <button onClick={() => cambiarCantidadProducto(idx, 1)} className="bg-gray-200 hover:bg-gray-300 px-1.5 py-0.5 rounded text-xs font-bold">+</button>
                    <button onClick={() => setProductosSeleccionados(productosSeleccionados.filter((_, i) => i !== idx))} className="text-red-500 font-bold ml-1 text-sm">×</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t pt-3">
            <h3 className="text-xs font-bold text-gray-700 uppercase mb-2">Mano de Obra / Servicios</h3>
            {serviciosSeleccionados.length === 0 ? (
              <p className="text-[11px] text-gray-400 italic">Ningún servicio agregado.</p>
            ) : (
              serviciosSeleccionados.map((s, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs py-1.5 border-b">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-medium text-gray-800 truncate">{s.nombre}</p>
                    <p className="text-[11px] text-blue-600 font-semibold">Bs. {s.subtotal.toFixed(2)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => cambiarHorasServicio(idx, -1)} className="bg-gray-200 hover:bg-gray-300 px-1.5 py-0.5 rounded text-xs font-bold">-</button>
                    <span className="text-xs font-bold w-6 text-center">{s.horas_estimadas}h</span>
                    <button onClick={() => cambiarHorasServicio(idx, 1)} className="bg-gray-200 hover:bg-gray-300 px-1.5 py-0.5 rounded text-xs font-bold">+</button>
                    <button onClick={() => setServiciosSeleccionados(serviciosSeleccionados.filter((_, i) => i !== idx))} className="text-red-500 font-bold ml-1 text-sm">×</button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t pt-4 flex justify-between items-center text-base font-black text-blue-600">
            <span>Total General:</span>
            <span>Bs. {totalGeneral.toFixed(2)}</span>
          </div>

          <button 
            onClick={handleGuardarCambios}
            className="w-full bg-[#9fe82e] hover:bg-[#8be01c] text-gray-900 font-bold py-3 rounded-lg text-xs shadow-sm cursor-pointer transition-colors"
          >
            Guardar Cambios de Cotización
          </button>
        </div>

      </div>
    </div>
  )
}