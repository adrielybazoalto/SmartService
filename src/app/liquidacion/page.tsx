// =====================================================================
//  CU13 - UI_OrdenesFinalizadas
//  Paso 1 del flujo principal: el Encargado ve las órdenes FINALIZADAS
//  sin nota de servicio y selecciona una para liquidar.
// =====================================================================

import Link from "next/link";
import { crearLiquidacionController, type NotaPendientePago, type OrdenPendienteLiquidar } from "@/backend/liquidacion";
import { formatearFechaHora } from "@/lib/fechas";
import { formatearBs, formatearFecha } from "./_lib/formato";

export const dynamic = "force-dynamic";

export default async function OrdenesFinalizadasPage() {
  let ordenes: OrdenPendienteLiquidar[] = [];
  let notas: NotaPendientePago[] = [];
  let error: string | null = null;
  let errorNotas: string | null = null;

  const controller = crearLiquidacionController();
  try {
    ordenes = await controller.listarOrdenesFinalizadas();
  } catch (e) {
    error = e instanceof Error ? e.message : "No se pudieron cargar las órdenes.";
  }
  try {
    notas = await controller.listarNotasPendientesPago();
  } catch (e) {
    errorNotas = e instanceof Error ? e.message : "No se pudieron cargar las notas pendientes.";
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Liquidación de órdenes de trabajo</h1>
        <p className="text-sm text-gray-600">
          Órdenes finalizadas que todavía no tienen nota de servicio.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {!error && ordenes.length === 0 && (
        <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-gray-600">
          No hay órdenes finalizadas pendientes de liquidar.
        </div>
      )}

      {ordenes.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-600">
              <tr>
                <th className="px-4 py-3">Orden</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Cotización</th>
                <th className="px-4 py-3">Fin real</th>
                <th className="px-4 py-3 text-right">Horas</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ordenes.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{o.codigo_orden}</td>
                  <td className="px-4 py-3">{o.cliente_nombre ?? "—"}</td>
                  <td className="px-4 py-3">{o.tipo_trabajo}</td>
                  <td className="px-4 py-3">{o.numero_cotizacion ??"Sin cotización"}</td>
                  <td className="px-4 py-3">{formatearFechaHora(o.fecha_fin_real)}</td>
                  <td className="px-4 py-3 text-right">{o.horas_trabajadas}</td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/liquidacion/${o.id}`}
                      className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800"
                    >
                      Liquidar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notas emitidas con saldo por cobrar (cobro con tarjeta - Stripe) */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-gray-900">Notas de servicio pendientes de pago</h2>
        <p className="mb-3 text-sm text-gray-600">El saldo se puede cobrar con tarjeta desde el detalle de la nota.</p>
        {errorNotas && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorNotas}</div>
        )}
        {!errorNotas && notas.length === 0 && (
          <div className="rounded-md border border-gray-200 bg-white p-6 text-center text-gray-600">No hay notas con saldo pendiente.</div>
        )}
        {notas.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-600">
                <tr>
                  <th className="px-4 py-3">Nota</th>
                  <th className="px-4 py-3">Orden</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Emisión</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Saldo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {notas.map((n) => (
                  <tr key={n.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{n.numero_nota}</td>
                    <td className="px-4 py-3">{n.codigo_orden}</td>
                    <td className="px-4 py-3">{n.cliente_nombre ?? "—"}</td>
                    <td className="px-4 py-3">{formatearFecha(n.fecha_emision)}</td>
                    <td className="px-4 py-3 text-right">{formatearBs(n.monto_total)}</td>
                    <td className="px-4 py-3 text-right font-medium">{formatearBs(n.saldo)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/liquidacion/${n.orden_trabajo_id}`}
                        className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-800"
                      >
                        Cobrar
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
