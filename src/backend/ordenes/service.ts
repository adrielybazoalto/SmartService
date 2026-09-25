import type { Db } from '@/lib/supabase/types'
import {
  actualizarEstadoOrdenTrabajoSchema,
  crearConsumoMaterialSchema,
  crearNotaServicioSchema,
  crearOrdenTrabajoSchema,
  type ActualizarEstadoOrdenTrabajoInput,
  type CrearConsumoMaterialInput,
  type CrearNotaServicioInput,
  type CrearOrdenTrabajoInput,
} from './schema'
import type {
  NuevaOrdenTrabajo,
  NuevoDetalleConsumoMaterial,
  NuevoOrdenTrabajoTecnico,
  OrdenTrabajo,
  OrdenTrabajoUpdate,
} from './types'

function num(v: number, decimales = 2): string {
  return v.toFixed(decimales)
}

export async function crearOrdenTrabajo(
  db: Db,
  input: CrearOrdenTrabajoInput,
): Promise<OrdenTrabajo> {
  const parsed = crearOrdenTrabajoSchema.parse(input)
  const { data, error } = await db
    .from('orden_trabajo')
    .insert(parsed as NuevaOrdenTrabajo)
    .select()
    .single()
  if (error) throw new Error(`No se pudo crear la orden de trabajo: ${error.message}`)
  return data
}

/** Crea la orden y asigna los técnicos indicados (el primero es líder). */
export async function crearOrdenTrabajoConTecnicos(
  db: Db,
  input: CrearOrdenTrabajoInput,
  tecnicoIds: number[],
): Promise<OrdenTrabajo> {
  const orden = await crearOrdenTrabajo(db, input)

  if (tecnicoIds.length > 0) {
    const asignaciones: NuevoOrdenTrabajoTecnico[] = tecnicoIds.map((usuarioId, i) => ({
      orden_trabajo_id: orden.id,
      usuario_id: usuarioId,
      es_lider: i === 0,
    }))
    const { error } = await db.from('orden_trabajo_tecnico').insert(asignaciones)
    if (error) {
      throw new Error(`La orden se creó pero falló la asignación de técnicos: ${error.message}`)
    }
  }

  return orden
}

export async function listarOrdenesTrabajo(db: Db) {
  const { data, error } = await db
    .from('orden_trabajo')
    .select('*, cotizacion(*, cliente(nombre)), orden_trabajo_tecnico(*)')
    .order('id', { ascending: false })
  if (error) throw new Error(`No se pudieron cargar las órdenes de trabajo: ${error.message}`)
  return data
}

export async function getOrdenTrabajoPorId(db: Db, id: number) {
  const { data, error } = await db
    .from('orden_trabajo')
    .select(
      '*, cotizacion(*, cliente(*)), orden_trabajo_tecnico(*, usuario(nombre)), detalle_consumo_material(*, producto(nombre)), nota_servicio(*)',
    )
    .eq('id', id)
    .single()
  if (error) throw new Error(`No se encontró la orden de trabajo: ${error.message}`)
  return data
}

export async function actualizarEstadoOrdenTrabajo(
  db: Db,
  id: number,
  input: ActualizarEstadoOrdenTrabajoInput,
): Promise<OrdenTrabajo> {
  const parsed = actualizarEstadoOrdenTrabajoSchema.parse(input)
  const { data, error } = await db
    .from('orden_trabajo')
    .update({ estado: parsed.estado } as OrdenTrabajoUpdate)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`No se pudo actualizar el estado de la orden: ${error.message}`)
  return data
}

/**
 * Registra el consumo de material de una orden: descuenta stock del producto,
 * deja trazabilidad en el kardex (SALIDA por orden de trabajo) y crea el
 * detalle de consumo.
 */
export async function registrarConsumoMaterial(
  db: Db,
  input: CrearConsumoMaterialInput,
  usuarioId: number,
) {
  const parsed = crearConsumoMaterialSchema.parse(input)

  const { data: producto, error: errProd } = await db
    .from('producto')
    .select('stock_disponible')
    .eq('id', parsed.producto_id)
    .single()
  if (errProd) throw new Error(`No se encontró el producto: ${errProd.message}`)

  const stockAnterior = parseFloat(producto.stock_disponible)
  if (parsed.cantidad_utilizada > stockAnterior) {
    throw new Error('Stock insuficiente para el consumo de material.')
  }
  const stockNuevo = stockAnterior - parsed.cantidad_utilizada

  const { error: errMov } = await db.from('movimiento_kardex').insert({
    producto_id: parsed.producto_id,
    usuario_id: usuarioId,
    tipo_movimiento: 'SALIDA',
    cantidad: num(parsed.cantidad_utilizada),
    stock_anterior: num(stockAnterior),
    origen_movimiento: `orden_trabajo:${parsed.orden_trabajo_id}`,
  })
  if (errMov) throw new Error(`No se pudo registrar el movimiento kardex: ${errMov.message}`)

  const { error: errStock } = await db
    .from('producto')
    .update({ stock_disponible: num(stockNuevo) })
    .eq('id', parsed.producto_id)
  if (errStock) throw new Error(`No se pudo actualizar el stock: ${errStock.message}`)

  const { data, error } = await db
    .from('detalle_consumo_material')
    .insert({
      orden_trabajo_id: parsed.orden_trabajo_id,
      producto_id: parsed.producto_id,
      cantidad_utilizada: num(parsed.cantidad_utilizada),
      observacion: parsed.observacion,
    } as NuevoDetalleConsumoMaterial)
    .select('*, producto(*)')
    .single()
  if (error) throw new Error(`No se pudo registrar el consumo de material: ${error.message}`)
  return data
}

export async function listarConsumosDeOrden(db: Db, ordenTrabajoId: number) {
  const { data, error } = await db
    .from('detalle_consumo_material')
    .select('*, producto(*)')
    .eq('orden_trabajo_id', ordenTrabajoId)
  if (error) throw new Error(`No se pudieron cargar los consumos: ${error.message}`)
  return data
}

export async function crearNotaServicio(db: Db, input: CrearNotaServicioInput) {
  const parsed = crearNotaServicioSchema.parse(input)
  const { data, error } = await db
    .from('nota_servicio')
    .insert({
      orden_trabajo_id: parsed.orden_trabajo_id,
      numero_nota: parsed.numero_nota,
      anticipo_pagado: num(parsed.anticipo_pagado),
      estado: parsed.estado,
      monto_total: num(parsed.monto_total),
    })
    .select('*, orden_trabajo(*)')
    .single()
  if (error) throw new Error(`No se pudo crear la nota de servicio: ${error.message}`)
  return data
}

export async function listarNotasDeOrden(db: Db, ordenTrabajoId: number) {
  const { data, error } = await db
    .from('nota_servicio')
    .select('*')
    .eq('orden_trabajo_id', ordenTrabajoId)
  if (error) throw new Error(`No se pudieron cargar las notas de servicio: ${error.message}`)
  return data
}