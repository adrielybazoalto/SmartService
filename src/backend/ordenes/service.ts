import type { Db } from '@/lib/supabase/types'
import {
  actualizarEstadoOrdenTrabajoSchema,
  crearOrdenTrabajoSchema,
  type ActualizarEstadoOrdenTrabajoInput,
  type CrearOrdenTrabajoInput,
} from './schema'
import type {
  NuevaOrdenTrabajo,
  OrdenTrabajo,
  OrdenTrabajoUpdate,
} from './types'

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

export async function listarConsumosDeOrden(db: Db, ordenTrabajoId: number) {
  const { data, error } = await db
    .from('detalle_consumo_material')
    .select('*, producto(*)')
    .eq('orden_trabajo_id', ordenTrabajoId)
  if (error) throw new Error(`No se pudieron cargar los consumos: ${error.message}`)
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