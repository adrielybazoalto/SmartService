'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { tienePermisoModulo } from '@/lib/permisos'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { registrarEvento } from '@/backend/bitacora'
import type { Db } from '@/lib/supabase/types'
import {
  actualizarServicio,
  actualizarServicioSchema,
  cambiarEstadoServicio,
  crearServicio,
  crearServicioSchema,
  filtrarServiciosSchema,
  getServicioPorId,
  listarServicios,
  type ActualizarServicioInput,
  type CrearServicioInput,
  type FiltrarServiciosInput,
} from '@/backend/servicios'

const RUTA = '/servicios'
const MSG_NO_AUTORIZADO = 'No autorizado: tu rol no tiene el permiso del módulo Servicios.'

export type ResultadoServicio = { ok: true } | { ok: false; error: string }

const tarifa = (valor: string | number) => Number(valor).toFixed(2)

/** Bitácora (CU06): un fallo de auditoría no interrumpe la operación. */
async function auditar(db: Db, usuarioId: number, accion: string, descripcion: string) {
  try {
    await registrarEvento(db, { usuario_id: usuarioId, accion, descripcion })
  } catch (e) {
    console.error('Error al registrar en bitácora:', e)
  }
}

function mensajeDe(e: unknown): string {
  return e instanceof Error ? e.message : 'Ocurrió un error inesperado.'
}

export async function listarServiciosAction(filtros: FiltrarServiciosInput = {}) {
  if (!(await tienePermisoModulo(RUTA))) throw new Error(MSG_NO_AUTORIZADO)
  const parsed = filtrarServiciosSchema.parse(filtros)
  return listarServicios(getSupabaseServiceClient(), parsed)
}

export async function crearServicioAction(data: CrearServicioInput): Promise<ResultadoServicio> {
  const usuario = await requireUser()
  if (!(await tienePermisoModulo(RUTA))) return { ok: false, error: MSG_NO_AUTORIZADO }

  const parsed = crearServicioSchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  try {
    const db = getSupabaseServiceClient()
    const servicio = await crearServicio(db, parsed.data)
    await auditar(
      db,
      usuario.id,
      'CREAR_SERVICIO',
      `Se creó el servicio "${servicio.nombre}" (ID ${servicio.id}) con tarifa ${tarifa(servicio.precio_hora_base)} por hora`,
    )
    revalidatePath(RUTA)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensajeDe(e) }
  }
}

export async function actualizarServicioAction(
  id: number,
  data: ActualizarServicioInput,
): Promise<ResultadoServicio> {
  const usuario = await requireUser()
  if (!(await tienePermisoModulo(RUTA))) return { ok: false, error: MSG_NO_AUTORIZADO }
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'Servicio no válido.' }

  const parsed = actualizarServicioSchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  try {
    const db = getSupabaseServiceClient()
    const antes = await getServicioPorId(db, id)
    const despues = await actualizarServicio(db, id, parsed.data)

    const cambios: string[] = []
    if (antes.nombre !== despues.nombre) {
      cambios.push(`nombre "${antes.nombre}" → "${despues.nombre}"`)
    }
    if (Number(antes.precio_hora_base) !== Number(despues.precio_hora_base)) {
      cambios.push(
        `tarifa ${tarifa(antes.precio_hora_base)} → ${tarifa(despues.precio_hora_base)}`,
      )
    }
    if ((antes.descripcion ?? '') !== (despues.descripcion ?? '')) {
      cambios.push('descripción')
    }

    await auditar(
      db,
      usuario.id,
      'MODIFICAR_SERVICIO',
      `Se modificó el servicio ID ${id}` + (cambios.length ? `: ${cambios.join('; ')}` : ''),
    )
    revalidatePath(RUTA)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensajeDe(e) }
  }
}

export async function cambiarEstadoServicioAction(
  id: number,
  activo: boolean,
): Promise<ResultadoServicio> {
  const usuario = await requireUser()
  if (!(await tienePermisoModulo(RUTA))) return { ok: false, error: MSG_NO_AUTORIZADO }
  if (!Number.isInteger(id) || id <= 0 || typeof activo !== 'boolean') {
    return { ok: false, error: 'Datos no válidos.' }
  }

  try {
    const db = getSupabaseServiceClient()
    const servicio = await cambiarEstadoServicio(db, id, activo)
    await auditar(
      db,
      usuario.id,
      'CAMBIAR_ESTADO_SERVICIO',
      `Se ${activo ? 'reactivó' : 'desactivó'} el servicio "${servicio.nombre}" (ID ${id})`,
    )
    revalidatePath(RUTA)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensajeDe(e) }
  }
}