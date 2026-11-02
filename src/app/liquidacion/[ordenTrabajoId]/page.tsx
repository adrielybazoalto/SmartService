// =====================================================================
//  CU13 - UI_Liquidacion (carga en el servidor)
//  Pasos 2 y 3: recupera materiales, horas y calcula el monto total.
//  Excepción: si la orden no está FINALIZADA muestra el mensaje del CU.
// =====================================================================

import Link from "next/link";
import { notFound } from "next/navigation";
import { crearLiquidacionController } from "@/backend/liquidacion";
import { LiquidacionForm } from "./liquidacion-form";

export const dynamic = "force-dynamic";

// Next.js 15+: params es una Promise.
type Props = {
  params: Promise<{ ordenTrabajoId: string }>;
  // Stripe vuelve con ?pago=exito&session_id=cs_test_... o ?pago=cancelado
  searchParams: Promise<{ pago?: string; session_id?: string }>;
};

export default async function LiquidacionPage({ params, searchParams }: Props) {
  const { ordenTrabajoId } = await params;
  const { pago, session_id } = await searchParams;
  const id = Number(ordenTrabajoId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const controller = crearLiquidacionController();

  try {
    // Si la orden ya tiene nota, se muestra la nota emitida (y su PDF).
    const emitida = await controller.consultarNotaEmitida(id);
    if (emitida) {
      return (
        <main className="mx-auto max-w-5xl p-6">
          <Link href="/liquidacion" className="text-sm text-blue-700 hover:underline">
            ← Volver a órdenes finalizadas
          </Link>
          <LiquidacionForm
            detalleInicial={emitida.detalle}
            notaInicial={emitida.nota}
            sessionIdRetorno={pago === "exito" && session_id ? session_id : null}
            pagoCancelado={pago === "cancelado"}
          />
        </main>
      );
    }

    const detalle = await controller.obtenerDetalleLiquidacion(id);
    return (
      <main className="mx-auto max-w-5xl p-6">
        <Link href="/liquidacion" className="text-sm text-blue-700 hover:underline">
          ← Volver a órdenes finalizadas
        </Link>
        <LiquidacionForm detalleInicial={detalle} />
      </main>
    );
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "No se pudo cargar la liquidación.";
    return (
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-red-700">{mensaje}</div>
        <Link href="/liquidacion" className="mt-4 inline-block text-sm text-blue-700 hover:underline">
          ← Volver a órdenes finalizadas
        </Link>
      </main>
    );
  }
}
