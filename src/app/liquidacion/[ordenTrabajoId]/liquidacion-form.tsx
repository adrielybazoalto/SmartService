"use client";

// =====================================================================
//  CU13 - UI_Liquidacion (interacción)
//  mostrarDetalleLiquidacion · ingresarAnticipo · mostrarSaldo ·
//  confirmarEmision · mostrarNotaPDF · mostrarMensajeError
// =====================================================================

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
// Importante: el formulario (cliente) importa SOLO acciones y tipos,
// nunca el index del backend, para no mezclar código de servidor.
import {
  calcularLiquidacionAction,
  emitirNotaServicioAction,
} from "@/backend/liquidacion/acciones";
import type { DetalleLiquidacion, NotaServicio } from "@/backend/liquidacion/types";
import { descargarNotaServicioPDF } from "../_lib/pdf";
import { formatearBs } from "../_lib/formato";

export function LiquidacionForm({ detalleInicial }: { detalleInicial: DetalleLiquidacion }) {
  const [detalle, setDetalle] = useState(detalleInicial);
  const [servicioId, setServicioId] = useState<number | null>(null);
  const [anticipoTexto, setAnticipoTexto] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [nota, setNota] = useState<NotaServicio | null>(null);
  const [pendiente, iniciar] = useTransition();

  const { orden, materiales, calculo } = detalle;
  const anticipo = Number(anticipoTexto.replace(",", "."));
  const anticipoValido = Number.isFinite(anticipo) && anticipo >= 0 && anticipo <= calculo.total_liquidacion;
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
      await descargarNotaServicioPDF(r.data, detalle);
    });
  }

  return (
    <section className="mt-4 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Liquidación {orden.codigo_orden}</h1>
          <p className="text-sm text-gray-600">
            {orden.cliente_nombre ?? "Cliente no registrado"} · {orden.tipo_trabajo}
            {orden.numero_cotizacion ? ` · ${orden.numero_cotizacion}` : " · Correctivo"}
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

      {nota && (
        <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-medium">Nota de servicio {nota.numero_nota} emitida ({nota.estado}).</p>
          <button
            type="button"
            onClick={() => descargarNotaServicioPDF(nota, detalle)}
            className="mt-3 rounded-md border border-green-600 px-3 py-1.5 font-medium hover:bg-green-100"
          >
            Descargar PDF otra vez
          </button>
        </div>
      )}
    </section>
  );
}
