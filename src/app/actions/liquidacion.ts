'use server'

// =====================================================================
//  CU13 - Emitir Notas de Servicio y Liquidación Operativa
//  Server Actions (entrada al backend desde IU_Liquidacion).
//  Misma convención que app/actions/ordenes-trabajo.ts (CU12):
//  validan los datos, obtienen la IP y llaman al control.
// =====================================================================

import { mensajeDeError } from '@/backend/liquidacion/errores'
import { crearLiquidacionController } from '@/backend/liquidacion/fabrica'
import { obtenerIpCliente, obtenerUrlBase } from '@/backend/liquidacion/integracion'
import { validarEmitirNotaInput } from '@/backend/liquidacion/schema'
import type { DetalleLiquidacion, NotaServicio, ResultadoAccion } from '@/backend/liquidacion/types'

/** Recalcula la liquidación (al elegir el servicio en una orden correctiva). */
export async function calcularLiquidacionAction(
  ordenTrabajoId: number,
  servicioId?: number | null,
): Promise<ResultadoAccion<DetalleLiquidacion>> {
  try {
    const controller = crearLiquidacionController()
    return { ok: true, data: await controller.obtenerDetalleLiquidacion(ordenTrabajoId, servicioId) }
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) }
  }
}

/** LiquidacionController.emitirNotaServicio */
export async function emitirNotaServicioAction(datos: unknown): Promise<ResultadoAccion<NotaServicio>> {
  try {
    const input = validarEmitirNotaInput(datos)
    const controller = crearLiquidacionController()
    const nota = await controller.emitirNotaServicio(input, await obtenerIpCliente())
    // Sin revalidatePath: refrescaría esta misma página y ocultaría la nota recién
    // emitida. /liquidacion es force-dynamic y se recarga sola al volver.
    return { ok: true, data: nota }
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) }
  }
}

/** Cobrar saldo con tarjeta: devuelve el enlace de la página de pago de Stripe. */
export async function iniciarCobroSaldoAction(notaId: number): Promise<ResultadoAccion<{ url: string }>> {
  try {
    if (!Number.isInteger(notaId) || notaId <= 0) throw new Error('La nota de servicio no es válida.')
    const controller = crearLiquidacionController()
    return { ok: true, data: await controller.iniciarCobroSaldo(notaId, await obtenerUrlBase()) }
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) }
  }
}

/** Al volver de Stripe: verifica el pago y deja la nota PAGADA. */
export async function confirmarPagoSaldoAction(sessionId: string): Promise<ResultadoAccion<NotaServicio>> {
  try {
    const controller = crearLiquidacionController()
    return { ok: true, data: await controller.confirmarPagoSaldo(String(sessionId), await obtenerIpCliente()) }
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) }
  }
}
