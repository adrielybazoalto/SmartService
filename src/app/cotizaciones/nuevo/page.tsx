'use client'

import { useState, useEffect } from 'react'
import { obtenerClientesAccion, obtenerEstablecimientosPorClienteAccion, obtenerProductosConImagen, obtenerServiciosTecnicosAccion, crearCotizacionCompletaAccion } from '@/app/actions/cotizaciones'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function NuevaCotizacionPage() {
  const router = useRouter()

  const [clientes, setClientes] = useState<any[]>([])
  const [establecimientos, setEstablecimientos] = useState<any[]>([])
  const [productos, setProductos] = useState<any[]>([])
  const [servicios, setServicios] = useState<any[]>([])

  const [clienteId, setClienteId] = useState<string>('')
  const [establecimientoId, setEstablecimientoId] = useState<string>('')
  
  // Carritos separados para Equipos y Servicios
  const [carritoProductos, setCarritoProductos] = useState<any[]>([])
  const [carritoServicios, setCarritoServicios] = useState<any[]>([])
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    async function cargarInicial() {
      const clies = await obtenerClientesAccion()
      const prods = await obtenerProductosConImagen()
      const servs = await obtenerServiciosTecnicosAccion()
      setClientes(clies || [])
      setProductos(prods || [])
      setServicios(servs || [])
      if (clies && clies.length > 0) {
        setClienteId(String(clies[0].id))
      }
    }
    cargarInicial()
  }, [])

  useEffect(() => {
    async function cargarEstablecimientos() {
      if (clienteId) {
        const ests = await obtenerEstablecimientosPorClienteAccion(Number(clienteId))
        setEstablecimientos(ests || [])
        if (ests && ests.length > 0) {
          setEstablecimientoId(String(ests[0].id))
        } else {
          setEstablecimientoId('')
        }
      }
    }
    cargarEstablecimientos()
  }, [clienteId])

  // Manejo de productos (Equipos)
  const agregarProducto = (prod: any) => {
    const precioVenta = prod.precio_compra_actual * (1 + (prod.margen_ganancia / 100))
    const existe = carritoProductos.find(item => item.id === prod.id)
    if (existe) {
      setCarritoProductos(carritoProductos.map(item => item.id === prod.id ? { ...item, cantidad: item.cantidad + 1 } : item))
    } else {
      setCarritoProductos([...carritoProductos, { ...prod, cantidad: 1, precio_unitario: precioVenta }])
    }
  }

  const quitarProducto = (id: number) => {
    setCarritoProductos(carritoProductos.filter(item => item.id !== id))
  }

  const cambiarCantidadProducto = (id: number, delta: number) => {
    setCarritoProductos(prev =>
      prev
        .map(item => (item.id === id ? { ...item, cantidad: item.cantidad + delta } : item))
        .filter(item => item.cantidad > 0)
    )
  }

  // Manejo de servicios (Mano de obra)
  const agregarServicio = (serv: any) => {
    const tarifa = Number(serv.tarifa_por_hora || 70.00)
    const existe = carritoServicios.find(item => item.id === serv.id)
    if (existe) {
      setCarritoServicios(carritoServicios.map(item => item.id === serv.id ? { ...item, horas_estimadas: item.horas_estimadas + 1 } : item))
    } else {
      setCarritoServicios([...carritoServicios, { ...serv, horas_estimadas: 1, precio_hora: tarifa }])
    }
  }

  const quitarServicio = (id: number) => {
    setCarritoServicios(carritoServicios.filter(item => item.id !== id))
  }

  const cambiarHorasServicio = (id: number, delta: number) => {
    setCarritoServicios(prev =>
      prev
        .map(item => (item.id === id ? { ...item, horas_estimadas: item.horas_estimadas + delta } : item))
        .filter(item => item.horas_estimadas > 0)
    )
  }

  // Cálculos totales
  const totalProductos = carritoProductos.reduce((acc, item) => acc + (item.cantidad * item.precio_unitario), 0)
  const totalServicios = carritoServicios.reduce((acc, item) => acc + (item.horas_estimadas * item.precio_hora), 0)
  const totalGeneral = totalProductos + totalServicios

  const handleGuardarCotizacion = async () => {
    if (!clienteId || !establecimientoId) {
      alert('Por favor selecciona un cliente y un establecimiento.')
      return
    }

    if (carritoProductos.length === 0 && carritoServicios.length === 0) {
      alert('No se puede guardar una cotización sin equipos ni servicios.')
      return
    }

    setCargando(true)
    const res = await crearCotizacionCompletaAccion({
      cliente_id: Number(clienteId),
      establecimiento_id: Number(establecimientoId),
      productos: carritoProductos.map(p => ({
        producto_id: p.id,
        cantidad: p.cantidad
      })),
      servicios: carritoServicios.map(s => ({
        servicio_id: s.id,
        horas_estimadas: s.horas_estimadas
      }))
    })

    setCargando(false)
    if (res.success) {
      alert(res.message)
      router.push('/cotizaciones')
    } else {
      alert('Error: ' + res.message)
    }
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto">
      <div className="mb-4">
        <span className="inline-block bg-[#eefccb] text-[#558a06] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
          CU08 · ELABORAR COTIZACIONES (NUEVA PROPUESTA)
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Emitir Nueva Cotización</h1>
        <Link href="/cotizaciones" className="text-sm text-gray-600 hover:underline font-medium">
          ← Volver al listado
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Catálogos (Equipos y Servicios) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Sección Clientes y Establecimientos */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">1. Datos del Cliente y Establecimiento</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Cliente</label>
                <select 
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#9fe82e]"
                >
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre} ({c.documento_identidad})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Establecimiento / Sucursal</label>
                <select 
                  value={establecimientoId}
                  onChange={(e) => setEstablecimientoId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#9fe82e]"
                >
                  {establecimientos.length === 0 ? (
                    <option value="">Sin establecimientos registrados</option>
                  ) : (
                    establecimientos.map(est => (
                      <option key={est.id} value={est.id}>{est.nombre_establecimiento} - {est.direccion}</option>
                    ))
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Catálogo de Equipos y Materiales */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">2. Catálogo de Equipos y Materiales</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
              {productos.map(prod => {
                const precioVenta = prod.precio_compra_actual * (1 + (prod.margen_ganancia / 100))
                const imgUrl = Array.isArray(prod.imagen_producto) && prod.imagen_producto.length > 0
                  ? prod.imagen_producto[0]?.url_imagen
                  : (prod.url_imagen || prod.imagenUrl || null)

                return (
                  <div key={prod.id} className="border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 gap-3 hover:border-gray-300 transition-colors">
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
                        <div className="w-12 h-12 bg-gray-100 rounded-md border border-gray-200 flex items-center justify-center text-lg shrink-0">
                          📦
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-gray-800 truncate" title={prod.nombre}>{prod.nombre}</p>
                        <p className="text-xs font-bold text-blue-600 mt-0.5">Bs. {precioVenta.toFixed(2)}</p>
                      </div>
                    </div>
                    <button 
                      type="button"
                      onClick={() => agregarProducto(prod)}
                      className="bg-gray-900 hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer w-full sm:w-auto text-center transition-colors"
                    >
                      + Agregar
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Catálogo de Servicios Técnicos (Mano de Obra) */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-semibold text-gray-800 mb-4">3. Servicios Técnicos / Mano de Obra</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
              {servicios.map(serv => (
                <div key={serv.id} className="border border-gray-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between bg-gray-50 gap-3 hover:border-gray-300 transition-colors">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-800 truncate" title={serv.nombre}>{serv.nombre}</p>
                    <p className="text-xs font-bold text-emerald-600 mt-0.5">Bs. {Number(serv.tarifa_por_hora || 70).toFixed(2)} / hora</p>
                  </div>
                  <button 
                    type="button"
                    onClick={() => agregarServicio(serv)}
                    className="bg-gray-900 hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer w-full sm:w-auto text-center transition-colors"
                  >
                    + Agregar
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Resumen y Totales de la Cotización */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Resumen de Proforma</h2>
            
            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {/* Equipos seleccionados */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Equipos y Materiales</p>
                {carritoProductos.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Ningún equipo agregado.</p>
                ) : (
                  carritoProductos.map(item => (
                    <div key={item.id} className="flex justify-between items-center py-2 text-xs border-b border-gray-100 gap-2">
                      <div className="flex-1 min-w-0 pr-1">
                        <p className="font-medium text-gray-800 truncate">{item.nombre}</p>
                        <p className="text-[11px] text-blue-600 font-semibold">Bs. {(item.cantidad * item.precio_unitario).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                          type="button"
                          onClick={() => cambiarCantidadProducto(item.id, -1)} 
                          className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-bold transition-colors cursor-pointer"
                          title="Disminuir cantidad"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold w-5 text-center text-gray-800">{item.cantidad}</span>
                        <button 
                          type="button"
                          onClick={() => cambiarCantidadProducto(item.id, 1)} 
                          className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-bold transition-colors cursor-pointer"
                          title="Aumentar cantidad"
                        >
                          +
                        </button>
                        <button 
                          type="button"
                          onClick={() => quitarProducto(item.id)} 
                          className="w-6 h-6 flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 rounded text-sm font-bold ml-1 transition-colors cursor-pointer"
                          title="Eliminar producto"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Servicios seleccionados */}
              <div className="pt-2">
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Mano de Obra / Servicios</p>
                {carritoServicios.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Ningún servicio agregado.</p>
                ) : (
                  carritoServicios.map(item => (
                    <div key={item.id} className="flex justify-between items-center py-2 text-xs border-b border-gray-100 gap-2">
                      <div className="flex-1 min-w-0 pr-1">
                        <p className="font-medium text-gray-800 truncate">{item.nombre}</p>
                        <p className="text-[11px] text-emerald-600 font-semibold">Bs. {(item.horas_estimadas * item.precio_hora).toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button 
                          type="button"
                          onClick={() => cambiarHorasServicio(item.id, -1)} 
                          className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-bold transition-colors cursor-pointer"
                          title="Disminuir horas"
                        >
                          -
                        </button>
                        <span className="text-xs font-bold min-w-5 text-center text-gray-800">{item.horas_estimadas}h</span>
                        <button 
                          type="button"
                          onClick={() => cambiarHorasServicio(item.id, 1)} 
                          className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-bold transition-colors cursor-pointer"
                          title="Aumentar horas"
                        >
                          +
                        </button>
                        <button 
                          type="button"
                          onClick={() => quitarServicio(item.id)} 
                          className="w-6 h-6 flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 rounded text-sm font-bold ml-1 transition-colors cursor-pointer"
                          title="Eliminar servicio"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          <div className="border-t border-gray-200 pt-4 mt-4">
            <div className="space-y-1 mb-4 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal Equipos:</span>
                <span>Bs. {totalProductos.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>Subtotal Servicios:</span>
                <span>Bs. {totalServicios.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t">
                <span>Total General:</span>
                <span className="text-blue-600">Bs. {totalGeneral.toFixed(2)}</span>
              </div>
            </div>

            <button 
              onClick={handleGuardarCotizacion}
              disabled={cargando}
              className="w-full bg-[#9fe82e] hover:bg-[#8be01c] text-gray-900 font-bold py-2.5 rounded-lg text-sm shadow-sm transition-colors disabled:opacity-50"
            >
              {cargando ? 'Generando Cotización...' : 'Guardar y Emitir Cotización'}
            </button>
          </div>

        </div>

      </div>
    </div>
  )
}