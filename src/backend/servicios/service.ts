import type { Db } from '@/lib/supabase/types'
import {
  actualizarServicioSchema,
  crearServicioSchema,
  type ActualizarServicioInput,
  type CrearServicioInput,
} from './schema'
import type { NuevoServicio, Servicio } from './types'

export async function listarServicios(db: Db): Promise<Servicio[]> {
  const { data, error } = await db.from('servicio').select('*').order('nombre', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los servicios: ${error.message}`)
  return data
}

export async function getServicioPorId(db: Db, id: number): Promise<Servicio> {
  const { data, error } = await db.from('servicio').select('*').eq('id', id).single()
  if (error) throw new Error(`No se encontró el servicio: ${error.message}`)
  return data
}

export async function crearServicio(db: Db, input: CrearServicioInput): Promise<Servicio> {
  const parsed = crearServicioSchema.parse(input)
  const payload: NuevoServicio = {
    nombre: parsed.nombre,
    descripcion: parsed.descripcion,
    precio_hora_base: parsed.precio_hora_base.toFixed(2),
  }
  const { data, error } = await db.from('servicio').insert(payload).select().single()
  if (error) throw new Error(`No se pudo crear el servicio: ${error.message}`)
  return data
}

export async function actualizarServicio(
  db: Db,
  id: number,
  input: ActualizarServicioInput,
): Promise<Servicio> {
  const parsed = actualizarServicioSchema.parse(input)
  const payload = {
    ...(parsed.nombre !== undefined && { nombre: parsed.nombre }),
    ...(parsed.descripcion !== undefined && { descripcion: parsed.descripcion }),
    ...(parsed.precio_hora_base !== undefined && { precio_hora_base: parsed.precio_hora_base.toFixed(2) }),
  }
  const { data, error } = await db.from('servicio').update(payload).eq('id', id).select().single()
  if (error) throw new Error(`No se pudo actualizar el servicio: ${error.message}`)
  return data
}

export async function eliminarServicio(db: Db, id: number): Promise<void> {
  const { error } = await db.from('servicio').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar el servicio: ${error.message}`)
}