import type { SupabaseClient } from '@supabase/supabase-js'
import type { Db } from '@/lib/supabase/types'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { obtenerIpOrigen } from '@/lib/ip'
import { registrarEvento } from '@/backend/bitacora'
import { horasEntre } from '@/backend/asignaciones/disponibilidad'
import { motivosCuadrillaEnVentana } from '@/backend/asignaciones/service'
import { ahoraBolivia, formatearFechaHora, ventanaBolivia } from '@/lib/fechas'
import { ESTADO_CANCELADA, ESTADO_EN_PROGRESO, ESTADO_FINALIZADA, ESTADO_PROGRAMADA } from './estados'
import { procesarReporteCampoSchema, type ProcesarReporteCampoInput } from './schema'
import type { OrdenTrabajo } from './types'

const MSG_FALTA_MIGRACION = 'Falta aplicar la migración de órdenes de trabajo en la base de datos'

export interface VentanaHorariaInput {
  fecha_programada: string
  hora_inicio: string
  hora_fin: string
}

/**
 * ControlOrdenesTrabajo (CU12) — Gestionar Órdenes de Trabajo y Reporte de Campo
 * Implementa las reglas de negocio siguiendo los diagramas aprobados.
 */
export class ControlOrdenesTrabajo {
  /**
   * Convierte una cotización aprobada en una Orden de Trabajo, generando
   * un código correlativo único (ej. OT-2026-001) y asegurando su ventana programada.
   */
  static async convertirCotizacionAOrdenBD(
    db: Db,
    cotizacionId: number,
    usuarioId: number | undefined,
    ip: string | null | undefined,
    ventana: VentanaHorariaInput,
  ): Promise<OrdenTrabajo> {
    // Ventana obligatoria (CU11 requiere inicio y fin válidos), en hora de Bolivia
    if (!ventana?.fecha_programada || !ventana.hora_inicio || !ventana.hora_fin) {
      throw new Error('La ventana horaria es obligatoria para crear la orden de trabajo')
    }
    const { inicio, fin } = ventanaBolivia(ventana.fecha_programada, ventana.hora_inicio, ventana.hora_fin)

    return this.crearOrdenBD(db, { cotizacionId, tipoTrabajo: null, inicio, fin }, usuarioId, ip)
  }

  /** Orden correctiva, sin cotización (subflujo del CU12). */
  static async crearOrdenCorrectiva(
    db: Db,
    datos: VentanaHorariaInput & { tipo_trabajo: string },
    usuarioId: number,
    ip?: string | null,
  ): Promise<OrdenTrabajo> {
    if (!datos.tipo_trabajo?.trim()) throw new Error('El tipo de trabajo es obligatorio')
    const { inicio, fin } = ventanaBolivia(datos.fecha_programada, datos.hora_inicio, datos.hora_fin)
    return this.crearOrdenBD(db, { cotizacionId: null, tipoTrabajo: datos.tipo_trabajo.trim(), inicio, fin }, usuarioId, ip)
  }

  /** El correlativo y la bitácora se resuelven en una transacción (fn_crear_orden_trabajo). */
  private static async crearOrdenBD(
    db: Db,
    orden: { cotizacionId: number | null; tipoTrabajo: string | null; inicio: string; fin: string },
    usuarioId: number | undefined,
    ip?: string | null,
  ): Promise<OrdenTrabajo> {
    const { data, error } = await (db as unknown as SupabaseClient).rpc('fn_crear_orden_trabajo', {
      p_usuario_id: usuarioId,
      p_cotizacion_id: orden.cotizacionId,
      p_tipo_trabajo: orden.tipoTrabajo,
      p_inicio: orden.inicio,
      p_fin: orden.fin,
      p_ip: ip && ip.trim() ? ip.trim() : await obtenerIpOrigen(),
    })
    if (error) throw new Error(error.code === 'PGRST202' ? MSG_FALTA_MIGRACION : error.message)
    return data as OrdenTrabajo
  }

