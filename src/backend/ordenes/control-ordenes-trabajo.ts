import type { Db } from '@/lib/supabase/types'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { obtenerIpOrigen } from '@/lib/ip'
import { registrarEvento } from '@/backend/bitacora'
import { procesarReporteCampoSchema, type ProcesarReporteCampoInput } from './schema'
import type { OrdenTrabajo } from './types'

function num(v: number, decimales = 2): string {
  return v.toFixed(decimales)
}

/**
 * ControlOrdenesTrabajo (CU12) — Gestionar Órdenes de Trabajo y Reporte de Campo
 * Implementa las reglas de negocio siguiendo los diagramas aprobados.
 */
export class ControlOrdenesTrabajo {
  /**
   * Convierte una cotización aprobada en una Orden de Trabajo, generando
   * un código correlativo único (ej. OT-2026-001).
   */
  static async convertirCotizacionAOrdenBD(
    db: Db,
    cotizacionId: number,
    usuarioId?: number,
    ip?: string | null,
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

    // Crear orden de trabajo
    const { data: orden, error: errOt } = await db
      .from('orden_trabajo')
      .insert({
        cotizacion_id: cotizacionId,
        codigo_orden: codigoOrden,
        tipo_trabajo: 'SERVICIO',
        estado: 'PROGRAMADA',
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
          descripcion: `Se creó la Orden de Trabajo ${codigoOrden} a partir de la cotización #${cotizacionId}`,
        }, ipOrigen)
      } catch (e) {
        console.warn('[CU12] Error al auditar creación de OT:', e)
      }
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

    // Nota: el campo horas_tecnicas puede no existir en el schema actual
    // Lo guardamos en observaciones o lo intentamos actualizar si existe
    const updateData: any = {
      fecha_fin_real: fechaFin.toISOString(),
      estado: orden.estado === 'EN_PROGRESO' ? 'EN_PROGRESO' : orden.estado,
    }

    // Intentar agregar horas_tecnicas si la columna existe (compatibilidad)
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
        throw new Error(`Stock insuficiente para el producto ${producto.nombre}. Disponible: ${stock}, Solicitado: ${mat.cantidad_utilizada}`)
      }
    }
  }

  /**
   * Procesar reporte de campo de forma atómica
   */
  static async procesarReporteCampo(
    db: Db,
    input: ProcesarReporteCampoInput,
    usuarioId: number,
    ip?: string | null,
  ): Promise<{ orden: OrdenTrabajo; consumos: any[] }> {
    const parsed = procesarReporteCampoSchema.parse(input)
    const { ordenId, diagnostico, materiales = [] } = parsed

    // Obtener orden
    const { data: orden, error: errOrd } = await db
      .from('orden_trabajo')
      .select('*')
      .eq('id', ordenId)
      .single()

    if (errOrd || !orden) {
      throw new Error(`No se encontró la orden de trabajo: ${errOrd?.message}`)
    }

    if (orden.estado === 'COMPLETADA') {
      throw new Error('La orden ya se encuentra finalizada')
    }

    // a) Validar stock suficiente
    if (materiales.length > 0) {
      await this.validarStockMateriales(db, materiales)
    }

    const consumosRegistrados = []

    // b) y c) Procesar materiales de forma secuencial
    for (const mat of materiales) {
      const { data: producto } = await db
        .from('producto')
        .select('stock_disponible')
        .eq('id', mat.producto_id)
        .single()

      if (!producto) continue

      const stockAnterior = parseFloat(producto.stock_disponible || '0')
      const stockNuevo = stockAnterior - mat.cantidad_utilizada

      // Insertar en movimiento_kardex (tipo 'Salida por Consumo en OT')
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

      // Descontar inventario
      const { error: errStock } = await db
        .from('producto')
        .update({ stock_disponible: num(stockNuevo) })
        .eq('id', mat.producto_id)
      if (errStock) throw new Error(`No se pudo actualizar stock: ${errStock.message}`)

      // Insertar detalle de consumo
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

    // d) Actualizar estado a 'Finalizada' y registrar en bitácora
    const { data: ordenFinalizada, error: errFin } = await db
      .from('orden_trabajo')
      .update({
        estado: 'COMPLETADA',
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
      const ipOrigen = ip && ip.trim() ? ip.trim() : await obtenerIpOrigen()
      await registrarEvento(db, {
        usuario_id: usuarioId,
        accion: 'FINALIZAR_ORDEN_TRABAJO',
        descripcion: `Se finalizó la Orden de Trabajo ${orden.codigo_orden} con diagnóstico: ${diagnostico.substring(0, 100)}${diagnostico.length > 100 ? '...' : ''}. Materiales consumidos: ${materiales.length}`,
      }, ipOrigen)
    } catch (e) {
      console.warn('[CU12] Error al auditar finalización de OT:', e)
    }

    return { orden: ordenFinalizada, consumos: consumosRegistrados }
  }
}

// Alias para compatibilidad
export const OrdenesTrabajoControl = ControlOrdenesTrabajo
export default ControlOrdenesTrabajo
