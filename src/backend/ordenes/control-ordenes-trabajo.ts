import type { SupabaseClient } from '@supabase/supabase-js'
import type { Db } from '@/lib/supabase/types'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { obtenerIpOrigen } from '@/lib/ip'
import { registrarEvento } from '@/backend/bitacora'
import { aMs } from '@/backend/asignaciones/disponibilidad'
import { ahoraBolivia, ventanaBolivia } from '@/lib/fechas'
import { procesarReporteCampoSchema, type ProcesarReporteCampoInput } from './schema'
import type { OrdenTrabajo } from './types'

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

    // Obtener la cotización
    const { data: cotizacion, error: errCot } = await db
      .from('cotizacion')
      .select('*')
      .eq('id', cotizacionId)
      .single()

    if (errCot || !cotizacion) {
      throw new Error(`No se encontró la cotización: ${errCot?.message || 'desconocido'}`)
    }

    if (cotizacion.estado !== 'APROBADA') {
      throw new Error('Solo se pueden convertir cotizaciones en estado APROBADA')
    }

    // Verificar si ya existe una OT para esta cotización
    const { data: otExistente } = await db
      .from('orden_trabajo')
      .select('id, codigo_orden')
      .eq('cotizacion_id', cotizacionId)
      .maybeSingle()

    if (otExistente) {
      throw new Error(`Ya existe una Orden de Trabajo para esta cotización: ${otExistente.codigo_orden}`)
    }

    // Generar código correlativo único OT-YYYY-XXX
    const anio = ahoraBolivia().slice(0, 4)
    const prefijo = `OT-${anio}-`

    const { data: otsAnio } = await db
      .from('orden_trabajo')
      .select('codigo_orden')
      .like('codigo_orden', `${prefijo}%`)

    let maxSec = 0
    if (otsAnio && otsAnio.length > 0) {
      for (const ot of otsAnio) {
        if (ot.codigo_orden) {
          const match = ot.codigo_orden.match(/OT-\d{4}-(\d+)/i)
          if (match && match[1]) {
            const num = parseInt(match[1], 10)
            if (!isNaN(num) && num > maxSec) maxSec = num
          }
        }
      }
    }

    const codigoOrden = `${prefijo}${String(maxSec + 1).padStart(3, '0')}`

    // Crear orden de trabajo con ventana horaria garantizada
    const { data: orden, error: errOt } = await db
      .from('orden_trabajo')
      .insert({
        cotizacion_id: cotizacionId,
        codigo_orden: codigoOrden,
        tipo_trabajo: 'SERVICIO',
        estado: 'PROGRAMADA',
        fecha_inicio_programada: inicio,
        fecha_fin_programada: fin,
      })
      .select()
      .single()

    if (errOt || !orden) {
      throw new Error(`No se pudo crear la orden de trabajo: ${errOt?.message}`)
    }

    // Registrar en bitácora
    if (usuarioId) {
      try {
        const ipOrigen = ip && ip.trim() ? ip.trim() : await obtenerIpOrigen()
        await registrarEvento(db, {
          usuario_id: usuarioId,
          accion: 'CREAR_ORDEN_TRABAJO',
          descripcion: `Se creó la Orden de Trabajo ${codigoOrden} a partir de la cotización #${cotizacionId} (Ventana: ${inicio} a ${fin})`,
        }, ipOrigen)
      } catch (e) {
        console.warn('[CU12] Error al auditar creación de OT:', e)
      }
    }

    return orden
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
      .update({ estado: 'CANCELADA' })
      .eq('id', ordenId)
      .eq('estado', 'PROGRAMADA')
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

    if (orden.estado !== 'PROGRAMADA') {
      throw new Error('Solo se puede iniciar una orden en estado Programada')
    }

    if (orden.fecha_inicio_real) {
      throw new Error('La orden ya tiene marca de tiempo de inicio registrada')
    }

    const { data: updated, error: errUpd } = await db
      .from('orden_trabajo')
      .update({
        fecha_inicio_real: ahoraBolivia(),
        estado: 'EN_PROGRESO',
      })
      .eq('id', ordenId)
      .eq('estado', 'PROGRAMADA')
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
    const diffMs = aMs(fechaFin) - aMs(orden.fecha_inicio_real)
    const horasTecnicas = Math.max(0, diffMs / (1000 * 60 * 60))

    const updateData: any = {
      fecha_fin_real: fechaFin,
      estado: orden.estado === 'EN_PROGRESO' ? 'EN_PROGRESO' : orden.estado,
    }

    updateData.observaciones_tecnico = orden.observaciones_tecnico
      ? `${orden.observaciones_tecnico}\n[HORAS_TECNICAS: ${horasTecnicas.toFixed(2)}h]`
      : `[HORAS_TECNICAS: ${horasTecnicas.toFixed(2)}h]`

    const { data: updated, error: errUpd } = await db
      .from('orden_trabajo')
      .update(updateData)
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

    if (orden.estado === 'FINALIZADA') {
      throw new Error('La orden ya se encuentra finalizada')
    }

    if (orden.estado !== 'EN_PROGRESO') {
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
