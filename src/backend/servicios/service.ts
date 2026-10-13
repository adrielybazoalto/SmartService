import type { PostgrestError } from '@supabase/supabase-js'
import type { Db } from '@/lib/supabase/types'
import {
  actualizarServicioSchema,
  crearServicioSchema,
  filtrarServiciosSchema,
  type ActualizarServicioInput,
  type CrearServicioInput,
  type FiltrarServiciosInput,
} from './schema'
import type { NuevoServicio, Servicio, ServicioUpdate } from './types'

/** Traduce errores de BD a mensajes de negocio (nunca se muestra el error crudo). */
function traducirError(error: PostgrestError, accion: string): Error {
  if (error.code === '23505') return new Error('Ya existe un servicio con ese nombre')
  if (error.code === '23514') return new Error('La tarifa por hora debe ser mayor a cero')
  console.error(`Error al ${accion}:`, error)
  return new Error(`No se pudo ${accion}. Intente nuevamente.`)
}

/** Lista el catálogo; filtra por nombre (q) y por estado. */
export async function listarServicios(
  db: Db,
  filtros: FiltrarServiciosInput = {},
): Promise<Servicio[]> {
  const parsed = filtrarServiciosSchema.parse(filtros)
  let query = db.from('servicio').select('*').order('nombre', { ascending: true })

  if (parsed.q) query = query.ilike('nombre', `%${parsed.q}%`)
  if (parsed.estado === 'activos') query = query.eq('activo', true)
  if (parsed.estado === 'inactivos') query = query.eq('activo', false)

  const { data, error } = await query
  if (error) throw traducirError(error, 'cargar los servicios')
  return data
}

/** Solo servicios activos: para CU08 (cotizaciones) y CU09 (ventas). */
export async function listarServiciosActivos(db: Db): Promise<Servicio[]> {
  return listarServicios(db, { estado: 'activos' })
}

export async function getServicioPorId(db: Db, id: number): Promise<Servicio> {
  const { data, error } = await db.from('servicio').select('*').eq('id', id).single()
  if (error) {
    if (error.code === 'PGRST116') throw new Error('No se encontró el servicio')
    throw traducirError(error, 'cargar el servicio')
  }
  return data
}

export async function crearServicio(db: Db, input: CrearServicioInput): Promise<Servicio> {
  const parsed = crearServicioSchema.parse(input)
  const payload: NuevoServicio = {
    nombre: parsed.nombre,
    descripcion: parsed.descripcion || null,
    precio_hora_base: parsed.precio_hora_base.toFixed(2),
  }
  const { data, error } = await db.from('servicio').insert(payload).select().single()
  if (error) throw traducirError(error, 'crear el servicio')
  return data
}

/**
 * Modifica nombre, descripción o tarifa. El cambio de tarifa NO afecta
 * documentos ya emitidos: cada detalle guarda su propio precio_hora.
 */
export async function actualizarServicio(
  db: Db,
  id: number,
  input: ActualizarServicioInput,
): Promise<Servicio> {
  const parsed = actualizarServicioSchema.parse(input)
  const payload: ServicioUpdate = {
    ...(parsed.nombre !== undefined && { nombre: parsed.nombre }),
    ...(parsed.descripcion !== undefined && { descripcion: parsed.descripcion || null }),
    ...(parsed.precio_hora_base !== undefined && {
      precio_hora_base: parsed.precio_hora_base.toFixed(2),
    }),
  }
  if (Object.keys(payload).length === 0) throw new Error('No hay cambios para guardar')

  const { data, error } = await db.from('servicio').update(payload).eq('id', id).select().single()
  if (error) {
    if (error.code === 'PGRST116') throw new Error('No se encontró el servicio')
    throw traducirError(error, 'actualizar el servicio')
  }
  return data
}

/** Desactiva o reactiva. Un servicio nunca se elimina (puede estar en cotizaciones/ventas). */
export async function cambiarEstadoServicio(
  db: Db,
  id: number,
  activo: boolean,
): Promise<Servicio> {
  const { data, error } = await db.from('servicio').update({ activo }).eq('id', id).select().single()
  if (error) {
    if (error.code === 'PGRST116') throw new Error('No se encontró el servicio')
    throw traducirError(error, 'cambiar el estado del servicio')
  }
  return data
}