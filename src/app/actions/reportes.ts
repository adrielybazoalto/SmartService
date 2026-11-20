'use server'

// =====================================================================
//  CU20 - Server Actions (frontera entre ReportesForm y ReporteController)
// =====================================================================

import { crearReporteController } from '@/backend/reportes/fabrica'
import { mensajeDeError } from '@/backend/reportes/errores'
import { obtenerIpCliente } from '@/backend/reportes/integracion'
import type { OpcionesFiltro, ReporteGenerado, ResultadoAccion } from '@/backend/reportes/types'

/** ReporteController.listarOpcionesFiltro (técnicos activos y categorías). */
export async function listarOpcionesFiltroAction(): Promise<ResultadoAccion<OpcionesFiltro>> {
  try {
    return { ok: true, data: await crearReporteController().listarOpcionesFiltro() }
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) }
  }
}

/** ReporteController.generarReporte (tipo, desde, hasta, técnico, categoría). */
export async function generarReporteAction(filtros: unknown): Promise<ResultadoAccion<ReporteGenerado>> {
  try {
    const reporte = await crearReporteController().generarReporte(filtros, await obtenerIpCliente())
    return { ok: true, data: reporte }
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) }
  }
}

/** ReporteController.registrarExportacion (formato PDF o EXCEL). */
export async function registrarExportacionAction(
  filtros: unknown,
  formato: unknown,
): Promise<ResultadoAccion<null>> {
  try {
    await crearReporteController().registrarExportacion(filtros, formato, await obtenerIpCliente())
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) }
  }
}
