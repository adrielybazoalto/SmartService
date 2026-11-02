import type { Db } from '@/lib/supabase/types'
import {
  filtrarBitacoraSchema,
  registrarEventoSchema,
  type FiltrarBitacoraInput,
  type RegistrarEventoInput,
} from './schema'
import type { Bitacora, NuevoEventoBitacora } from './types'
import { obtenerIpOrigen } from '@/lib/ip'

const POR_PAGINA = 50

/** % y _ son comodines de LIKE: el filtro debe buscarlos como texto. */
const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`)

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

/** Lista y filtra la bitácora con paginación — pasos 2 y 3 del flujo principal del CU06. */
export async function listarBitacora(
  db: Db,
  filtros: FiltrarBitacoraInput = {},
): Promise<{ eventos: Bitacora[]; total: number; pagina: number; porPagina: number }> {
  const parsed = filtrarBitacoraSchema.parse(filtros)
  const pagina = parsed.pagina ?? 1
  const desde = (pagina - 1) * POR_PAGINA

  let query = db.from('bitacora').select('*', { count: 'exact' }).order('fecha_hora', { ascending: false })

  if (parsed.fecha_inicio) query = query.gte('fecha_hora', parsed.fecha_inicio)
  if (parsed.fecha_fin) query = query.lte('fecha_hora', parsed.fecha_fin)
  if (parsed.usuario_id) query = query.eq('usuario_id', parsed.usuario_id)
  if (parsed.accion) query = query.eq('accion', parsed.accion)
  if (parsed.ip) query = query.ilike('ip', `%${escaparLike(parsed.ip)}%`)

  const { data, error, count } = await query.range(desde, desde + POR_PAGINA - 1)
  if (error) throw new Error(`No se pudo cargar la bitácora: ${error.message}`)
  return { eventos: data, total: count ?? data.length, pagina, porPagina: POR_PAGINA }
}

/** Detalle de un evento puntual — paso 4 del flujo principal del CU06. */
export async function getEventoPorId(db: Db, id: number): Promise<Bitacora> {
  const { data, error } = await db.from('bitacora').select('*').eq('id', id).single()
  if (error) throw new Error(`No se encontró el evento de bitácora: ${error.message}`)
  return data
}