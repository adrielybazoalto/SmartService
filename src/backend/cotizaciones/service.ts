import type { Db } from '@/lib/supabase/types'
import {
  actualizarEstadoCotizacionSchema,
  crearCotizacionSchema,
  type ActualizarEstadoCotizacionInput,
  type CrearCotizacionInput,
} from './schema'
import type {
  Cotizacion,
  CotizacionUpdate,
  NuevaCotizacion,
  NuevoDetalleCotizacionProducto,
  NuevoDetalleCotizacionServicio,
} from './types'

/**
 * Crea una cotización con sus líneas de producto y servicio.
 * Calcula el total (subtotal de cada línea) y la persiste.
 * NOTA: no es una transacción atómica; los INSERT son secuenciales
 * (ver README para la alternativa con RPC si se requiere atomicidad).
 */
export async function crearCotizacionConDetalles(
  db: Db,
  input: CrearCotizacionInput,
): Promise<Cotizacion> {
  const parsed = crearCotizacionSchema.parse(input)

  const totalProductos = parsed.items_producto.reduce(
    (acc, i) => acc + i.cantidad * i.precio_unitario,
    0,
  )
  const totalServicios = parsed.items_servicio.reduce(
    (acc, i) => acc + i.horas_estimadas * i.precio_hora,
    0,
  )
  const total = totalProductos + totalServicios

  const { data: cotizacion, error: errCot } = await db
    .from('cotizacion')
    .insert({
      cliente_id: parsed.cliente_id,
      establecimiento_id: parsed.establecimiento_id,
      usuario_id: parsed.usuario_id,
      numero_cotizacion: parsed.numero_cotizacion,
      fecha_emision: parsed.fecha_emision ?? new Date().toISOString().slice(0, 10),
      fecha_vencimiento: parsed.fecha_vencimiento,
      estado: parsed.estado,
      total: total.toFixed(2),
    } as NuevaCotizacion)
    .select()
    .single()
  if (errCot) throw new Error(`No se pudo crear la cotización: ${errCot.message}`)

  if (parsed.items_producto.length > 0) {
    const lineas: NuevoDetalleCotizacionProducto[] = parsed.items_producto.map((i) => ({
      cotizacion_id: cotizacion.id,
      producto_id: i.producto_id,
      cantidad: i.cantidad.toFixed(2),
      precio_unitario: i.precio_unitario.toFixed(2),
      subtotal: (i.cantidad * i.precio_unitario).toFixed(2),
    }))
    const { error: errDet } = await db.from('detalle_cotizacion_producto').insert(lineas)
    if (errDet) {
      throw new Error(`La cotización se creó pero fallaron sus líneas de producto: ${errDet.message}`)
    }
  }

  if (parsed.items_servicio.length > 0) {
    const lineas: NuevoDetalleCotizacionServicio[] = parsed.items_servicio.map((i) => ({
      cotizacion_id: cotizacion.id,
      servicio_id: i.servicio_id,
      horas_estimadas: i.horas_estimadas.toFixed(2),
      precio_hora: i.precio_hora.toFixed(2),
      subtotal: (i.horas_estimadas * i.precio_hora).toFixed(2),
    }))
    const { error: errDet } = await db.from('detalle_cotizacion_servicio').insert(lineas)
    if (errDet) {
      throw new Error(`La cotización se creó pero fallaron sus líneas de servicio: ${errDet.message}`)
    }
  }

  return cotizacion
}

export async function listarCotizaciones(db: Db) {
  const { data, error } = await db
    .from('cotizacion')
    .select('*, cliente(*), establecimiento(*), usuario(nombre)')
    .order('fecha_emision', { ascending: false })
  if (error) throw new Error(`No se pudieron cargar las cotizaciones: ${error.message}`)
  return data
}

export async function getCotizacionPorId(db: Db, id: number) {
  const { data, error } = await db
    .from('cotizacion')
    .select(
      '*, cliente(*), establecimiento(*), usuario(nombre), detalle_cotizacion_producto(*, producto(*)), detalle_cotizacion_servicio(*, servicio(*))',
    )
    .eq('id', id)
    .single()
  if (error) throw new Error(`No se encontró la cotización: ${error.message}`)
  return data
}

export async function listarCotizacionesPendientes(db: Db) {
  const { data, error } = await db
    .from('cotizacion')
    .select('*, cliente(*)')
    .eq('estado', 'PENDIENTE')
    .order('fecha_emision', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar las cotizaciones pendientes: ${error.message}`)
  return data
}

export async function actualizarEstadoCotizacion(
  db: Db,
  id: number,
  input: ActualizarEstadoCotizacionInput,
): Promise<Cotizacion> {
  const parsed = actualizarEstadoCotizacionSchema.parse(input)
  const { data, error } = await db
    .from('cotizacion')
    .update({ estado: parsed.estado } as CotizacionUpdate)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`No se pudo actualizar el estado de la cotización: ${error.message}`)
  return data
}