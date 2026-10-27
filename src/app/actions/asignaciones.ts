'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { tienePermisoModulo } from '@/lib/permisos'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { registrarEvento } from '@/backend/bitacora'
import type { Db } from '@/lib/supabase/types'
import {
  asignarCuadrilla,
  filtrarOrdenesSchema,
  guardarCuadrillaSchema,
  listarOrdenes,
  modificarCuadrilla,
  obtenerOrdenConTecnicos,
  type FiltrarOrdenesInput,
  type GuardarCuadrillaInput,
} from '@/backend/asignaciones'

const RUTA = '/asignar-tecnicos'
const MSG_NO_AUTORIZADO = 'No autorizado: tu rol no tiene el permiso del módulo Asignar técnicos.'

export type ResultadoAsignacion = { ok: true } | { ok: false; error: string }

/** Bitácora (CU06): un fallo de auditoría no interrumpe la operación. La IP la resuelve registrarEvento. */
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

export async function listarOrdenesAction(filtros: FiltrarOrdenesInput = {}) {
  if (!(await tienePermisoModulo(RUTA))) throw new Error(MSG_NO_AUTORIZADO)
  const parsed = filtrarOrdenesSchema.parse(filtros)
  return listarOrdenes(getSupabaseServiceClient(), parsed)
}

export async function obtenerOrdenConTecnicosAction(ordenId: number) {
  if (!(await tienePermisoModulo(RUTA))) throw new Error(MSG_NO_AUTORIZADO)
  if (!Number.isInteger(ordenId) || ordenId <= 0) throw new Error('Orden no válida.')
  return obtenerOrdenConTecnicos(getSupabaseServiceClient(), ordenId)
}

async function ejecutar(
  data: GuardarCuadrillaInput,
  modo: 'ASIGNAR' | 'MODIFICAR',
): Promise<ResultadoAsignacion> {
  const usuario = await requireUser()
  if (!(await tienePermisoModulo(RUTA))) return { ok: false, error: MSG_NO_AUTORIZADO }

  const parsed = guardarCuadrillaSchema.safeParse(data)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos.' }
  }

  try {
    const db = getSupabaseServiceClient()
    const r =
      modo === 'ASIGNAR' ? await asignarCuadrilla(db, parsed.data) : await modificarCuadrilla(db, parsed.data)

    const base = `orden ${r.orden.codigo_orden} (ID ${r.orden.id})`
    await auditar(
      db,
      usuario.id,
      modo === 'ASIGNAR' ? 'ASIGNAR_CUADRILLA' : 'MODIFICAR_CUADRILLA',
      modo === 'ASIGNAR'
        ? `Se asignó la cuadrilla de la ${base}: ${r.nombres.join(', ')}; líder: ${r.liderNombre}`
        : `Se modificó la cuadrilla de la ${base}: antes [${r.anteriores.join(', ')}] → ahora [${r.nombres.join(', ')}]; líder: ${r.liderNombre}`,
    )
    revalidatePath(RUTA)
    revalidatePath(`${RUTA}/${r.orden.id}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: mensajeDe(e) }
  }
}

export async function asignarCuadrillaAction(data: GuardarCuadrillaInput) {
  return ejecutar(data, 'ASIGNAR')
}

export async function modificarCuadrillaAction(data: GuardarCuadrillaInput) {
  return ejecutar(data, 'MODIFICAR')
}