  /**
   * Cambia la ventana de una orden PROGRAMADA. Si ya tiene cuadrilla, vuelve a
   * validar la disponibilidad de cada técnico en la ventana nueva.
   */
  static async cambiarVentanaOrden(
    db: Db,
    ordenId: number,
    ventana: VentanaHorariaInput,
    usuarioId: number,
    ip?: string | null,
  ): Promise<OrdenTrabajo> {
    const { inicio, fin } = ventanaBolivia(ventana.fecha_programada, ventana.hora_inicio, ventana.hora_fin)

    const { data: orden, error: errOrd } = await db
      .from('orden_trabajo')
      .select('*')
      .eq('id', ordenId)
      .single()
    if (errOrd || !orden) throw new Error('No se encontró la orden de trabajo')
    if (orden.estado !== ESTADO_PROGRAMADA) {
      throw new Error('Solo se puede cambiar la ventana de una orden en estado Programada')
    }

    const conflictos = await motivosCuadrillaEnVentana(db, orden, inicio, fin)
    if (conflictos.length > 0) throw new Error(conflictos.join('\n'))

    const { data: actualizada, error } = await db
      .from('orden_trabajo')
      .update({ fecha_inicio_programada: inicio, fecha_fin_programada: fin })
      .eq('id', ordenId)
      .eq('estado', ESTADO_PROGRAMADA)
      .select()
      .maybeSingle()
    if (error) throw new Error(`No se pudo actualizar la ventana: ${error.message}`)
    if (!actualizada) throw new Error('Solo se puede cambiar la ventana de una orden en estado Programada')

    try {
      await registrarEvento(db, {
        usuario_id: usuarioId,
        accion: 'MODIFICAR_VENTANA_ORDEN',
        descripcion: `Se cambió la ventana de la Orden de Trabajo ${orden.codigo_orden}: ${formatearFechaHora(orden.fecha_inicio_programada)} a ${formatearFechaHora(orden.fecha_fin_programada)} → ${formatearFechaHora(inicio)} a ${formatearFechaHora(fin)}`,
      }, ip && ip.trim() ? ip.trim() : await obtenerIpOrigen())
    } catch (e) {
      console.warn('[CU12] Error al auditar cambio de ventana:', e)
    }

    return actualizada
  }

  /**
   * Valida que si el usuario que ejecuta la acción es un técnico,
   * esté formalmente asignado a la orden en orden_trabajo_tecnico (excepción CU12).
   */
  static async validarTecnicoAsignado(
    db: Db,
    ordenId: number,
    usuarioId: number,
  ): Promise<void> {
    const { data: usuario } = await (db as any)
      .from('usuario')
      .select('id, rol:rol_id(nombre)')
      .eq('id', usuarioId)
      .maybeSingle()

    const rolNombre = (usuario?.rol as any)?.nombre?.toUpperCase() || ''
    if (rolNombre.includes('TECNICO')) {
      const { data: asignacion } = await db
        .from('orden_trabajo_tecnico')
        .select('id')
        .eq('orden_trabajo_id', ordenId)
        .eq('usuario_id', usuarioId)
        .maybeSingle()

      if (!asignacion) {
        throw new Error('Acceso denegado: el técnico no está asignado a esta orden de trabajo')
      }
    }
  }

  /**
   * Cancela una orden. Solo en PROGRAMADA: el filtro por estado en el UPDATE evita
   * cancelar una orden que un técnico acaba de iniciar.
   */
  static async cancelarOrden(
    db: Db,
    ordenId: number,
    usuarioId: number,
    ip?: string | null,
  ): Promise<OrdenTrabajo> {
    const { data: orden, error } = await db
      .from('orden_trabajo')
      .update({ estado: ESTADO_CANCELADA })
      .eq('id', ordenId)
      .eq('estado', ESTADO_PROGRAMADA)
      .select()
      .maybeSingle()

    if (error) throw new Error(`No se pudo cancelar la orden: ${error.message}`)
    if (!orden) throw new Error('Solo se pueden cancelar órdenes en estado Programada')

    try {
      await registrarEvento(db, {
        usuario_id: usuarioId,
        accion: 'CANCELAR_ORDEN_TRABAJO',
        descripcion: `Se canceló la Orden de Trabajo ${orden.codigo_orden}`,
      }, ip && ip.trim() ? ip.trim() : await obtenerIpOrigen())
    } catch (e) {
      console.warn('[CU12] Error al auditar cancelación de OT:', e)
    }

    return orden
  }

  /**
   * Captura la marca de tiempo de inicio de la orden
   */
  static async registrarMarcaTiempoInicio(
    db: Db,
    ordenId: number,
    usuarioId?: number,
    ip?: string | null,
  ): Promise<OrdenTrabajo> {
    if (usuarioId) {
      await this.validarTecnicoAsignado(db, ordenId, usuarioId)
    }

    const { data: orden, error: errOrd } = await db
      .from('orden_trabajo')
      .select('*')
      .eq('id', ordenId)
      .single()

    if (errOrd || !orden) {
      throw new Error(`No se encontró la orden de trabajo: ${errOrd?.message}`)
    }

    if (orden.estado !== ESTADO_PROGRAMADA) {
      throw new Error('Solo se puede iniciar una orden en estado Programada')
    }

    if (orden.fecha_inicio_real) {
      throw new Error('La orden ya tiene marca de tiempo de inicio registrada')
    }

    const { data: updated, error: errUpd } = await db
      .from('orden_trabajo')
      .update({
        fecha_inicio_real: ahoraBolivia(),
        estado: ESTADO_EN_PROGRESO,
      })
      .eq('id', ordenId)
      .eq('estado', ESTADO_PROGRAMADA)
      .select()
      .single()

    if (errUpd || !updated) {
      throw new Error(`No se pudo registrar inicio de la orden: ${errUpd?.message}`)
    }

    if (usuarioId) {
      try {
        const ipOrigen = ip && ip.trim() ? ip.trim() : await obtenerIpOrigen()
        await registrarEvento(db, {
          usuario_id: usuarioId,
          accion: 'INICIO_ORDEN_TRABAJO',
          descripcion: `Inicio de labores en la Orden de Trabajo ${orden.codigo_orden}`,
        }, ipOrigen)
      } catch (e) {
        console.warn('[CU12] Error al auditar inicio de OT:', e)
      }
    }

    return updated
  }

