'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { obtenerCotizacionesAccion, cambiarEstadoCotizacionAccion, eliminarCotizacionAccion } from '@/app/actions/cotizaciones'
import { convertirCotizacionAOrdenAccion } from '@/app/actions/ordenes-trabajo'

export default function CotizacionesPage() {
  const router = useRouter()
  const [cotizaciones, setCotizaciones] = useState<any[]>([])
  const [cargando, setCargando] = useState(true)

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
  }, [])

  const handleCambiarEstado = async (id: number, nuevoEstado: string) => {
    if (confirm(`¿Deseas cambiar el estado a ${nuevoEstado}?`)) {
      try {
        await cambiarEstadoCotizacionAccion(id, nuevoEstado)
        alert('Estado actualizado con éxito.')
        cargarCotizaciones()
      } catch (err: any) {
        alert('Error: ' + err.message)
      }
    }
  }

  const handleConvertirAOrden = async (id: number, nro: string) => {
    if (confirm(`¿Convertir la cotización ${nro} aprobada en Orden de Trabajo?`)) {
      try {
        const res = await convertirCotizacionAOrdenAccion(id)
        if (res.ok) {
          alert(res.mensaje)
          cargarCotizaciones()
          router.push('/ordenes-trabajo')
        } else {
          alert(res.error)
        }
      } catch (err: any) {
        alert('Error: ' + err.message)
      }
    }
  }

  const handleEliminar = async (id: number, nro: string) => {
    if (confirm(`¿Estás segura de eliminar la cotización ${nro}?`)) {
      try {
        await eliminarCotizacionAccion(id)
        alert('Cotización eliminada.')
        cargarCotizaciones()
      } catch (err: any) {
        alert('Error: ' + err.message)
      }
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
        <Link 
          href="/cotizaciones/nuevo" 
          className="bg-[#9fe82e] hover:bg-[#8be01c] text-gray-900 font-semibold px-4 py-2 rounded-xl text-sm shadow-sm transition-colors flex items-center justify-center gap-2 w-full sm:w-auto"
        >
          + Nueva Cotización
        </Link>
      </div>

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
                      <select 
                        value={cot.estado}
                        onChange={(e) => handleCambiarEstado(cot.id, e.target.value)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-md border focus:outline-none ${
                          cot.estado === 'APROBADA' ? 'bg-green-100 text-green-800 border-green-300' :
                          cot.estado === 'RECHAZADA' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}
                      >
                        <option value="PENDIENTE">PENDIENTE</option>
                        <option value="APROBADA">APROBADA</option>
                        <option value="RECHAZADA">RECHAZADA</option>
                      </select>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        {cot.estado === 'APROBADA' && (
                          <button
                            onClick={() => handleConvertirAOrden(cot.id, cot.numero_cotizacion)}
                            className="text-purple-600 hover:underline text-xs font-medium bg-purple-50 px-2.5 py-1 rounded-lg shadow-xs cursor-pointer"
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

                        <button 
                          onClick={() => router.push(`/cotizaciones/editar/${cot.id}`)}
                          className="text-amber-600 hover:underline text-xs font-medium bg-amber-50 px-2.5 py-1 rounded-lg shadow-xs cursor-pointer"
                        >
                          Editar
                        </button>

                        <button 
                          onClick={() => handleEliminar(cot.id, cot.numero_cotizacion)}
                          className="text-red-600 hover:underline text-xs font-medium bg-red-50 px-2.5 py-1 rounded-lg shadow-xs cursor-pointer"
                        >
                          Eliminar
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
    </div>
  )
}