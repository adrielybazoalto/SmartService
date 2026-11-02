import type { Db } from '@/lib/supabase/types'
import {
  actualizarClienteSchema,
  crearClienteSchema,
  type ActualizarClienteInput,
  type CrearClienteInput,
} from './schema'
import type { Cliente, NuevoCliente } from './types'

export async function listarClientes(db: Db): Promise<Cliente[]> {
  const { data, error } = await db.from('cliente').select('*').order('id', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los clientes: ${error.message}`)
  return data
}

/** Búsqueda por nombre, documento de identidad o correo. */
export async function buscarClientes(db: Db, termino: string): Promise<Cliente[]> {
  const t = termino.trim()
  if (!t) return listarClientes(db)

  const { data, error } = await db
    .from('cliente')
    .select('*')
    .or(
      `nombre.ilike.%${t}%,documento_identidad.ilike.%${t}%,correo.ilike.%${t}%`,
    )
    .order('nombre', { ascending: true })
  if (error) throw new Error(`No se pudo buscar clientes: ${error.message}`)
  return data
}

export async function getClientePorId(db: Db, id: number): Promise<Cliente> {
  const { data, error } = await db.from('cliente').select('*').eq('id', id).single()
  if (error) throw new Error(`No se encontró el cliente: ${error.message}`)
  return data
}

/**
 * Verifica si ya existe un cliente con ese documento de identidad (CU07).
 * Devuelve `null` cuando el documento no está registrado o viene vacío.
 * La unicidad también está garantizada por el UNIQUE de `documento_identidad`.
 */
export async function verificarDocumento(
  db: Db,
  documento_identidad: string,
): Promise<Cliente | null> {
  const documento = documento_identidad.trim()
  if (!documento) return null

  const { data, error } = await db
    .from('cliente')
    .select('*')
    .eq('documento_identidad', documento)
    .maybeSingle()
  if (error) throw new Error(`No se pudo verificar el documento: ${error.message}`)
  return data
}

export async function crearCliente(db: Db, input: CrearClienteInput): Promise<Cliente> {
  const parsed = crearClienteSchema.parse(input)
  const { data, error } = await db
    .from('cliente')
    .insert(parsed as NuevoCliente)
    .select()
    .single()
  if (error) throw new Error(`No se pudo crear el cliente: ${error.message}`)
  return data
}

export async function actualizarCliente(
  db: Db,
  id: number,
  input: ActualizarClienteInput,
): Promise<Cliente> {
  const parsed = actualizarClienteSchema.parse(input)
  const { data, error } = await db.from('cliente').update(parsed).eq('id', id).select().single()
  if (error) throw new Error(`No se pudo actualizar el cliente: ${error.message}`)
  return data
}

/** Subflujo "Desactivar": el cliente deja de ofrecerse, pero conserva su historial. */
export async function cambiarEstadoCliente(db: Db, id: number, estado: boolean): Promise<Cliente> {
  const { data, error } = await db.from('cliente').update({ estado }).eq('id', id).select().single()
  if (error) throw new Error(`No se pudo cambiar el estado del cliente: ${error.message}`)
  return data
}

/** Subflujo "Ver historial": cotizaciones del cliente con su orden y su nota de servicio. */
export async function obtenerHistorialCliente(db: Db, id: number) {
  const { data, error } = await db
    .from('cotizacion')
    .select(
      'id, numero_cotizacion, fecha_emision, estado, total, orden_trabajo(id, codigo_orden, estado, nota_servicio(numero_nota, estado, monto_total))',
    )
    .eq('cliente_id', id)
    .order('id', { ascending: false })
  if (error) throw new Error(`No se pudo cargar el historial del cliente: ${error.message}`)
  return data
}

export async function eliminarCliente(db: Db, id: number): Promise<void> {
  const { error } = await db.from('cliente').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar el cliente: ${error.message}`)
}