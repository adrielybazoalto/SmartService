'use client';

// =====================================================================
//  CU09 — Subflujo "Registrar abono a orden de trabajo"
//  El cliente paga una parte del servicio mientras la orden se ejecuta.
//  El abono se registra como recibo en la caja abierta (entra al arqueo)
//  y la liquidación (CU13) lo descuenta automáticamente.
//  Con tarjeta: se abre Stripe y el recibo se registra al volver, solo si
//  Stripe confirma el pago (ver page.tsx, ?abono=exito&session_id=...).
// =====================================================================

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { iniciarAbonoTarjetaAction, listarOrdenesAbonoAction, registrarAbonoAction } from '@/app/actions/abonos';
import type { OrdenParaAbono, ReciboAbono } from '@/backend/ventas/abonos';
import { PanelQr } from '@/components/pagos/panel-qr';
import { PanelTransferencia } from '@/components/pagos/panel-transferencia';
import { abrirNotaVentaPdf } from './ventas-form';

type Props = {
  onClose: () => void;
  onCompletado: () => void;
  notificar: (tipo: 'ok' | 'error', texto: string) => void;
};

type Metodo = 'EFECTIVO' | 'QR' | 'TRANSFERENCIA' | 'TARJETA';

const bs = (n: number) =>
  `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

const inputCls =
  'w-full bg-[#f8fafc] border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#8cd600] focus:outline-none';

const ETIQUETA: Record<Metodo, string> = {
  EFECTIVO: 'Efectivo',
  QR: 'QR',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta (Stripe)',
};

/** Identificador de este intento de pago (clave de idempotencia en Stripe) */
const nuevoIntento = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default function AbonoModal({ onClose, onCompletado, notificar }: Props) {
  const [ordenes, setOrdenes] = useState<OrdenParaAbono[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [ordenId, setOrdenId] = useState<number | null>(null);
  const [montoTxt, setMontoTxt] = useState('');
  const [metodo, setMetodo] = useState<Metodo>('EFECTIVO');
  const [referencia, setReferencia] = useState('');
  const [confirmado, setConfirmado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recibo, setRecibo] = useState<ReciboAbono | null>(null);
  const [intento] = useState(nuevoIntento);

  useEffect(() => {
    listarOrdenesAbonoAction().then((r) => {
      if (r.ok) setOrdenes(r.data);
      else setError(r.error);
      setCargando(false);
    });
  }, []);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ordenes;
    return ordenes.filter((o) =>
      [o.codigo_orden, o.cliente_nombre ?? '', o.numero_cotizacion ?? ''].some((t) => t.toLowerCase().includes(q))
    );
  }, [ordenes, busqueda]);

  const orden = ordenes.find((o) => o.orden_id === ordenId) ?? null;
  const monto = r2(Number(montoTxt.replace(',', '.')));
  const montoValido =
    Number.isFinite(monto) && monto > 0 && (orden?.maximo_abono == null || monto <= orden.maximo_abono);

  const elegirMetodo = (m: Metodo) => {
    setMetodo(m);
    setConfirmado(false);
    setError(null);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!orden) return setError('Seleccione la orden de trabajo.');
    if (!montoValido) {
      return setError(
        orden.maximo_abono != null && monto > orden.maximo_abono
          ? `El abono supera el monto pactado: máximo ${bs(orden.maximo_abono)}.`
          : 'Ingrese un monto mayor a 0.'
      );
    }
    if (metodo === 'TARJETA') {
      // El recibo se registra recién cuando Stripe confirma el pago
      setGuardando(true);
      const r = await iniciarAbonoTarjetaAction({ ordenId: orden.orden_id, monto, intento });
      if (r.ok) window.location.assign(r.data.url);
      else {
        setGuardando(false);
        setError(r.error);
      }
      return;
    }
    if (metodo === 'TRANSFERENCIA' && !referencia.trim()) return setError('Ingrese el número de referencia.');
    if (!confirmado) return setError('Confirme que recibió el dinero.');

    setGuardando(true);
    const res = await registrarAbonoAction({
      ordenId: orden.orden_id,
      monto,
      tipoPago: metodo,
      referencia: metodo === 'TRANSFERENCIA' ? referencia.trim() : null,
    });
    setGuardando(false);
    if (!res.ok) return setError(res.error);
    setRecibo(res.data);
    notificar('ok', res.mensaje);
    onCompletado();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !guardando && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-2xl sm:rounded-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Caja · Orden de trabajo</p>
            <h2 className="text-xl font-bold text-slate-900">{recibo ? 'Abono registrado' : 'Registrar abono a orden de trabajo'}</h2>
            {!recibo && (
              <p className="mt-1 text-sm text-slate-500">
                El abono entra al arqueo de este turno y se descuenta solo al liquidar la orden (CU13).
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={guardando}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {recibo ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-[#8cd600]/15 p-5 text-center">
              <p className="text-sm text-slate-600">Recibo</p>
              <p className="mt-1 font-mono text-2xl font-bold text-slate-900">{recibo.nro_comprobante}</p>
              <p className="mt-1 text-sm text-slate-600">
                Orden {recibo.orden} · Abono {bs(recibo.monto)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Total abonado a la orden: <strong>{bs(recibo.total_abonado)}</strong>
                {recibo.monto_pactado != null && <> de {bs(recibo.monto_pactado)} pactados</>}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  const err = await abrirNotaVentaPdf(recibo.id);
                  if (err) notificar('error', err);
                }}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Ver recibo PDF
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Listo
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-5">
            {/* 1. Orden de trabajo */}
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Orden de trabajo</label>
              <input
                className={inputCls}
                placeholder="Buscar por código, cliente o cotización…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-gray-100">
                {cargando ? (
                  <p className="p-4 text-center text-sm text-slate-500">Cargando órdenes…</p>
                ) : filtradas.length === 0 ? (
                  <p className="p-4 text-center text-sm text-slate-500">No hay órdenes pendientes de liquidar.</p>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {filtradas.map((o) => (
                      <li key={o.orden_id}>
                        <button
                          type="button"
                          onClick={() => {
                            setOrdenId(o.orden_id);
                            setError(null);
                          }}
                          className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition ${
                            ordenId === o.orden_id ? 'bg-[#8cd600]/15' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="font-mono font-semibold text-slate-900">{o.codigo_orden}</span>
                            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{o.estado}</span>
                            <span className="block truncate text-xs text-slate-500">
                              {o.cliente_nombre ?? 'Sin cliente'} · {o.numero_cotizacion ?? 'Sin cotización'}
                            </span>
                          </span>
                          <span className="whitespace-nowrap text-right text-xs text-slate-500">
                            Abonado {bs(o.total_abonado)}
                            {o.monto_pactado != null && <span className="block">de {bs(o.monto_pactado)}</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {orden && (
              <>
                {/* 2. Monto */}
                <div className="grid gap-3 rounded-xl bg-[#f8fafc] p-4 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-slate-500">Monto pactado</p>
                    <p className="font-semibold">{orden.monto_pactado != null ? bs(orden.monto_pactado) : 'Sin cotización'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Anticipo (CU08)</p>
                    <p className="font-semibold">{bs(orden.anticipo)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Ya abonado</p>
                    <p className="font-semibold">{bs(orden.total_abonado)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Máximo a abonar</p>
                    <p className="font-semibold">{orden.maximo_abono != null ? bs(orden.maximo_abono) : 'Sin tope'}</p>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Monto del abono (Bs)</label>
                  <input
                    className={`${inputCls} ${montoTxt && !montoValido ? 'border-red-400' : ''}`}
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={montoTxt}
                    onChange={(e) => {
                      setMontoTxt(e.target.value);
                      setConfirmado(false);
                    }}
                    placeholder="0.00"
                  />
                </div>

                {/* 3. Método de pago */}
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">Método de pago</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(ETIQUETA) as Metodo[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => elegirMetodo(m)}
                        className={`rounded-xl border px-3 py-2 text-sm font-medium ${
                          metodo === m ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 hover:border-[#8cd600]'
                        }`}
                      >
                        {ETIQUETA[m]}
                      </button>
                    ))}
                  </div>
                </div>

                {montoValido && metodo === 'EFECTIVO' && (
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} className="mt-0.5" />
                    <span>
                      Confirmo que recibí <strong>{bs(monto)}</strong> en efectivo
                    </span>
                  </label>
                )}
                {montoValido && metodo === 'QR' && (
                  <PanelQr total={monto} confirmado={confirmado} onConfirmar={setConfirmado} />
                )}
                {montoValido && metodo === 'TARJETA' && (
                  <p className="rounded-xl bg-[#f8fafc] p-3 text-sm text-slate-600">
                    Se abrirá la página de pago de Stripe (modo prueba, tarjeta 4242 4242 4242 4242). El recibo se
                    registra solo cuando Stripe confirma el pago; un doble clic no genera dos cobros.
                  </p>
                )}
                {montoValido && metodo === 'TRANSFERENCIA' && (
                  <PanelTransferencia
                    total={monto}
                    referencia={referencia}
                    onReferencia={(v) => {
                      setReferencia(v);
                      if (!v.trim()) setConfirmado(false);
                    }}
                    confirmado={confirmado}
                    onConfirmar={setConfirmado}
                  />
                )}
              </>
            )}

            {error && (
              <div role="alert" className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={guardando || !orden || !montoValido || (metodo !== 'TARJETA' && !confirmado)}
              className="w-full rounded-xl bg-[#8cd600] px-4 py-3 text-sm font-semibold text-gray-900 transition hover:bg-[#73b800] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {guardando
                ? metodo === 'TARJETA' ? 'Conectando con Stripe…' : 'Registrando…'
                : metodo === 'TARJETA' ? 'Cobrar abono con tarjeta' : 'Registrar abono y emitir recibo'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
