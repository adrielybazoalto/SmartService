'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { obtenerCotizacionPorIdAccion } from '@/app/actions/cotizaciones'

export default function CotizacionPdfPage() {
  const params = useParams()
  const [cotizacion, setCotizacion] = useState<any>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    async function cargarDetalle() {
      if (params?.id) {
        try {
          const data = await obtenerCotizacionPorIdAccion(Number(params.id))
          if (data) {
            setCotizacion(data)
          }
        } catch (err) {
          console.error('Error al cargar detalle PDF:', err)
        }
      }
      setCargando(false)
    }
    cargarDetalle()
  }, [params?.id])

  if (cargando) return <div className="p-12 text-center text-gray-500">Cargando documento PDF...</div>
  if (!cotizacion) return <div className="p-12 text-center text-red-500">Cotización no encontrada.</div>

  return (
    <>
      {/* Estilo CSS global para forzar que al imprimir se oculte todo lo externo */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 10px;
            box-shadow: none !important;
            border: none !important;
          }
        }
      `}</style>

      {/* Contenedor principal delimitado para impresión */}
      <div id="print-area" className="p-10 max-w-4xl mx-auto bg-white my-6 shadow-md border border-gray-200 rounded-lg font-sans">
        
        {/* Cabecera Comercial */}
        <div className="flex justify-between items-start border-b pb-4 mb-4">
          <div>
            <span className="bg-gray-100 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded uppercase">SmartService · Proforma Comercial</span>
            <h1 className="text-xl font-bold text-gray-900 mt-1">Cotización: {cotizacion.numero_cotizacion}</h1>
          </div>
          <div className="text-right text-xs text-gray-600">
            <p><b>Fecha Emisión:</b> {cotizacion.fecha_emision}</p>
            <p><b>Vencimiento:</b> {cotizacion.fecha_vencimiento || 'N/A'}</p>
          </div>
        </div>

        {/* Datos del Cliente y Estado */}
        <div className="mb-6 text-xs space-y-1 bg-gray-50 p-3 rounded border">
          <p><b>Cliente:</b> {cotizacion.cliente?.nombre || `Cliente #${cotizacion.cliente_id}`}</p>
          <p><b>Estado Actual:</b> <span className="font-bold text-amber-700">{cotizacion.estado}</span></p>
        </div>

        {/* Sección 1: Equipos y Materiales */}
        <div className="mb-6">
          <h3 className="text-xs font-bold text-gray-800 uppercase mb-2 bg-gray-100 px-3 py-1.5 rounded">1. Equipos y Materiales</h3>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-2 px-2">Descripción</th>
                <th className="py-2 px-2 text-center">Cantidad</th>
                <th className="py-2 px-2 text-right">P. Unitario (Bs.)</th>
                <th className="py-2 px-2 text-right">Subtotal (Bs.)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cotizacion.productos?.length === 0 ? (
                <tr><td colSpan={4} className="py-3 text-center text-gray-400 italic">Sin equipos agregados.</td></tr>
              ) : (
                cotizacion.productos?.map((p: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-2 font-medium">{p.producto?.nombre || `Producto #${p.producto_id}`}</td>
                    <td className="py-2.5 px-2 text-center">{p.cantidad}</td>
                    <td className="py-2.5 px-2 text-right">Bs. {Number(p.precio_unitario).toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right font-semibold">Bs. {Number(p.subtotal).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Sección 2: Servicios Técnicos / Mano de Obra */}
        <div className="mb-6">
          <h3 className="text-xs font-bold text-gray-800 uppercase mb-2 bg-gray-100 px-3 py-1.5 rounded">2. Servicios Técnicos / Mano de Obra</h3>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-2 px-2">Descripción del Servicio</th>
                <th className="py-2 px-2 text-center">Horas Est.</th>
                <th className="py-2 px-2 text-right">Tarifa / Hora (Bs.)</th>
                <th className="py-2 px-2 text-right">Subtotal (Bs.)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cotizacion.servicios?.length === 0 ? (
                <tr><td colSpan={4} className="py-3 text-center text-gray-400 italic">Sin servicios agregados.</td></tr>
              ) : (
                cotizacion.servicios?.map((s: any, idx: number) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-2 font-medium">{s.servicio?.nombre || `Servicio #${s.servicio_id}`}</td>
                    <td className="py-2.5 px-2 text-center">{s.horas_estimadas} hrs</td>
                    <td className="py-2.5 px-2 text-right">Bs. {Number(s.precio_hora).toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right font-semibold">Bs. {Number(s.subtotal).toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Total General */}
        <div className="flex justify-end border-t pt-4 mb-8">
          <div className="text-right">
            <span className="text-xs font-bold uppercase text-gray-600">Total General: </span>
            <span className="text-xl font-black text-blue-600 ml-2">Bs. {Number(cotizacion.total).toFixed(2)}</span>
          </div>
        </div>

        {/* Botones de acción inferior (Se ocultan al imprimir) */}
        <div className="flex justify-between items-center pt-4 border-t print:hidden">
          <button 
            onClick={() => window.print()}
            className="bg-[#9fe82e] hover:bg-[#8be01c] text-gray-900 font-bold px-5 py-2 rounded-lg text-xs shadow-sm cursor-pointer"
          >
            🖨️ Imprimir / Guardar PDF
          </button>
          <button 
            onClick={() => window.close()}
            className="text-xs text-gray-600 underline cursor-pointer"
          >
            Cerrar pestaña
          </button>
        </div>

      </div>
    </>
  )
} 