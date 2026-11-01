'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/auth'
import { obtenerIpOrigen } from '@/lib/ip'
import { ControlOrdenesTrabajo, type VentanaHorariaInput } from '@/backend/ordenes/control-ordenes-trabajo'
import { horasEntre } from '@/backend/asignaciones/disponibilidad'
import type { OrdenTrabajo } from '@/backend/ordenes/types'
import { ventanaBolivia } from '@/lib/fechas'
import { tienePermisoModulo } from '@/lib/permisos'
import type { Db } from '@/lib/supabase/types'

type RespuestaAccion<T> = { ok: true; data: T; mensaje: string } | { ok: false; error: string }

function exito<T>(data: T, mensaje: string) {
  return { ok: true as const, data, mensaje }
}

function falla(e: unknown, porDefecto: string) {
  console.error('[CU12]', e)
  return { ok: false as const, error: e instanceof Error ? e.message : porDefecto }
}

async function contexto() {
  const u = (await getCurrentUser()) as any
  const id = Number(u?.id ?? u?.uid)
  if (!u || !Number.isInteger(id) || id <= 0) throw new Error('Sesión expirada. Vuelva a iniciar sesión.')
  await exigirModulo('/ordenes-trabajo')
  return {
    db: getSupabaseServiceClient() as unknown as Db,
    usuarioId: id,
    ip: await obtenerIpOrigen(),
  }
}

async function exigirModulo(ruta: string) {
  if (!(await tienePermisoModulo(ruta))) {
    throw new Error('No autorizado: tu rol no tiene el permiso de este módulo.')
  }
}

/**
 * Obtener órdenes de trabajo asignadas al técnico logueado
 */
export async function obtenerOrdenesTecnicoAccion(): Promise<RespuestaAccion<any[]>> {
  try {
    const { db, usuarioId } = await contexto()
    const { data, error } = await db
      .from('orden_trabajo_tecnico')
      .select('*, orden_trabajo(*, cotizacion(*, cliente(*)))')
      .eq('usuario_id', usuarioId)
    if (error) throw new Error(error.message)
    const ordenes = (data || []).map((d: any) => d.orden_trabajo).filter(Boolean)
    return exito(ordenes, `${ordenes.length} orden(es) de trabajo`)
  } catch (e) {
    return falla(e, 'Error al obtener órdenes de trabajo')
  }
}

/**
 * Obtener todas las órdenes de trabajo
 */
export async function obtenerOrdenesTrabajoAccion(): Promise<RespuestaAccion<any[]>> {
  try {
    const { db } = await contexto()
    const { data, error } = await db
      .from('orden_trabajo')
      .select('*, cotizacion(*, cliente(*)), orden_trabajo_tecnico(*, usuario(nombre)), nota_servicio(id)')
      .order('id', { ascending: false })
    if (error) throw new Error(error.message)
    return exito(data || [], `${(data || []).length} orden(es) de trabajo`)
  } catch (e) {
    return falla(e, 'Error al obtener órdenes de trabajo')
  }
}

/**
 * Obtener detalle de una orden de trabajo (un técnico solo ve las suyas)
 */
export async function obtenerOrdenTrabajoDetalleAccion(id: number): Promise<RespuestaAccion<any>> {
  try {
    const { db, usuarioId } = await contexto()
    await ControlOrdenesTrabajo.validarTecnicoAsignado(db, id, usuarioId)
    const { data, error } = await db
      .from('orden_trabajo')
      .select(
        '*, cotizacion(*, cliente(*)), orden_trabajo_tecnico(usuario_id, es_lider, usuario(nombre)), detalle_consumo_material(*, producto(nombre, unidad_medida)), nota_servicio(id, numero_nota, estado, monto_total)',
      )
      .eq('id', id)
      .single()
    if (error) throw new Error(error.message)
    return exito({ ...data, horas_trabajadas: horasEntre(data.fecha_inicio_real, data.fecha_fin_real) }, 'Orden cargada')
  } catch (e) {
    return falla(e, 'Error al obtener detalle de orden')
  }
}

/**
 * Cancelar una orden PROGRAMADA. Además del módulo de órdenes (el técnico también lo
 * tiene) exige el de asignación: cancela quien programa, no quien ejecuta.
 */
export async function cancelarOrdenAccion(ordenId: number): Promise<RespuestaAccion<OrdenTrabajo>> {
  try {
    const { db, usuarioId, ip } = await contexto()
    await exigirModulo('/asignar-tecnicos')
    const orden = await ControlOrdenesTrabajo.cancelarOrden(db, ordenId, usuarioId, ip)
    revalidatePath('/ordenes-trabajo')
    revalidatePath('/asignar-tecnicos')
    return exito(orden, `Orden ${orden.codigo_orden} cancelada`)
  } catch (e) {
    return falla(e, 'Error al cancelar la orden')
  }
}

