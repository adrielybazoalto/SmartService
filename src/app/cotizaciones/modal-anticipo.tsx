'use client'

import { useState } from 'react'
import { aprobarCotizacionAccion, iniciarAnticipoTarjetaAction } from '@/app/actions/cotizaciones'
import { PanelQr } from '@/components/pagos/panel-qr'
import { PanelTransferencia } from '@/components/pagos/panel-transferencia'

type Metodo = 'EFECTIVO' | 'QR' | 'TRANSFERENCIA' | 'TARJETA'

const METODOS: { valor: Metodo; etiqueta: string }[] = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'QR', etiqueta: 'QR' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
]

export interface CotizacionParaAprobar {
  id: number
  nro: string
  cliente: string
  total: number
}

/** CU08, subflujo "Registrar anticipo": sugiere el 50 % del total, editable. */
export function ModalAnticipo({
  cotizacion,
  onCerrar,
  onAprobada,
}: {
  cotizacion: CotizacionParaAprobar
  onCerrar: () => void
  onAprobada: () => void
}) {
  const { total } = cotizacion
  const [montoTexto, setMontoTexto] = useState((total / 2).toFixed(2))
  const [metodo, setMetodo] = useState<Metodo>('EFECTIVO')
  const [referencia, setReferencia] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const monto = Number(montoTexto.replace(',', '.'))
  const montoValido = Number.isFinite(monto) && monto >= 0 && monto <= total
  const porcentaje = montoValido && total > 0 ? Math.round((monto / total) * 1000) / 10 : 0
  const puedeRegistrar = montoValido && monto > 0 && (metodo === 'TARJETA' || confirmado)

  function cambiarMetodo(m: Metodo) {
    setMetodo(m)
    setConfirmado(false)
    setError(null)
  }

  function cambiarMonto(valor: string) {
    setMontoTexto(valor)
    setConfirmado(false)
  }

  async function aprobar(anticipo: { monto: number; metodo: Metodo | null; referencia: string | null }) {
    setEnviando(true)
    setError(null)
    const r = await aprobarCotizacionAccion(cotizacion.id, anticipo)
    setEnviando(false)
    if (r.success) onAprobada()
    else setError(r.message)
  }

  // Stripe confirma el pago: la cotización se aprueba al volver, no aquí
  async function pagarConTarjeta() {
    setEnviando(true)
    setError(null)
    const r = await iniciarAnticipoTarjetaAction(cotizacion.id, monto)
    if (r.success && r.url) {
      window.location.assign(r.url)
      return
    }
    setEnviando(false)
    setError(r.message)
  }

  function registrar() {
    if (metodo === 'TARJETA') {
      pagarConTarjeta()
      return
    }
    aprobar({ monto, metodo, referencia: metodo === 'TRANSFERENCIA' ? referencia.trim() : null })
  }

  function aprobarSinAnticipo() {
    if (confirm(`¿Aprobar la cotización ${cotizacion.nro} sin registrar anticipo?`)) {
      aprobar({ monto: 0, metodo: null, referencia: null })
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
        <div className="p-5 sm:p-6 bg-slate-50 border-b border-slate-200">
          <span className="text-xs font-bold text-green-700 bg-green-100 px-2.5 py-0.5 rounded-full uppercase">CU08</span>
          <h3 className="mt-2 text-lg font-bold text-slate-900">Registrar anticipo</h3>
          <p className="text-xs text-slate-500 mt-1">
            {cotizacion.nro} · {cotizacion.cliente} · Total Bs. {total.toFixed(2)}
          </p>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Monto del anticipo (Bs.)
            </span>
            <input
              type="number"
              min={0}
              max={total}
              step="0.01"
              value={montoTexto}
              onChange={(e) => cambiarMonto(e.target.value)}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none ${montoValido ? 'border-slate-300' : 'border-red-400'}`}
            />
            <span className={`mt-1 block text-xs ${montoValido ? 'text-slate-500' : 'text-red-600'}`}>
              {montoValido ? `${porcentaje} % del total` : `El monto debe estar entre 0 y ${total.toFixed(2)}`}
            </span>
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {METODOS.map((m) => (
              <button
                key={m.valor}
                type="button"
                onClick={() => cambiarMetodo(m.valor)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium cursor-pointer ${
                  metodo === m.valor ? 'border-green-700 bg-green-700 text-white' : 'border-slate-300 hover:border-green-500'
                }`}
              >
                {m.etiqueta}
              </button>
            ))}
          </div>

          {montoValido && monto > 0 && metodo === 'EFECTIVO' && (
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} className="mt-0.5" />
              <span>
                Confirmo que recibí <strong>Bs. {monto.toFixed(2)}</strong> en efectivo
              </span>
            </label>
          )}
          {montoValido && monto > 0 && metodo === 'QR' && (
            <PanelQr total={monto} confirmado={confirmado} onConfirmar={setConfirmado} />
          )}
          {montoValido && monto > 0 && metodo === 'TRANSFERENCIA' && (
            <PanelTransferencia
              total={monto}
              referencia={referencia}
              onReferencia={(v) => {
                setReferencia(v)
                if (!v.trim()) setConfirmado(false)
              }}
              confirmado={confirmado}
              onConfirmar={setConfirmado}
            />
          )}

          {metodo === 'TARJETA' && (
            <p className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
              Se abrirá la pasarela de pago segura (Stripe)
            </p>
          )}

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onCerrar}
              disabled={enviando}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={aprobarSinAnticipo}
              disabled={enviando}
              className="px-4 py-2 text-sm font-medium text-amber-700 border border-amber-300 hover:bg-amber-50 rounded-lg cursor-pointer disabled:opacity-50"
            >
              Aprobar sin anticipo
            </button>
            <button
              type="button"
              onClick={registrar}
              disabled={enviando || !puedeRegistrar}
              className="px-4 py-2 text-sm font-semibold text-white bg-green-700 hover:bg-green-800 rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
            >
              {enviando ? 'Procesando…' : metodo === 'TARJETA' ? 'Pagar con tarjeta' : 'Registrar anticipo y aprobar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
