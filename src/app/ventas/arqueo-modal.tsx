'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { abrirCaja, cerrarCaja, obtenerResumenArqueo } from '@/app/actions/ventas';
import type { Caja, ResumenArqueo } from '@/backend/ventas';
type Props = {
  modo: 'apertura' | 'cierre';
  onClose: () => void;
  onCompletado: () => void;
  notificar: (tipo: 'ok' | 'error', texto: string) => void;
};

const bs = (n: number) =>
  `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

const inputCls =
  'w-full bg-[#f8fafc] border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#8cd600] focus:outline-none';

/** Denominaciones de Bolivia para el conteo físico */
const DENOMINACIONES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1];

export default function ArqueoModal({ modo, onClose, onCompletado, notificar }: Props) {
  const [monto, setMonto] = useState('');
  const [observacion, setObservacion] = useState('');
  const [resumen, setResumen] = useState<ResumenArqueo | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(modo === 'cierre');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usarConteo, setUsarConteo] = useState(false);
  const [conteo, setConteo] = useState<Record<string, string>>({});
  const [cerrada, setCerrada] = useState<Caja | null>(null);

  // Cerrar con Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !guardando && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guardando, onClose]);

  // Resumen para el cierre
  useEffect(() => {
    if (modo !== 'cierre') return;
    let activo = true;
    obtenerResumenArqueo().then((res) => {
      if (!activo) return;
      if (res.ok) setResumen(res.data);
      else setError(res.error);
      setCargandoResumen(false);
    });
    return () => {
      activo = false;
    };
  }, [modo]);

  const parseDecimal = (val: string): number => {
    if (!val || val.trim() === '') return NaN;
    const normalizado = val.trim().replace(',', '.');
    return Number(normalizado);
  };

  const totalConteo = r2(
    DENOMINACIONES.reduce((acc, d) => acc + d * (Math.max(0, Math.floor(Number(conteo[d]) || 0))), 0)
  );
  const montoNumerico = parseDecimal(monto);
  const contado = usarConteo ? totalConteo : (Number.isFinite(montoNumerico) ? r2(montoNumerico) : NaN);
  const montoValido = usarConteo ? true : monto.trim() !== '' && Number.isFinite(contado) && contado >= 0;
  const diferencia = resumen && montoValido ? r2(contado - resumen.efectivo_esperado) : null;
  const requiereObs = diferencia !== null && diferencia !== 0;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!montoValido) return setError('Ingrese un monto válido mayor o igual a 0');

    setGuardando(true);
    if (modo === 'apertura') {
      const res = await abrirCaja(contado);
      setGuardando(false);
      if (!res.ok) return setError(res.error);
      notificar('ok', `Caja #${res.data.caja.id} abierta con ${bs(res.data.caja.monto_inicial)}`);
      onCompletado();
      onClose();
      return;
    }

    if (requiereObs && observacion.trim().length < 5) {
      setGuardando(false);
      return setError('Hay diferencia en el arqueo: describa el motivo en la observación');
    }
    const res = await cerrarCaja({ montoReal: contado, observacion });
    setGuardando(false);
    if (!res.ok) return setError(res.error);
    setCerrada(res.data.caja);
    notificar('ok', `Caja #${res.data.caja.id} cerrada`);
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
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Caja</p>
            <h2 className="text-xl font-bold text-slate-900">
              {modo === 'apertura' ? 'Abrir turno de caja' : cerrada ? 'Turno cerrado' : 'Arqueo y cierre de caja'}
            </h2>
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

        {/* ---------------- Resultado del cierre ---------------- */}
        {cerrada ? (
          <div className="space-y-4">
            <div
              className={`rounded-xl p-5 text-center ${
                (cerrada.monto_diferencia ?? 0) === 0
                  ? 'bg-[#8cd600]/15'
                  : (cerrada.monto_diferencia ?? 0) > 0
                    ? 'bg-amber-50'
                    : 'bg-red-50'
              }`}
            >
              <p className="text-sm text-slate-600">Diferencia de arqueo</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{bs(cerrada.monto_diferencia ?? 0)}</p>
              <p className="mt-1 text-sm font-medium text-slate-600">
                {(cerrada.monto_diferencia ?? 0) === 0
                  ? 'Caja cuadrada'
                  : (cerrada.monto_diferencia ?? 0) > 0
                    ? 'Sobrante'
                    : 'Faltante'}
              </p>
            </div>
            <dl className="space-y-2 rounded-xl bg-[#f8fafc] p-4 text-sm">
              <Fila etiqueta="Efectivo esperado" valor={bs(cerrada.monto_final_sistema ?? 0)} />
              <Fila etiqueta="Efectivo contado" valor={bs(cerrada.monto_final_real ?? 0)} />
              {cerrada.observacion && <Fila etiqueta="Observación" valor={cerrada.observacion} />}
            </dl>
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-[#8cd600] px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-[#73b800]"
            >
              Listo
            </button>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-5">
            {/* ---------------- Resumen del turno (cierre) ---------------- */}
            {modo === 'cierre' && (
              <>
                {cargandoResumen ? (
                  <div className="h-40 animate-pulse rounded-xl bg-[#f8fafc]" />
                ) : (
                  resumen && (
                    <div className="space-y-2 rounded-xl bg-[#f8fafc] p-4 text-sm">
                      <Fila etiqueta="Fondo inicial" valor={bs(resumen.caja.monto_inicial)} />
                      <Fila etiqueta="Ventas en efectivo" valor={bs(resumen.totales_por_pago.EFECTIVO)} />
                      <div className="border-t border-gray-200 pt-2">
                        <Fila etiqueta="Efectivo esperado en caja" valor={bs(resumen.efectivo_esperado)} fuerte />
                      </div>
                      <div className="grid grid-cols-3 gap-2 border-t border-gray-200 pt-3 text-center">
                        <Mini etiqueta="QR" valor={bs(resumen.totales_por_pago.QR)} />
                        <Mini etiqueta="Tarjeta" valor={bs(resumen.totales_por_pago.TARJETA)} />
                        <Mini etiqueta="Transf." valor={bs(resumen.totales_por_pago.TRANSFERENCIA)} />
                      </div>
                      <p className="pt-1 text-xs text-slate-500">
                        {resumen.cantidad_ventas} venta(s) · total {bs(resumen.total_vendido)}
                        {resumen.cantidad_anuladas > 0 && ` · ${resumen.cantidad_anuladas} anulada(s) excluidas`}
                      </p>
                    </div>
                  )
                )}
              </>
            )}

            {/* ---------------- Monto ---------------- */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="monto" className="text-sm font-medium text-slate-700">
                  {modo === 'apertura' ? 'Fondo inicial en efectivo (Bs)' : 'Efectivo contado (Bs)'}
                </label>
                <button
                  type="button"
                  onClick={() => setUsarConteo((v) => !v)}
                  className="text-xs font-semibold text-[#5a8f00] hover:text-[#3f6b00]"
                >
                  {usarConteo ? 'Ingresar monto directo' : 'Contar por billetes'}
                </button>
              </div>

              {usarConteo ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {DENOMINACIONES.map((d) => (
                      <label key={d} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-[#f8fafc] px-3 py-2">
                        <span className="w-12 shrink-0 text-xs font-semibold text-slate-500">
                          {d >= 1 ? `Bs ${d}` : `${d * 100} ctv`}
                        </span>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          value={conteo[d] ?? ''}
                          onChange={(e) => setConteo((c) => ({ ...c, [d]: e.target.value }))}
                          placeholder="0"
                          className="w-full bg-transparent text-right text-sm font-semibold text-slate-900 focus:outline-none"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-3 text-white">
                    <span className="text-sm">Total contado</span>
                    <span className="text-lg font-bold">{bs(totalConteo)}</span>
                  </div>
                </div>
              ) : (
                <input
                  id="monto"
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={monto}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || /^\d*[.,]?\d{0,2}$/.test(val)) {
                      setMonto(val);
                    }
                  }}
                  placeholder="0.00"
                  className={`${inputCls} text-lg font-semibold`}
                />
              )}
            </div>

            {/* ---------------- Diferencia en vivo ---------------- */}
            {modo === 'cierre' && diferencia !== null && (
              <div
                className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold ${
                  diferencia === 0
                    ? 'bg-[#8cd600]/15 text-[#3f6b00]'
                    : diferencia > 0
                      ? 'bg-amber-50 text-amber-700'
                      : 'bg-red-50 text-red-700'
                }`}
              >
                <span>{diferencia === 0 ? 'Caja cuadrada' : diferencia > 0 ? 'Sobrante' : 'Faltante'}</span>
                <span>
                  {diferencia > 0 ? '+' : diferencia < 0 ? '−' : ''}
                  {bs(Math.abs(diferencia))}
                </span>
              </div>
            )}

            {modo === 'cierre' && (
              <div>
                <label htmlFor="obs" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Observación {requiereObs ? <span className="text-red-500">*</span> : <span className="text-slate-400">(opcional)</span>}
                </label>
                <textarea
                  id="obs"
                  rows={3}
                  maxLength={500}
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  placeholder={requiereObs ? 'Explique el motivo de la diferencia' : 'Notas del turno'}
                  className={`${inputCls} resize-none`}
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={guardando}
                className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={guardando || !montoValido || (modo === 'cierre' && (cargandoResumen || !resumen))}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  modo === 'apertura'
                    ? 'bg-[#8cd600] text-gray-900 hover:bg-[#73b800]'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                }`}
              >
                {guardando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
                {modo === 'apertura' ? 'Abrir caja' : 'Cerrar caja'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className={fuerte ? 'font-semibold text-slate-900' : 'text-slate-500'}>{etiqueta}</span>
      <span className={`text-right ${fuerte ? 'text-base font-bold text-slate-900' : 'font-medium text-slate-700'}`}>{valor}</span>
    </div>
  );
}

function Mini({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{etiqueta}</p>
      <p className="text-xs font-semibold text-slate-700">{valor}</p>
    </div>
  );
}