  /**
   * Captura la marca de tiempo de fin y calcula las horas técnicas efectivas
   */
  static async registrarMarcaTiempoFin(
    db: Db,
    ordenId: number,
    usuarioId?: number,
    ip?: string | null,
  ): Promise<OrdenTrabajo> {
    if (usuarioId) {
      await this.validarTecnicoAsignado(db, ordenId, usuarioId)
    }

    const { data: orden, error: errOrd } = await db
      .from('orden_trabajo')
      .select('*')
      .eq('id', ordenId)
      .single()

    if (errOrd || !orden) {
      throw new Error(`No se encontró la orden de trabajo: ${errOrd?.message}`)
    }

    if (!orden.fecha_inicio_real) {
      throw new Error('Debe registrar primero la marca de tiempo de inicio')
    }

    if (orden.fecha_fin_real) {
      throw new Error('La orden ya tiene marca de tiempo de fin registrada')
    }

    const fechaFin = ahoraBolivia()
    const horasTecnicas = Math.max(0, horasEntre(orden.fecha_inicio_real, fechaFin) ?? 0)

    const { data: updated, error: errUpd } = await db
      .from('orden_trabajo')
      .update({ fecha_fin_real: fechaFin })
      .eq('id', ordenId)
      .select()
      .single()

    if (errUpd || !updated) {
      throw new Error(`No se pudo registrar fin de la orden: ${errUpd?.message}`)
    }

    if (usuarioId) {
      try {
        const ipOrigen = ip && ip.trim() ? ip.trim() : await obtenerIpOrigen()
        await registrarEvento(db, {
          usuario_id: usuarioId,
          accion: 'FIN_ORDEN_TRABAJO',
          descripcion: `Fin de labores en la Orden de Trabajo ${orden.codigo_orden}. Horas técnicas: ${horasTecnicas.toFixed(2)}h`,
        }, ipOrigen)
      } catch (e) {
        console.warn('[CU12] Error al auditar fin de OT:', e)
      }
    }

    return updated
  }

  /**
   * Procesar reporte de campo de forma atómica y estandarizar a FINALIZADA
   */
  static async procesarReporteCampo(
    db: Db,
    input: ProcesarReporteCampoInput,
    usuarioId: number,
    ip?: string | null,
  ): Promise<{ orden: OrdenTrabajo; consumos: any[] }> {
    const parsed = procesarReporteCampoSchema.parse(input)
    const { ordenId, diagnostico, materiales = [] } = parsed

    // 1. Validar que el técnico esté asignado
    if (usuarioId) {
      await this.validarTecnicoAsignado(db, ordenId, usuarioId)
    }

    // 2. Obtener orden
    const { data: orden, error: errOrd } = await db
      .from('orden_trabajo')
      .select('*')
      .eq('id', ordenId)
      .single()

    if (errOrd || !orden) {
      throw new Error(`No se encontró la orden de trabajo: ${errOrd?.message}`)
    }

    if (orden.estado === ESTADO_FINALIZADA) {
      throw new Error('La orden ya se encuentra finalizada')
    }

    if (orden.estado !== ESTADO_EN_PROGRESO) {
      throw new Error('Debe iniciar la labor antes de reportar')
    }

    const ipOrigen = ip && ip.trim() ? ip.trim() : await obtenerIpOrigen()

    // 3. Ejecución atómica en PostgreSQL: si falla, se revierte todo y se muestra el error
    const { data: rpcRes, error: rpcErr } = await (db as unknown as SupabaseClient).rpc('fn_procesar_reporte_campo', {
      p_orden_id: ordenId,
      p_diagnostico: diagnostico,
      p_materiales: materiales,
      p_usuario_id: usuarioId,
      p_ip: ipOrigen,
    })

    if (rpcErr) throw new Error(rpcErr.message)
    return { orden: rpcRes.orden, consumos: rpcRes.consumos || [] }
  }
}

// Alias para compatibilidad
export const OrdenesTrabajoControl = ControlOrdenesTrabajo
export default ControlOrdenesTrabajo
