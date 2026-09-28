import type { Db } from '@/lib/supabase/types'
import {
  registrarEventoSchema,
  filtrarBitacoraSchema,
  type RegistrarEventoInput,
  type FiltrarBitacoraInput,
} from './schema'
import type { Bitacora } from './types'

/**
 * Registra un evento sensible. Pensado para ser llamado desde OTROS módulos
 * (caja, inventario, cotizaciones, órdenes) cuando ejecutan una acción auditable.
 */
export async function registrarEvento(db: Db, input: RegistrarEventoInput): Promise<Bitacora> {
  const parsed = registrarEventoSchema.parse(input)
  const { data, error } = await db.from('bitacora').insert(parsed).select().single()
  if (error) throw new Error(`No se pudo registrar el evento en la bitácora: ${error.message}`)
  return data
}

/** Lista y filtra la bitácora — paso 2 y 3 del flujo principal del CU06. */
export async function listarBitacora(db: Db, filtros: FiltrarBitacoraInput = {}): Promise<Bitacora[]> {
  const parsed = filtrarBitacoraSchema.parse(filtros)
  let query = db.from('bitacora').select('*').order('fecha_hora', { ascending: false })

  if (parsed.fecha_inicio) query = query.gte('fecha_hora', parsed.fecha_inicio)
  if (parsed.fecha_fin) query = query.lte('fecha_hora', parsed.fecha_fin)
  if (parsed.usuario_id) query = query.eq('usuario_id', parsed.usuario_id)
  if (parsed.accion) query = query.eq('accion', parsed.accion)

  const { data, error } = await query
  if (error) throw new Error(`No se pudo cargar la bitácora: ${error.message}`)
  return data
}

/** Detalle de un evento puntual — paso 4 del flujo principal. */
export async function getEventoPorId(db: Db, id: number): Promise<Bitacora> {
  const { data, error } = await db.from('bitacora').select('*').eq('id', id).single()
  if (error) throw new Error(`No se encontró el evento de bitácora: ${error.message}`)
  return data
}