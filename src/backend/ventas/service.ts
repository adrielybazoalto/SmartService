import type { Db } from '@/lib/supabase/types'
import {
  abrirCajaSchema,
  cerrarCajaSchema,
  crearVentaSchema,
  type AbrirCajaInput,
  type CerrarCajaInput,
  type CrearVentaInput,
} from './schema'
import type { Caja, CajaUpdate, NuevoDetalleVenta, NuevaVenta, Venta, VentaUpdate } from './types'

function num(v: number, decimales = 2): string {
  return v.toFixed(decimales)
}

const hoyISO = () => new Date().toISOString()

// ---------------------------------------------------------------------------
// CAJA
// ---------------------------------------------------------------------------

export async function abrirCaja(db: Db, input: AbrirCajaInput): Promise<Caja> {
  const parsed = abrirCajaSchema.parse(input)

  const { data: activa, error: errActiva } = await db
    .from('caja')
    .select('id')
    .eq('usuario_id', parsed.usuario_id)
    .eq('estado', 'ABIERTA')
    .maybeSingle()
  if (errActiva) throw new Error(`No se pudo consultar la caja: ${errActiva.message}`)
  if (activa) throw new Error('Ya existe una caja abierta para este usuario.')

  const { data, error } = await db
    .from('caja')
    .insert({ usuario_id: parsed.usuario_id, monto_inicial: num(parsed.monto_inicial) })
    .select()
    .single()
  if (error) throw new Error(`No se pudo abrir la caja: ${error.message}`)
  return data
}

export async function getCajaActiva(db: Db, usuarioId: number): Promise<Caja | null> {
  const { data, error } = await db
    .from('caja')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'ABIERTA')
    .maybeSingle()
  if (error) throw new Error(`No se pudo consultar la caja: ${error.message}`)
  return data
}

/** Cierra la caja: calcula monto_final_sistema (inicial + ventas no anuladas). */
export async function cerrarCaja(db: Db, id: number, input: CerrarCajaInput): Promise<Caja> {
  const parsed = cerrarCajaSchema.parse(input)

  const { data: caja, error: errCaja } = await db
    .from('caja')
    .select('monto_inicial')
    .eq('id', id)
    .single()
  if (errCaja) throw new Error(`No se encontró la caja: ${errCaja.message}`)

  const { data: ventas, error: errVentas } = await db
    .from('venta')
    .select('total')
    .eq('caja_id', id)
    .neq('estado', 'ANULADA')
  if (errVentas) throw new Error(`No se pudieron calcular las ventas: ${errVentas.message}`)

  const montoFinalSistema =
    parseFloat(caja.monto_inicial) +
    ventas.reduce((acc, v) => acc + parseFloat(v.total), 0)

  const { data, error } = await db
    .from('caja')
    .update({
      fecha_cierre: hoyISO(),
      monto_final_sistema: num(montoFinalSistema),
      monto_final_real: num(parsed.monto_final_real),
      estado: 'CERRADA',
    } as CajaUpdate)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`No se pudo cerrar la caja: ${error.message}`)
  return data
}

// ---------------------------------------------------------------------------
// VENTAS
// ---------------------------------------------------------------------------

/**
 * Crea una venta con sus líneas. Calcula subtotal y total (subtotal - descuento).
 * Los ítems de PRODUCTO descuentan stock (kardex SALIDA).
 */
export async function crearVentaConDetalles(db: Db, input: CrearVentaInput): Promise<Venta> {
  const parsed = crearVentaSchema.parse(input)

  const subtotal = parsed.items.reduce(
    (acc, i) => acc + i.cantidad * i.precio_unitario,
    0,
  )
  const total = subtotal - parsed.descuento

  const { data: venta, error: errVenta } = await db
    .from('venta')
    .insert({
      caja_id: parsed.caja_id,
      cliente_id: parsed.cliente_id,
      usuario_id: parsed.usuario_id,
      cotizacion_id: parsed.cotizacion_id,
      orden_trabajo_id: parsed.orden_trabajo_id,
      tipo_comprobante: parsed.tipo_comprobante,
      nro_comprobante: parsed.nro_comprobante,
      subtotal: num(subtotal),
      descuento: num(parsed.descuento),
      total: num(total),
      estado: parsed.estado,
    } as NuevaVenta)
    .select()
    .single()
  if (errVenta) throw new Error(`No se pudo crear la venta: ${errVenta.message}`)

  const lineas: NuevoDetalleVenta[] = parsed.items.map((i) => ({
    venta_id: venta.id,
    producto_id: i.producto_id,
    cantidad: num(i.cantidad),
    precio_unitario: num(i.precio_unitario),
    subtotal: num(i.cantidad * i.precio_unitario),
  }))

  const { error: errDetalle } = await db.from('detalle_venta').insert(lineas)
  if (errDetalle) {
    throw new Error(`La venta se creó pero fallaron sus líneas: ${errDetalle.message}`)
  }

  // Descuento de stock para los ítems (kardex SALIDA por venta)
  for (const i of parsed.items) {

    const { data: prod, error: errProd } = await db
      .from('producto')
      .select('stock_disponible')
      .eq('id', i.producto_id)
      .single()
    if (errProd) throw new Error(`No se encontró el producto ${i.producto_id}: ${errProd.message}`)

    const stockAnterior = parseFloat(prod.stock_disponible)
    if (i.cantidad > stockAnterior) {
      throw new Error(`Stock insuficiente para el producto ${i.producto_id}.`)
    }

    const { error: errMov } = await db.from('movimiento_kardex').insert({
      producto_id: i.producto_id,
      usuario_id: parsed.usuario_id,
      tipo_movimiento: 'SALIDA',
      cantidad: num(i.cantidad),
      stock_anterior: num(stockAnterior),
      origen_movimiento: `venta:${venta.id}`,
    })
    if (errMov) throw new Error(`No se pudo registrar el kardex de la venta: ${errMov.message}`)

    const { error: errStock } = await db
      .from('producto')
      .update({ stock_disponible: num(stockAnterior - i.cantidad) })
      .eq('id', i.producto_id)
    if (errStock) throw new Error(`No se pudo actualizar el stock: ${errStock.message}`)
  }

  return venta
}

export async function listarVentas(db: Db) {
  const { data, error } = await db
    .from('venta')
    .select('*, cliente(*), usuario(nombre), caja(*)')
    .order('fecha_emision', { ascending: false })
  if (error) throw new Error(`No se pudieron cargar las ventas: ${error.message}`)
  return data
}

export async function getVentaPorId(db: Db, id: number) {
  const { data, error } = await db
    .from('venta')
    .select(
      '*, cliente(*), usuario(nombre), caja(*), detalle_venta(*, producto(*))',
    )
    .eq('id', id)
    .single()
  if (error) throw new Error(`No se encontró la venta: ${error.message}`)
  return data
}

export async function anularVenta(db: Db, id: number): Promise<Venta> {
  const { data, error } = await db
    .from('venta')
    .update({ estado: 'ANULADA' } as VentaUpdate)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`No se pudo anular la venta: ${error.message}`)
  // TODO(mejora): restaurar stock de los ítems producto anulados.
  return data
}