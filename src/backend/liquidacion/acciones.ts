"use server";

// =====================================================================
//  CU13 - Server Actions (entrada al backend desde UI_Liquidacion)
//  Capa delgada: valida los datos (schema), obtiene la IP, llama al
//  control y devuelve { ok, data } o { ok: false, error }.
//  Un archivo "use server" solo puede exportar funciones async.
// =====================================================================

import { revalidatePath } from "next/cache";
import { mensajeDeError } from "./errores";
import { crearLiquidacionController, RUTA_LIQUIDACION } from "./fabrica";
import { obtenerIpCliente } from "./integracion";
import { validarEmitirNotaInput } from "./schema";
import type { DetalleLiquidacion, NotaServicio, ResultadoAccion } from "./types";

/** Recalcula la liquidación (al elegir el servicio en una orden correctiva). */
export async function calcularLiquidacionAction(
  ordenTrabajoId: number,
  servicioId?: number | null,
): Promise<ResultadoAccion<DetalleLiquidacion>> {
  try {
    const controller = await crearLiquidacionController();
    return { ok: true, data: await controller.obtenerDetalleLiquidacion(ordenTrabajoId, servicioId) };
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) };
  }
}

/** LiquidacionController.emitirNotaServicio */
export async function emitirNotaServicioAction(datos: unknown): Promise<ResultadoAccion<NotaServicio>> {
  try {
    const input = validarEmitirNotaInput(datos);
    const controller = await crearLiquidacionController();
    // La IP la obtiene el servidor con @/lib/ip (regla del CU06)
    const nota = await controller.emitirNotaServicio(input, await obtenerIpCliente());
    revalidatePath(RUTA_LIQUIDACION);
    return { ok: true, data: nota };
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) };
  }
}
