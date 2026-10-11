import type { Db } from '@/lib/supabase/types'
import {
  filtrarBitacoraSchema,
  registrarBitacoraSchema,
  registrarEventoSchema,
  type FiltrarBitacoraInput,
  type RegistrarBitacoraInput,
  type RegistrarEventoInput,
} from './schema'
import type { Bitacora, NuevaBitacora, NuevoEventoBitacora } from './types'
import { obtenerIpOrigen } from '@/lib/ip'

/**
 * Inserta un evento de auditoría en BITACORA (CU05: ACTUALIZAR_PERFIL,
 * CAMBIAR_CONTRASENA). `fecha_hora` se completa automáticamente.
 */
export async function registrarBitacora(
  db: Db,
  input: RegistrarBitacoraInput,
): Promise<Bitacora> {
  const parsed = registrarBitacoraSchema.parse(input)
  const ip_origen = await obtenerIpOrigen()
  const { data, error } = await db
    .from('bitacora')
    .insert({ ...parsed, ...(ip_origen ? { ip_origen } : {}) } as NuevaBitacora)
    .select()
    .single()
  if (error) {
    // Trazabilidad en la terminal de Node.js (dev/prod) — si Supabase rechaza
    // la inserción, el detalle queda visible en el log del servidor.
    console.error('Error al registrar en bitácora:', error)
    throw new Error(`No se pudo registrar en la bitácora: ${error.message}`)
  }
  return data
}

/**
 * Registra un evento sensible (CU06). Pensado para ser llamado desde OTROS
 * módulos (caja, inventario, cotizaciones, órdenes) al ejecutar una acción
 * auditable.
 */
export async function registrarEvento(db: Db, input: RegistrarEventoInput): Promise<Bitacora> {
  const parsed = registrarEventoSchema.parse(input)
  const ip_origen = await obtenerIpOrigen()
  const { data, error } = await db.from('bitacora').insert({ ...parsed, ...(ip_origen ? { ip_origen } : {}) } as NuevoEventoBitacora).select().single()
  if (error) {
    console.error('Error al registrar en bitácora:', error)
    throw new Error(`No se pudo registrar el evento en la bitácora: ${error.message}`)
  }
  return data
}

/** Lista y filtra la bitácora — pasos 2 y 3 del flujo principal del CU06. */
export async function listarBitacora(db: Db, filtros: FiltrarBitacoraInput = {}): Promise<Bitacora[]> {
  const parsed = filtrarBitacoraSchema.parse(filtros)
  let query = db.from('bitacora').select('*').order('fecha_hora', { ascending: false })

  if (parsed.fecha_inicio) query = query.gte('fecha_hora', parsed.fecha_inicio)
  if (parsed.fecha_fin) query = query.lte('fecha_hora', parsed.fecha_fin)
  if (parsed.usuario_id) query = query.eq('usuario_id', parsed.usuario_id)
  if (parsed.accion) query = query.eq('accion', parsed.accion)
  if (parsed.ip_origen) query = query.ilike('ip_origen', `%${parsed.ip_origen}%`)

  const { data, error } = await query
  if (error) throw new Error(`No se pudo cargar la bitácora: ${error.message}`)
  return data
}

/** Detalle de un evento puntual — paso 4 del flujo principal del CU06. */
export async function getEventoPorId(db: Db, id: number): Promise<Bitacora> {
  const { data, error } = await db.from('bitacora').select('*').eq('id', id).single()
  if (error) throw new Error(`No se encontró el evento de bitácora: ${error.message}`)
  return data
}