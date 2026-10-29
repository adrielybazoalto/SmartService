import type { Db } from '@/lib/supabase/types'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { obtenerIpOrigen } from '@/lib/ip'
import { registrarEvento } from '@/backend/bitacora'
import { procesarReporteCampoSchema, type ProcesarReporteCampoInput } from './schema'
import type { OrdenTrabajo } from './types'

function num(v: number, decimales = 2): string {
  return v.toFixed(decimales)
}

export interface VentanaHorariaInput {
  fecha_programada?: string
  hora_inicio?: string
  hora_fin?: string
  fecha_inicio_programada?: string
  fecha_fin_programada?: string
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
    usuarioId?: number,
    ip?: string | null,
    ventana?: VentanaHorariaInput,
  ): Promise<OrdenTrabajo> {
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
    const anio = new Date().getFullYear()
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

    // Determinar ventana horaria programada (CU11 requiere inicio y fin válidos)
    let inicioIso: string
    let finIso: string

    if (ventana?.fecha_inicio_programada && ventana?.fecha_fin_programada) {
      inicioIso = new Date(ventana.fecha_inicio_programada).toISOString()
      finIso = new Date(ventana.fecha_fin_programada).toISOString()
    } else if (ventana?.fecha_programada && ventana?.hora_inicio && ventana?.hora_fin) {
      const dIni = new Date(`${ventana.fecha_programada}T${ventana.hora_inicio}:00`)
      const dFin = new Date(`${ventana.fecha_programada}T${ventana.hora_fin}:00`)
      if (isNaN(dIni.getTime()) || isNaN(dFin.getTime()) || dFin.getTime() <= dIni.getTime()) {
        throw new Error('La hora de fin programada debe ser posterior a la hora de inicio')
      }
      inicioIso = dIni.toISOString()
      finIso = dFin.toISOString()
    } else {
      // Valor por defecto garantizado: día siguiente de 08:00 a 12:00
      const manana = new Date()
      manana.setDate(manana.getDate() + 1)
      const yyyy = manana.getFullYear()
      const mm = String(manana.getMonth() + 1).padStart(2, '0')
      const dd = String(manana.getDate()).padStart(2, '0')
      inicioIso = new Date(`${yyyy}-${mm}-${dd}T08:00:00`).toISOString()
      finIso = new Date(`${yyyy}-${mm}-${dd}T12:00:00`).toISOString()
    }

    // Crear orden de trabajo con ventana horaria garantizada
    const { data: orden, error: errOt } = await db
      .from('orden_trabajo')
      .insert({
        cotizacion_id: cotizacionId,
        codigo_orden: codigoOrden,
        tipo_trabajo: 'SERVICIO',
        estado: 'PROGRAMADA',
        fecha_inicio_programada: inicioIso,
        fecha_fin_programada: finIso,
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
          descripcion: `Se creó la Orden de Trabajo ${codigoOrden} a partir de la cotización #${cotizacionId} (Ventana: ${inicioIso} a ${finIso})`,
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

    if (orden.fecha_inicio_real) {
      throw new Error('La orden ya tiene marca de tiempo de inicio registrada')
    }

    const { data: updated, error: errUpd } = await db
      .from('orden_trabajo')
      .update({
        fecha_inicio_real: new Date().toISOString(),
        estado: 'EN_PROGRESO',
      })
      .eq('id', ordenId)
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

    const fechaFin = new Date()
    const fechaInicio = new Date(orden.fecha_inicio_real)
    const diffMs = fechaFin.getTime() - fechaInicio.getTime()
    const horasTecnicas = Math.max(0, diffMs / (1000 * 60 * 60))

    const updateData: any = {
      fecha_fin_real: fechaFin.toISOString(),
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
   * Validar stock suficiente para los materiales
   */
  static async validarStockMateriales(
    db: Db,
    materiales: Array<{ producto_id: number; cantidad_utilizada: number }>,
  ): Promise<void> {
    for (const mat of materiales) {
      const { data: producto, error } = await db
        .from('producto')
        .select('id, nombre, stock_disponible')
        .eq('id', mat.producto_id)
        .single()

      if (error || !producto) {
        throw new Error(`No se encontró el producto con ID ${mat.producto_id}`)
      }

      const stock = parseFloat(producto.stock_disponible || '0')
      if (mat.cantidad_utilizada > stock) {
        throw new Error(`Stock insuficiente para el producto "${producto.nombre}". Disponible: ${stock}, Solicitado: ${mat.cantidad_utilizada}`)
      }
    }
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

    if (orden.estado === 'FINALIZADA' || orden.estado === 'COMPLETADA') {
      throw new Error('La orden ya se encuentra finalizada')
    }

    const ipOrigen = ip && ip.trim() ? ip.trim() : await obtenerIpOrigen()

    // 3. Intentar ejecución atómica mediante RPC en PostgreSQL
    try {
      const { data: rpcRes, error: rpcErr } = await (db as any).rpc('fn_procesar_reporte_campo', {
        p_orden_id: ordenId,
        p_diagnostico: diagnostico,
        p_materiales: materiales,
        p_usuario_id: usuarioId,
        p_ip: ipOrigen,
      })

      if (!rpcErr && rpcRes) {
        return {
          orden: rpcRes.orden,
          consumos: rpcRes.consumos || [],
        }
      }
      if (rpcErr) {
        const msg = rpcErr.message || ''
        const esFuncionFaltante = msg.includes('does not exist') || (msg.includes('function') && msg.includes('not found'))
        if (!esFuncionFaltante) {
          throw new Error(msg)
        }
      }
    } catch (e: any) {
      const msg = e.message || ''
      const esFuncionFaltante = msg.includes('does not exist') || (msg.includes('function') && msg.includes('not found'))
      if (!esFuncionFaltante) {
        throw e
      }
    }

    // 4. Fallback con validación previa de stock y compensación
    if (materiales.length > 0) {
      await this.validarStockMateriales(db, materiales)
    }

    const consumosRegistrados = []
    const movimientosHechos: { productoId: number; stockAnterior: number }[] = []

    try {
      for (const mat of materiales) {
        const { data: producto } = await db
          .from('producto')
          .select('stock_disponible')
          .eq('id', mat.producto_id)
          .single()

        if (!producto) continue

        const stockAnterior = parseFloat(producto.stock_disponible || '0')
        if (mat.cantidad_utilizada > stockAnterior) {
          throw new Error(`Stock insuficiente para el producto ID ${mat.producto_id}`)
        }
        const stockNuevo = stockAnterior - mat.cantidad_utilizada

        const { error: errMov } = await db.from('movimiento_kardex').insert({
          producto_id: mat.producto_id,
          usuario_id: usuarioId,
          tipo_movimiento: 'SALIDA',
          cantidad: num(mat.cantidad_utilizada),
          stock_anterior: num(stockAnterior),
          origen_movimiento: `orden_trabajo:${ordenId}`,
          observacion: `Consumo en OT ${orden.codigo_orden} - ${mat.observacion || 'Sin observación'}`,
        })
        if (errMov) throw new Error(`No se pudo registrar movimiento kardex: ${errMov.message}`)
        movimientosHechos.push({ productoId: mat.producto_id, stockAnterior })

        const { error: errStock } = await db
          .from('producto')
          .update({ stock_disponible: num(stockNuevo) })
          .eq('id', mat.producto_id)
        if (errStock) throw new Error(`No se pudo actualizar stock: ${errStock.message}`)

        const { data: detalle, error: errDet } = await db
          .from('detalle_consumo_material')
          .insert({
            orden_trabajo_id: ordenId,
            producto_id: mat.producto_id,
            cantidad_utilizada: num(mat.cantidad_utilizada),
            observacion: mat.observacion || null,
          })
          .select('*, producto(*)')
          .single()

        if (errDet) throw new Error(`No se pudo registrar consumo de material: ${errDet.message}`)
        consumosRegistrados.push(detalle)
      }

      // Actualizar estado a 'FINALIZADA'
      const { data: ordenFinalizada, error: errFin } = await db
        .from('orden_trabajo')
        .update({
          estado: 'FINALIZADA',
          fecha_fin_real: orden.fecha_fin_real || new Date().toISOString(),
          observaciones_tecnico: diagnostico,
        })
        .eq('id', ordenId)
        .select()
        .single()

      if (errFin || !ordenFinalizada) {
        throw new Error(`No se pudo finalizar la orden: ${errFin?.message}`)
      }

      try {
        await registrarEvento(db, {
          usuario_id: usuarioId,
          accion: 'FINALIZAR_ORDEN_TRABAJO',
          descripcion: `Se finalizó la Orden de Trabajo ${orden.codigo_orden} con diagnóstico: ${diagnostico.substring(0, 100)}${diagnostico.length > 100 ? '...' : ''}. Materiales consumidos: ${materiales.length}`,
        }, ipOrigen)
      } catch (e) {
        console.warn('[CU12] Error al auditar finalización de OT:', e)
      }

      return { orden: ordenFinalizada, consumos: consumosRegistrados }
    } catch (e) {
      // Revertir stocks afectados en caso de error
      for (const mov of movimientosHechos) {
        try {
          await db.from('producto').update({ stock_disponible: num(mov.stockAnterior) }).eq('id', mov.productoId)
        } catch {}
      }
      throw e
    }
  }
}

// Alias para compatibilidad
export const OrdenesTrabajoControl = ControlOrdenesTrabajo
export default ControlOrdenesTrabajo
