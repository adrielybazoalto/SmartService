"use client";

// =====================================================================
//  CU13 - UI_Liquidacion (interacción)
//  mostrarDetalleLiquidacion · ingresarAnticipo · mostrarSaldo ·
//  confirmarEmision · mostrarNotaPDF · mostrarMensajeError
//  cobrarSaldoConTarjeta · redirigirPago · retornarAlSistema · mostrarNotaPagada
// =====================================================================

import { useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent } from "react";
// Importante: el formulario (cliente) importa SOLO acciones y tipos,
// nunca el index del backend, para no mezclar código de servidor.
import {
  calcularLiquidacionAction,
  confirmarPagoSaldoAction,
  emitirNotaServicioAction,
  iniciarCobroSaldoAction,
  registrarPagoSaldoAction,
} from "@/app/actions/liquidacion";
import { PanelQr } from "@/components/pagos/panel-qr";
import { PanelTransferencia } from "@/components/pagos/panel-transferencia";
import type { DetalleLiquidacion, NotaServicio } from "@/backend/liquidacion/types";
import { descargarNotaServicioPDF } from "../_lib/pdf";
import { etiquetaMetodoPago, formatearBs, formatearFechaHora } from "../_lib/formato";
import { formatearFechaHora as formatearTimestamp } from "@/lib/fechas";
export function LiquidacionForm({
  detalleInicial,
  notaInicial = null,
  sessionIdRetorno = null,
  pagoCancelado = false,
}: {
  detalleInicial: DetalleLiquidacion;
  notaInicial?: NotaServicio | null;
  /** session_id que Stripe agrega a la URL al volver de un pago */
  sessionIdRetorno?: string | null;
  pagoCancelado?: boolean;
}) {
  const [detalle, setDetalle] = useState(detalleInicial);
  const [servicioId, setServicioId] = useState<number | null>(null);
  const [anticipoTexto, setAnticipoTexto] = useState(notaInicial ? String(notaInicial.anticipo_pagado) : "0");
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<NotaServicio | null>(notaInicial);
  const [pendiente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<string | null>(null);
  const [cobrando, setCobrando] = useState(false);
  // Cobro del saldo: EFECTIVO / QR / TRANSFERENCIA (confirma el Encargado) o TARJETA (Stripe)
  const [metodoPago, setMetodoPago] = useState<"EFECTIVO" | "QR" | "TRANSFERENCIA" | "TARJETA">("EFECTIVO");
  const [pagoConfirmado, setPagoConfirmado] = useState(false);
  const [referencia, setReferencia] = useState("");
  const confirmado = useRef(false);

  // retornarAlSistema(sessionId): al volver de Stripe se confirma el pago una sola vez
  useEffect(() => {
    if (pagoCancelado) setError("Pago cancelado: la nota sigue PENDIENTE.");
    if (sessionIdRetorno && !confirmado.current) {
      confirmado.current = true;
      setCobrando(true);
      confirmarPagoSaldoAction(sessionIdRetorno).then((r) => {
        setCobrando(false);
        if (r.ok) {
          setNota(r.data);
          setAviso(`Pago confirmado: la nota ${r.data.numero_nota} quedó PAGADA.`);
        } else setError(r.error);
      });
    }
    // quita ?pago=...&session_id=... de la barra de direcciones
    if (sessionIdRetorno || pagoCancelado) window.history.replaceState(null, "", window.location.pathname);
  }, [sessionIdRetorno, pagoCancelado]);

  // cobrarSaldoConTarjeta -> redirigirPago(url)
  // seleccionarMetodoPago -> registrarPagoSaldo (EFECTIVO, QR o TRANSFERENCIA)
  function registrarPagoSaldo() {
    if (!nota) return;
    if (metodoPago === "TARJETA") return cobrarSaldoConTarjeta();
    setError(null);
    if (metodoPago === "TRANSFERENCIA" && !referencia.trim()) {
      setError("Ingrese el número de referencia de la transferencia.");
      return;
    }
    if (!pagoConfirmado) {
      setError("Confirme que recibió el pago del saldo.");
      return;
    }
    setCobrando(true);
    registrarPagoSaldoAction(nota.id, metodoPago, metodoPago === "TRANSFERENCIA" ? referencia.trim() : null).then((r) => {
      setCobrando(false);
      if (r.ok) {
        setNota(r.data);
        setAviso(`Pago registrado: la nota ${r.data.numero_nota} quedó PAGADA (${etiquetaMetodoPago(r.data.metodo_pago)}).`);
      } else setError(r.error);
    });
  }

  function cobrarSaldoConTarjeta() {
    if (!nota) return;
    setError(null);
    setCobrando(true);
    iniciarCobroSaldoAction(nota.id).then((r) => {
      if (r.ok) window.location.assign(r.data.url);
      else {
        setCobrando(false);
        setError(r.error);
      }
    });
  }

  const { orden, materiales, calculo } = detalle;
  // Con cotización el anticipo viene de la base y se aplica hasta el total; sin ella es manual.
  const registrado = orden.anticipo_cotizacion;
  const anticipo = nota
    ? nota.anticipo_pagado
    : registrado
      ? Math.min(registrado.monto, calculo.total_liquidacion)
      : Number(anticipoTexto.replace(",", "."));
  const anticipoValido = Number.isFinite(anticipo) && anticipo >= 0 && anticipo <= calculo.total_liquidacion;
  const excedente = registrado ? Math.round((registrado.monto - calculo.total_liquidacion) * 100) / 100 : 0;
  const saldo = useMemo(
    () => (anticipoValido ? Math.round((calculo.total_liquidacion - anticipo) * 100) / 100 : null),
    [anticipo, anticipoValido, calculo.total_liquidacion],
  );
  const faltaServicio = detalle.requiereServicio && !servicioId;

  // Orden correctiva: al elegir el servicio se recalcula la mano de obra
  function cambiarServicio(valor: string) {
    const id = valor ? Number(valor) : null;
    setServicioId(id);
    setError(null);
    iniciar(async () => {
      const r = await calcularLiquidacionAction(orden.id, id);
      if (r.ok) setDetalle(r.data);
      else setError(r.error);
    });
  }

  function confirmarEmision() {
    setError(null);
    if (!anticipoValido) {
      setError("El anticipo debe ser mayor o igual a cero y no superar el monto total.");
      return;
    }
    if (faltaServicio) {
      setError("Seleccione el servicio para calcular la mano de obra.");
      return;
    }
    iniciar(async () => {
      const r = await emitirNotaServicioAction({ ordenTrabajoId: orden.id, anticipo, servicioId });
      if (!r.ok) {
        setError(r.error);
        return;
      }
            setNota(r.data);
      await descargarPDF(r.data);
    });
  }

  // UI_Liquidacion.mostrarNotaPDF
  async function descargarPDF(n: NotaServicio) {
    try {
      await descargarNotaServicioPDF(n, detalle);
    } catch (e) {
      console.error("[CU13] Error al generar el PDF", e);
      setError("La nota se emitió, pero no se pudo generar el PDF. Use el botón Descargar PDF.");
    }
  }

  return (
    <section className="mt-4 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Liquidación {orden.codigo_orden}</h1>
          <p className="text-sm text-gray-600">
            {orden.cliente_nombre ?? "Cliente no registrado"} · {orden.tipo_trabajo}
            {orden.numero_cotizacion ? ` · ${orden.numero_cotizacion}` :" · Sin cotización"}
          </p>
        </div>
        <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">{orden.estado}</span>
      </header>

      {/* Materiales consumidos (DetalleConsumoMaterial + Producto) */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-4 py-3 font-medium">Materiales consumidos en campo</h2>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-600">
            <tr>
              <th className="px-4 py-2">Producto</th>
              <th className="px-4 py-2 text-right">Cantidad</th>
              <th className="px-4 py-2 text-right">Precio unit.</th>
              <th className="px-4 py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {materiales.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-gray-500">Sin materiales registrados.</td>
              </tr>
            )}
            {materiales.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2">{m.producto_nombre}</td>
                <td className="px-4 py-2 text-right">{m.cantidad_utilizada}</td>
                <td className="px-4 py-2 text-right">{formatearBs(m.precio_venta)}</td>
                <td className="px-4 py-2 text-right">{formatearBs(m.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Mano de obra y anticipo */}
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-medium">Mano de obra</h2>

          {detalle.requiereServicio && (
            <label className="block text-sm">
              <span className="mb-1 block text-gray-700">Servicio aplicado (orden sin cotización)</span>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2"
                value={servicioId ?? ""}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => cambiarServicio(e.target.value)}
                disabled={pendiente || !!nota}
              >
                <option value="">Seleccione un servicio…</option>
                {detalle.servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre} — {formatearBs(s.precio_hora_base)}/h
                  </option>
                ))}
              </select>
            </label>
          )}

          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-gray-600">Horas trabajadas</dt>
            <dd className="text-right">{calculo.horas_trabajadas} h</dd>
            <dt className="text-gray-600">Tarifa por hora</dt>
            <dd className="text-right">{formatearBs(calculo.tarifa_hora)}</dd>
          </dl>

          {registrado ? (
            <div className="text-sm">
              <p className="mb-1 text-gray-700">Anticipo registrado en la cotización</p>
              <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                {registrado.monto > 0
                  ? `${formatearBs(registrado.monto)} · ${etiquetaMetodoPago(registrado.metodo)} · ${formatearTimestamp(registrado.fecha)}` +
                    (registrado.referencia ? ` · Ref. ${registrado.referencia}` : "")
                  : "Sin anticipo"}
              </p>
              {excedente > 0 && (
                <p role="status" className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
                  El anticipo supera el total liquidado en {formatearBs(excedente)}
                </p>
              )}
            </div>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block text-gray-700">Anticipo entregado por el cliente (Bs)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                className={`w-full rounded-md border px-3 py-2 ${anticipoValido ? "border-gray-300" : "border-red-400"}`}
                value={anticipoTexto}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setAnticipoTexto(e.target.value)}
                disabled={pendiente || !!nota}
              />
            </label>
          )}
        </div>

        {/* Totales */}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-medium">Resumen</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt>Costo de materiales</dt><dd>{formatearBs(calculo.costo_materiales)}</dd></div>
            <div className="flex justify-between"><dt>Costo de mano de obra</dt><dd>{formatearBs(calculo.costo_mano_obra)}</dd></div>
            <div className="flex justify-between border-t pt-2 font-semibold"><dt>Monto total</dt><dd>{formatearBs(calculo.total_liquidacion)}</dd></div>
            <div className="flex justify-between"><dt>Anticipo</dt><dd>- {formatearBs(anticipoValido ? anticipo : 0)}</dd></div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold text-blue-800">
              <dt>Saldo pendiente</dt><dd>{saldo === null ? "—" : formatearBs(saldo)}</dd>
            </div>
          </dl>

          {!nota && (
            <button
              type="button"
              onClick={confirmarEmision}
              disabled={pendiente || !anticipoValido || faltaServicio}
              className="mt-5 w-full rounded-md bg-blue-700 px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendiente ? "Procesando…" : "Emitir nota de servicio"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {aviso && (
        <div role="status" className="rounded-md border border-green-300 bg-green-100 p-3 text-sm font-medium text-green-900">{aviso}</div>
      )}

      {nota && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-medium">Nota de servicio {nota.numero_nota} emitida ({nota.estado}).</p>
          <p className="mt-1">
            Total {formatearBs(nota.monto_total)} · Anticipo {formatearBs(nota.anticipo_pagado)} ·{" "}
            {nota.estado.toUpperCase() === "PENDIENTE"
              ? `Saldo pendiente ${formatearBs(Math.round((nota.monto_total - nota.anticipo_pagado) * 100) / 100)}`
              : "Sin saldo pendiente"}
          </p>
          {nota.metodo_pago && (
            <p className="mt-1">
              Saldo pagado con {etiquetaMetodoPago(nota.metodo_pago)} el {formatearFechaHora(nota.fecha_pago ?? null)}
              {nota.referencia_pago ? ` · Referencia: ${nota.referencia_pago}` : ""}.
            </p>
          )}
          {nota.estado.toUpperCase() === "PENDIENTE" && nota.monto_total - nota.anticipo_pagado > 0 && (
            <div className="mt-4 space-y-3 rounded-md border border-gray-200 bg-white p-3 text-gray-800">
              <p className="font-medium">Cobrar saldo</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["EFECTIVO", "QR", "TRANSFERENCIA", "TARJETA"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMetodoPago(m);
                      setPagoConfirmado(false);
                      setError(null);
                    }}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                      metodoPago === m ? "border-blue-700 bg-blue-700 text-white" : "border-gray-300 hover:border-blue-400"
                    }`}
                  >
                    {etiquetaMetodoPago(m)}
                  </button>
                ))}
              </div>

              {metodoPago === "EFECTIVO" && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={pagoConfirmado} onChange={(e) => setPagoConfirmado(e.target.checked)} className="mt-0.5" />
                  <span>
                    Confirmo que recibí <strong>{formatearBs(Math.round((nota.monto_total - nota.anticipo_pagado) * 100) / 100)}</strong> en efectivo
                  </span>
                </label>
              )}
              {metodoPago === "QR" && (
                <PanelQr
                  total={Math.round((nota.monto_total - nota.anticipo_pagado) * 100) / 100}
                  confirmado={pagoConfirmado}
                  onConfirmar={setPagoConfirmado}
                />
              )}
              {metodoPago === "TRANSFERENCIA" && (
                <PanelTransferencia
                  total={Math.round((nota.monto_total - nota.anticipo_pagado) * 100) / 100}
                  referencia={referencia}
                  onReferencia={(v) => {
                    setReferencia(v);
                    if (!v.trim()) setPagoConfirmado(false);
                  }}
                  confirmado={pagoConfirmado}
                  onConfirmar={setPagoConfirmado}
                />
              )}
              {metodoPago === "TARJETA" && (
                <p className="text-sm text-gray-600">
                  Se abrirá la página de pago de Stripe (modo prueba). Tarjeta de prueba: 4242 4242 4242 4242.
                </p>
              )}

              <button
                type="button"
                onClick={registrarPagoSaldo}
                disabled={cobrando || (metodoPago !== "TARJETA" && !pagoConfirmado)}
                className="rounded-md bg-indigo-700 px-3 py-1.5 font-medium text-white hover:bg-indigo-800 disabled:opacity-50"
              >
                {cobrando
                  ? metodoPago === "TARJETA" ? "Conectando con la pasarela…" : "Registrando…"
                  : metodoPago === "TARJETA" ? "Cobrar con tarjeta (Stripe)" : "Registrar pago del saldo"}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => descargarPDF(nota)}
            className="mt-3 rounded-md border border-green-600 px-3 py-1.5 font-medium hover:bg-green-100"
          >
            Descargar PDF
          </button>
        </div>
      )}
    </section>
  );
}
