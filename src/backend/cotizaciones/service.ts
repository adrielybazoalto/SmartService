import type { SupabaseClient } from '@supabase/supabase-js'
import type { Db } from '@/lib/supabase/types'
import { registrarEvento } from '@/backend/bitacora'
import { guardarCotizacionSchema, type GuardarCotizacionInput } from './schema'

const MSG_FALTA_MIGRACION = 'Falta aplicar la migración de cotizaciones en la base de datos'

// ---------------------------------------------------------------------------
// Catálogo del formulario: solo lo que se puede cotizar hoy
// ---------------------------------------------------------------------------

export async function listarClientes(db: Db) {
  const { data } = await db.from('cliente').select('id, nombre, documento_identidad').eq('estado', true)
  return data ?? []
}

export async function listarEstablecimientosDeCliente(db: Db, clienteId: number) {
  const { data, error } = await db
    .from('establecimiento')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('estado', true)
    .order('id', { ascending: true })

  if (error) {
    console.error('Error al obtener establecimientos por cliente:', error.message)
    return []
  }
  return data ?? []
}

export async function listarProductosCotizables(db: Db) {
  // database.types.ts aún no declara producto.estado (se regenera en la Fase 10)
  const { data } = await (db as unknown as SupabaseClient)
    .from('producto')
    .select('id, nombre, precio_compra_actual, margen_ganancia, stock_disponible, imagen_producto (url_imagen)')
    .eq('estado', true)
  return data ?? []
}

export async function listarServiciosCotizables(db: Db) {
  const { data } = await db.from('servicio').select('*').eq('activo', true)
  return data ?? []
}

// ---------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------

export async function listarCotizaciones(db: Db) {
  const { data, error } = await db
    .from('cotizacion')
    .select('*, cliente:cliente_id (nombre)')
    .order('id', { ascending: false })

  if (error) {
    console.error('Error al obtener cotizaciones:', error.message)
    return []
  }
  return data ?? []
}

/** Cabecera con cliente, establecimiento (el propio o el principal) y detalle. */
export async function obtenerCotizacionCompleta(db: Db, id: number) {
  const { data: cot, error } = await db.from('cotizacion').select('*').eq('id', id).single()
  if (error || !cot) return null

  const [{ data: cliente }, { data: establecimientos }, { data: productos }, { data: servicios }] = await Promise.all([
    db.from('cliente').select('*').eq('id', cot.cliente_id).maybeSingle(),
    cot.establecimiento_id
      ? db.from('establecimiento').select('*').eq('id', cot.establecimiento_id)
      : db.from('establecimiento').select('*').eq('cliente_id', cot.cliente_id).order('id', { ascending: true }).limit(1),
    db.from('detalle_cotizacion_producto').select('*, producto:producto_id(nombre)').eq('cotizacion_id', id),
    db.from('detalle_cotizacion_servicio').select('*, servicio:servicio_id(nombre)').eq('cotizacion_id', id),
  ])

  return {
    ...cot,
    cliente: cliente ?? { id: cot.cliente_id, nombre: `Cliente #${cot.cliente_id}` },
    establecimiento: establecimientos?.[0] ?? null,
    productos: productos ?? [],
    servicios: servicios ?? [],
  }
}

// ---------------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------------

/** Crea (sin cotizacionId) o edita. Precios, total y correlativo se resuelven en la base. */
export async function guardarCotizacion(
  db: Db,
  input: GuardarCotizacionInput,
  auditoria: { usuarioId: number; ip: string | null; cotizacionId?: number },
): Promise<{ id: number; numero_cotizacion: string; total: number }> {
  const parsed = guardarCotizacionSchema.parse(input)

  const { data, error } = await (db as unknown as SupabaseClient).rpc('fn_guardar_cotizacion', {
    p_usuario_id: auditoria.usuarioId,
    p_cotizacion_id: auditoria.cotizacionId ?? null,
    p_cliente_id: parsed.cliente_id,
    p_establecimiento_id: parsed.establecimiento_id ?? null,
    p_productos: parsed.productos,
    p_servicios: parsed.servicios,
    p_ip: auditoria.ip,
  })
  if (error) throw new Error(error.code === 'PGRST202' ? MSG_FALTA_MIGRACION : error.message)
  return data
}

/** Rechazar: solo desde PENDIENTE. Aprobar pasa por fn_aprobar_cotizacion. */
export async function rechazarCotizacion(
  db: Db,
  id: number,
  auditoria: { usuarioId: number; ip: string | null },
): Promise<void> {
  const { data, error } = await db
    .from('cotizacion')
    .update({ estado: 'RECHAZADA' })
    .eq('id', id)
    .eq('estado', 'PENDIENTE')
    .select('numero_cotizacion')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Solo se pueden rechazar cotizaciones en estado PENDIENTE')

  try {
    await registrarEvento(db, {
      usuario_id: auditoria.usuarioId,
      accion: 'RECHAZAR_COTIZACION',
      descripcion: `Se rechazó la cotización ${data.numero_cotizacion}`,
    }, auditoria.ip)
  } catch (e) {
    console.warn('[Cotizaciones] Error al auditar el rechazo:', e)
  }
}
