'use client'

import { useState } from 'react'

export interface DatosVentana {
  fecha: string
  horaInicio: string
  horaFin: string
  tipoTrabajo: string
}

/** Ventana horaria de una orden: nueva orden correctiva o cambio de ventana (CU12). */
export function ModalVentana({
  titulo,
  conTipo = false,
  onConfirmar,
  onCerrar,
}: {
  titulo: string
  /** La orden correctiva, además, pide el tipo de trabajo. */
  conTipo?: boolean
  onConfirmar: (datos: DatosVentana) => Promise<string | null>
  onCerrar: () => void
}) {
  const [fecha, setFecha] = useState('')
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [tipoTrabajo, setTipoTrabajo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (horaFin <= horaInicio) {
      setError('La hora de fin programada debe ser posterior a la hora de inicio')
      return
    }
    setEnviando(true)
    setError(null)
    const fallo = await onConfirmar({ fecha, horaInicio, horaFin, tipoTrabajo })
    setEnviando(false)
    if (fallo) setError(fallo)
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <form onSubmit={enviar} className="bg-white rounded-xl max-w-md w-full">
        <div className="p-6 border-b border-slate-200">
          <h3 className="text-lg font-bold text-slate-900">{titulo}</h3>
        </div>
        <div className="p-6 space-y-4 text-sm">
          {conTipo && (
            <label className="block">
              <span className="block font-medium text-slate-700 mb-1">Tipo de trabajo *</span>
              <input
                required
                maxLength={100}
                value={tipoTrabajo}
                onChange={(e) => setTipoTrabajo(e.target.value)}
                placeholder="Ej.: Mantenimiento correctivo"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </label>
          )}
          <label className="block">
            <span className="block font-medium text-slate-700 mb-1">Fecha programada *</span>
            <input
              type="date"
              required
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block font-medium text-slate-700 mb-1">Hora inicio *</span>
              <input
                type="time"
                required
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </label>
            <label className="block">
              <span className="block font-medium text-slate-700 mb-1">Hora fin *</span>
              <input
                type="time"
                required
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 whitespace-pre-line text-red-700">
              {error}
            </p>
          )}
        </div>
        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
          <button type="button" onClick={onCerrar} className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={enviando}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
          >
            {enviando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  )
}
