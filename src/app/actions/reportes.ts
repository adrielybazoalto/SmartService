'use server'

// =====================================================================
//  CU20 - Server Actions (frontera entre ReportesForm y ServicioReportes)
// =====================================================================

import { crearReportes } from '@/backend/reportes/fabrica'
import { mensajeDeError } from '@/backend/reportes/errores'
import { obtenerIpCliente } from '@/backend/reportes/integracion'
import type { OpcionesFiltro, ReporteGenerado, Respuesta } from '@/backend/reportes/types'

/** ServicioReportes.obtenerFiltros (técnicos activos y categorías). */
export async function cargarFiltros(): Promise<Respuesta<OpcionesFiltro>> {
  try {
    return { ok: true, data: await crearReportes().obtenerFiltros() }
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) }
  }
}

/** ServicioReportes.generarReporte (tipo, desde, hasta, técnico, categoría). */
export async function generarReporte(filtros: unknown): Promise<Respuesta<ReporteGenerado>> {
  try {
    const reporte = await crearReportes().generarReporte(filtros, await obtenerIpCliente())
    return { ok: true, data: reporte }
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) }
  }
}

/** ServicioReportes.registrarDescarga (formato PDF o EXCEL). */
export async function registrarDescarga(
  filtros: unknown,
  formato: unknown,
): Promise<Respuesta<null>> {
  try {
    await crearReportes().registrarDescarga(filtros, formato, await obtenerIpCliente())
    return { ok: true, data: null }
  } catch (error) {
    return { ok: false, error: mensajeDeError(error) }
  }
}
