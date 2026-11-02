'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { anularVenta, listarTurnosCerrados, obtenerDatosVentas } from '@/app/actions/ventas';
import { confirmarAbonoTarjetaAction } from '@/app/actions/abonos';
import type { Caja, DatosVentas, VentaResumen } from '@/backend/ventas';
import VentasForm, { abrirNotaVentaPdf } from './ventas-form';
import ArqueoModal from './arqueo-modal';
import AbonoModal from './abono-modal';

// ---------------------------------------------------------------------------
// Utilidades de formato
// ---------------------------------------------------------------------------
const bs = (n: number) =>
  `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Las columnas TIMESTAMP (sin zona) se guardan en UTC: se interpreta así */
const fecha = (iso?: string | null, soloHora = false) => {
  if (!iso) return '—';
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return soloHora
    ? d.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' });
};

const ETIQUETA_PAGO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  QR: 'QR',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
};

type Toast = { tipo: 'ok' | 'error'; texto: string } | null;

export default function VentasPage() {
  const [datos, setDatos] = useState<DatosVentas | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [modal, setModal] = useState<'apertura' | 'cierre' | 'abono' | null>(null);
  const [turnos, setTurnos] = useState<Caja[]>([]);
  const [verTurnos, setVerTurnos] = useState(false);
  const [porAnular, setPorAnular] = useState<VentaResumen | null>(null);
  const [anulando, setAnulando] = useState(false);

  const notificar = useCallback((tipo: 'ok' | 'error', texto: string) => setToast({ tipo, texto }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const cargar = useCallback(async () => {
    const res = await obtenerDatosVentas();
    if (res.ok) {
      setDatos(res.data);
      setErrorCarga(null);
    } else {
      setErrorCarga(res.error);
    }
    setCargando(false);
  }, []);

  const cargarTurnos = useCallback(async () => {
    const res = await listarTurnosCerrados(20);
    if (res.ok) setTurnos(res.data);
    else notificar('error', res.error);
  }, [notificar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Abono con tarjeta: Stripe vuelve a /ventas?abono=exito&session_id=...
  // El recibo se registra aquí, una sola vez (la BD es idempotente por sesión).
  const abonoProcesado = useRef(false);
  useEffect(() => {
    if (abonoProcesado.current) return;
    abonoProcesado.current = true;
    const q = new URLSearchParams(window.location.search);
    const abono = q.get('abono');
    const sessionId = q.get('session_id');
    if (!abono) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (abono === 'cancelado') {
      notificar('error', 'Pago con tarjeta cancelado: el abono no se registró.');
      return;
    }
    if (abono === 'exito' && sessionId) {
      confirmarAbonoTarjetaAction(sessionId).then((r) => {
        if (r.ok) {
          notificar('ok', r.mensaje);
          cargar();
        } else notificar('error', r.error);
      });
    }
  }, [cargar, notificar]);

  useEffect(() => {
    if (verTurnos) cargarTurnos();
  }, [verTurnos, cargarTurnos]);

  const confirmarAnulacion = async () => {
    if (!porAnular) return;
    setAnulando(true);
    const res = await anularVenta(porAnular.id);
    setAnulando(false);
    if (res.ok) {
      notificar('ok', `${res.data.nroComprobante ?? 'Venta'} anulada. Stock devuelto al inventario.`);
      setPorAnular(null);
      cargar();
    } else {
      notificar('error', res.error);
    }
  };

  const caja = datos?.caja ?? null;
  const resumen = datos?.resumen ?? null;

  return (
    <main className="min-h-screen bg-[#f4f7f6] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* ------------------------------------------------------------ */}
        {/* Encabezado                                                   */}
        {/* ------------------------------------------------------------ */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">CU09 · Comercial</p>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Ventas en mostrador</h1>
            <p className="mt-1 text-sm text-slate-500">
              Registra ventas directas, descuenta stock en el kárdex y controla el turno de caja.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {caja ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-[#8cd600]/15 px-3 py-1.5 text-sm font-medium text-[#3f6b00]">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#8cd600]" />
                Caja #{caja.id} abierta · {fecha(caja.fecha_apertura, true)}
              </span>
            ) : (
              !cargando && (
                <span className="inline-flex items-center gap-2 rounded-full bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  Caja cerrada
                </span>
              )
            )}
            {/* Subflujo "Consultar turnos": solo Administrador */}
            {datos?.usuario.esAdmin && (
              <button
                type="button"
                onClick={() => setVerTurnos((v) => !v)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                {verTurnos ? 'Ocultar turnos' : 'Turnos cerrados'}
              </button>
            )}
            {caja && (
              <button
                type="button"
                onClick={() => setModal('abono')}
                className="rounded-xl border border-[#8cd600] bg-white px-4 py-2.5 text-sm font-semibold text-[#3f6b00] shadow-sm transition hover:bg-[#8cd600]/10"
              >
                Abono a orden de trabajo
              </button>
            )}
            {caja ? (
              <button
                type="button"
                onClick={() => setModal('cierre')}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Arqueo y cierre
              </button>
            ) : (
              <button
                type="button"
                disabled={cargando || !!errorCarga}
                onClick={() => setModal('apertura')}
                className="rounded-xl bg-[#8cd600] px-4 py-2.5 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#73b800] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Abrir caja
              </button>
            )}
          </div>
        </header>

        {/* ------------------------------------------------------------ */}
        {/* Estados de carga / error                                     */}
        {/* ------------------------------------------------------------ */}
        {cargando && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl border border-gray-100 bg-white shadow-sm" />
            ))}
            <div className="h-96 animate-pulse rounded-2xl border border-gray-100 bg-white shadow-sm sm:col-span-2 lg:col-span-4" />
          </div>
        )}

        {!cargando && errorCarga && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-red-700">
            <p className="font-semibold">No se pudo cargar el módulo de ventas</p>
            <p className="mt-1 text-sm">{errorCarga}</p>
            <button
              onClick={() => {
                setCargando(true);
                cargar();
              }}
              className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-100"
            >
              Reintentar
            </button>
          </div>
        )}

        {!cargando && datos && (
          <>
            {/* KPIs del turno */}
            <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <Kpi titulo="Fondo inicial" valor={caja ? bs(caja.monto_inicial) : '—'} />
              <Kpi titulo="Ventas del turno" valor={resumen ? String(resumen.cantidad_ventas) : '—'} detalle={resumen?.cantidad_anuladas ? `${resumen.cantidad_anuladas} anulada(s)` : undefined} />
              <Kpi titulo="Total vendido" valor={resumen ? bs(resumen.total_vendido) : '—'} />
              <Kpi titulo="Efectivo esperado" valor={resumen ? bs(resumen.efectivo_esperado) : '—'} acento />
            </section>

            {!caja && (
              <section className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-[#8cd600]/60 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Debe abrir un turno de caja antes de vender</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Ingrese el fondo inicial en efectivo para habilitar el registro de ventas.
                  </p>
                </div>
                <button
                  onClick={() => setModal('apertura')}
                  className="w-full rounded-xl bg-[#8cd600] px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-[#73b800] sm:w-auto"
                >
                  Abrir caja
                </button>
              </section>
            )}

            <section className="grid gap-6 xl:grid-cols-3">
              {/* Formulario de venta */}
              <div className="xl:col-span-2">
                <VentasForm
                  productos={datos.productos}
                  clientes={datos.clientes}
                  clienteMostradorId={datos.cliente_mostrador_id}
                  cajaAbierta={!!caja}
                  notificar={notificar}
                  onVentaRegistrada={cargar}
                />
              </div>

              {/* Ventas del turno */}
              <aside className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900">Ventas del turno</h2>
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {datos?.ventas?.length??0}
                  </span>
                </div>

                {(datos?.ventas?.length ?? 0) === 0 ? (
                  <p className="rounded-xl bg-[#f8fafc] p-6 text-center text-sm text-slate-500">
                    {caja ? 'Aún no hay ventas en este turno.' : 'Abra la caja para comenzar.'}
                  </p>
                ) : (
                  <ul className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                    {datos.ventas.map((v) => {
                      const anulada = v.estado === 'ANULADA';
                      return (
                        <li
                          key={v.id}
                          className={`rounded-xl border p-3 transition ${anulada ? 'border-red-100 bg-red-50/40' : 'border-gray-100 hover:border-[#8cd600]/50'}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className={`font-mono text-sm font-semibold ${anulada ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                                {v.nro_comprobante ?? `#${v.id}`}
                              </p>
                              <p className="truncate text-xs text-slate-500">{v.cliente_nombre}</p>
                            </div>
                            <p className={`whitespace-nowrap text-sm font-bold ${anulada ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                              {bs(v.total)}
                            </p>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
                              <span>{fecha(v.fecha_emision, true)}</span>
                              <span>·</span>
                              {v.tipo_comprobante?.startsWith('RECIBO') ? (
                                <span className="rounded-md bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                                  {v.tipo_comprobante === 'RECIBO_SALDO' ? 'Saldo OT' : 'Abono OT'}
                                </span>
                              ) : (
                                <span>{v.items} ítem(s)</span>
                              )}
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                                {ETIQUETA_PAGO[v.tipo_pago] ?? v.tipo_pago}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={async () => {
                                  const error = await abrirNotaVentaPdf(v.id);
                                  if (error) notificar('error', error);
                                }}
                                className="rounded-lg px-2 py-1 font-medium text-slate-600 transition hover:bg-slate-100"
                              >
                                PDF
                              </button>
                              {anulada ? (
                                <span className="rounded-md bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">ANULADA</span>
                              ) : (
                                <button
                                  onClick={() => setPorAnular(v)}
                                  className="rounded-lg px-2 py-1 font-medium text-red-600 transition hover:bg-red-50"
                                >
                                  Anular
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </aside>
            </section>

            {/* Turnos cerrados (subflujo "Consultar turnos") */}
            {verTurnos && (
              <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">Turnos cerrados</h2>
                {turnos.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay turnos cerrados registrados.</p>
                ) : (
                  <>
                    {/* Tabla en pantallas medianas+ */}
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-slate-400">
                            <th className="py-2 pr-4">Caja</th>
                            <th className="py-2 pr-4">Usuario</th>
                            <th className="py-2 pr-4">Apertura</th>
                            <th className="py-2 pr-4">Cierre</th>
                            <th className="py-2 pr-4 text-right">Esperado</th>
                            <th className="py-2 pr-4 text-right">Contado</th>
                            <th className="py-2 text-right">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {turnos.map((t) => (
                            <tr key={t.id} className="border-b border-gray-50 last:border-0">
                              <td className="py-3 pr-4 font-mono font-semibold text-slate-900">#{t.id}</td>
                              <td className="py-3 pr-4 text-slate-700">Usuario #{t.usuario_id}</td>
                              <td className="py-3 pr-4 text-slate-500">{fecha(t.fecha_apertura)}</td>
                              <td className="py-3 pr-4 text-slate-500">{fecha(t.fecha_cierre)}</td>
                              <td className="py-3 pr-4 text-right text-slate-700">{bs(t.monto_final_sistema ?? 0)}</td>
                              <td className="py-3 pr-4 text-right text-slate-700">{bs(t.monto_final_real ?? 0)}</td>
                              <td className="py-3 text-right">
                                <Diferencia valor={t.monto_diferencia ?? 0} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Tarjetas en móvil */}
                    <ul className="space-y-2 md:hidden">
                      {turnos.map((t) => (
                        <li key={t.id} className="rounded-xl border border-gray-100 p-3 text-sm">
                          <div className="flex justify-between">
                            <span className="font-mono font-semibold text-slate-900">Caja #{t.id}</span>
                            <Diferencia valor={t.monto_diferencia ?? 0} />
                          </div>
                          <p className="text-xs text-slate-500">
                            Usuario #{t.usuario_id} · {fecha(t.fecha_cierre)}
                          </p>
                          <p className="mt-1 text-xs text-slate-600">
                            Esperado {bs(t.monto_final_sistema ?? 0)} · Contado {bs(t.monto_final_real ?? 0)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* Subflujo: abono a orden de trabajo */}
      {modal === 'abono' && (
        <AbonoModal onClose={() => setModal(null)} notificar={notificar} onCompletado={cargar} />
      )}

      {/* Modal de apertura / arqueo y cierre */}
      {modal && modal !== 'abono' && (
        <ArqueoModal
          modo={modal}
          onClose={() => setModal(null)}
          notificar={notificar}
          onCompletado={() => {
            cargar();
            if (verTurnos) cargarTurnos();
          }}
        />
      )}

      {/* Confirmación de anulación */}
      {porAnular && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">¿Anular {porAnular.nro_comprobante}?</h3>
            <p className="mt-2 text-sm text-slate-500">
              Se marcará como anulada, se devolverá el stock al inventario con una entrada en el kárdex y se
              descontará {bs(porAnular.total)} del arqueo del turno.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => setPorAnular(null)}
                disabled={anulando}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarAnulacion}
                disabled={anulando}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {anulando && <Spinner />}
                Anular venta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notificación */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 left-4 right-4 z-[60] rounded-xl px-4 py-3 text-sm font-medium shadow-lg sm:left-auto sm:max-w-sm ${
            toast.tipo === 'ok' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${toast.tipo === 'ok' ? 'bg-[#8cd600]' : 'bg-white'}`} />
            <span className="flex-1">{toast.texto}</span>
            <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100" aria-label="Cerrar">
              ×
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes de presentación
// ---------------------------------------------------------------------------
function Kpi({ titulo, valor, detalle, acento }: { titulo: string; valor: string; detalle?: string; acento?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${acento ? 'border-[#8cd600]/40 bg-[#8cd600]/10' : 'border-gray-100 bg-white'}`}>
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{titulo}</p>
      <p className="mt-1 text-lg font-bold text-slate-900 sm:text-2xl">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-red-500">{detalle}</p>}
    </div>
  );
}

function Diferencia({ valor }: { valor: number }) {
  if (Math.abs(valor) < 0.005) {
    return <span className="rounded-md bg-[#8cd600]/15 px-2 py-0.5 text-xs font-semibold text-[#3f6b00]">Cuadrada</span>;
  }
  const sobrante = valor > 0;
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${sobrante ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
      {sobrante ? '+' : '−'}
      {bs(Math.abs(valor))}
    </span>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}