/**
 * Convertir cotización aprobada a orden de trabajo con ventana horaria
 */
export async function convertirCotizacionAOrdenAccion(
  cotizacionId: number,
  datosVentana: VentanaHorariaInput,
): Promise<RespuestaAccion<any>> {
  try {
    const { db, usuarioId, ip } = await contexto()
    const orden = await ControlOrdenesTrabajo.convertirCotizacionAOrdenBD(
      db,
      cotizacionId,
      usuarioId,
      ip,
      datosVentana,
    )
    revalidatePath('/ordenes-trabajo')
    revalidatePath('/cotizaciones')
    revalidatePath('/asignar-tecnicos')
    return exito(orden, `Orden de trabajo ${orden.codigo_orden} creada exitosamente con ventana programada`)
  } catch (e) {
    return falla(e, 'Error al convertir cotización a orden')
  }
}

/**
 * Actualizar ventana horaria programada de una orden de trabajo
 */
export async function actualizarVentanaOrdenAccion(
  ordenId: number,
  fechaProgramada: string,
  horaInicio: string,
  horaFin: string,
): Promise<RespuestaAccion<any>> {
  try {
    const { db } = await contexto()
    const { inicio, fin } = ventanaBolivia(fechaProgramada, horaInicio, horaFin)
    const { data, error } = await db
      .from('orden_trabajo')
      .update({
        fecha_inicio_programada: inicio,
        fecha_fin_programada: fin,
      })
      .eq('id', ordenId)
      .select()
      .single()
    if (error) throw new Error(error.message)
    revalidatePath('/ordenes-trabajo')
    revalidatePath('/asignar-tecnicos')
    return exito(data, 'Ventana horaria programada actualizada')
  } catch (e) {
    return falla(e, 'Error al actualizar ventana horaria')
  }
}

/**
 * Registrar marca de tiempo de inicio
 */
export async function registrarInicioOrdenAccion(ordenId: number): Promise<RespuestaAccion<any>> {
  try {
    const { db, usuarioId, ip } = await contexto()
    const orden = await ControlOrdenesTrabajo.registrarMarcaTiempoInicio(db, ordenId, usuarioId, ip)
    revalidatePath('/ordenes-trabajo')
    return exito(orden, 'Inicio de labores registrado')
  } catch (e) {
    return falla(e, 'Error al registrar inicio')
  }
}

/**
 * Registrar marca de tiempo de fin
 */
export async function registrarFinOrdenAccion(ordenId: number): Promise<RespuestaAccion<any>> {
  try {
    const { db, usuarioId, ip } = await contexto()
    const orden = await ControlOrdenesTrabajo.registrarMarcaTiempoFin(db, ordenId, usuarioId, ip)
    revalidatePath('/ordenes-trabajo')
    return exito(orden, 'Fin de labores registrado')
  } catch (e) {
    return falla(e, 'Error al registrar fin')
  }
}

/**
 * Procesar reporte de campo (orquestador atómico)
 */
export async function procesarReporteCampoAccion(input: {
  ordenId: number
  diagnostico: string
  materiales?: Array<{ producto_id: number; cantidad_utilizada: number; observacion?: string | null }>
}): Promise<RespuestaAccion<any>> {
  try {
    const { db, usuarioId, ip } = await contexto()
    const resultado = await ControlOrdenesTrabajo.procesarReporteCampo(db, { ...input, materiales: input.materiales || [] }, usuarioId, ip)
    revalidatePath('/ordenes-trabajo')
    revalidatePath('/inventario')
    return exito(resultado, 'Reporte de campo procesado y orden finalizada')
  } catch (e) {
    return falla(e, 'Error al procesar reporte de campo')
  }
}

/**
 * Listar productos disponibles para consumo en OT
 */
export async function listarProductosParaConsumoAccion(): Promise<RespuestaAccion<any[]>> {
  try {
    const { db } = await contexto()
    const { data, error } = await (db as any)
      .from('producto')
      .select('id, codigo, nombre, unidad_medida, stock_disponible')
      .eq('estado', true)
    if (error) throw new Error(error.message)
    const sorted = (data || []).sort((a: any, b: any) => (a.nombre || '').localeCompare(b.nombre || ''))
    return exito(sorted, `${sorted.length} producto(s)`)
  } catch (e) {
    return falla(e, 'Error al listar productos')
  }
}
