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
  ip?: string | null,
): Promise<Bitacora> {
  const parsed = registrarBitacoraSchema.parse(input)
  const ipOrigen = (ip && ip.trim()) ? ip.trim() : (await obtenerIpOrigen())
  const { data, error } = await db
    .from('bitacora')
    .insert({ ...parsed, ip: ipOrigen } as NuevaBitacora)
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
export async function registrarEvento(
  db: Db,
  input: RegistrarEventoInput,
  ip?: string | null,
): Promise<Bitacora> {
  const parsed = registrarEventoSchema.parse(input)
  // La IP puede venir capturada por el llamador; si no, se resuelve mediante el helper centralizado
  const ipOrigen = (ip && ip.trim()) ? ip.trim() : (await obtenerIpOrigen())
  const { data, error } = await db
    .from('bitacora')
    .insert({ ...parsed, ip: ipOrigen } as NuevoEventoBitacora)
    .select()
    .single()
  if (error) {
    console.error('Error al registrar en bitácora:', error)
    throw new Error(`No se pudo registrar el evento en la bitácora: ${error.message}`)
  }
  return data
}

/**
 * CU07 — Evento de auditoría del módulo Clientes (Gestionar Clientes y
 * Establecimientos). Invoca `registrarEvento()` con el detalle de la acción y
 * la IP de origen capturada por la Server Action.
 *
 * Requisito de auditoría: TODO registro de bitácora incluye la dirección IP,
 * que se persiste en la columna `ip` de BITACORA.
 */
export async function guardarEventoCliente(
  db: Db,
  usuario_id: number,
  accion: string,
  descripcion: string | null = null,
  ip: string | null = null,
): Promise<Bitacora> {
  const ipOrigen = (ip && ip.trim()) ? ip.trim() : (await obtenerIpOrigen())
  return registrarEvento(db, { usuario_id, accion, descripcion }, ipOrigen)
}

/** Lista y filtra la bitácora — pasos 2 y 3 del flujo principal del CU06. */
export async function listarBitacora(db: Db, filtros: FiltrarBitacoraInput = {}): Promise<Bitacora[]> {
  const parsed = filtrarBitacoraSchema.parse(filtros)
  let query = db.from('bitacora').select('*').order('fecha_hora', { ascending: false })

  if (parsed.fecha_inicio) query = query.gte('fecha_hora', parsed.fecha_inicio)
  if (parsed.fecha_fin) query = query.lte('fecha_hora', parsed.fecha_fin)
  if (parsed.usuario_id) query = query.eq('usuario_id', parsed.usuario_id)
  if (parsed.accion) query = query.eq('accion', parsed.accion)
  if (parsed.ip) query = query.ilike('ip', `%${parsed.ip}%`)

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