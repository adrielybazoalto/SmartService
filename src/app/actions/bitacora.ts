'use server'

import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { tienePermisoModulo } from '@/lib/permisos'
import { obtenerIpOrigen } from '@/lib/ip'
import {
  listarBitacora,
  filtrarBitacoraSchema,
  type FiltrarBitacoraInput,
} from '@/backend/bitacora'

export async function listarBitacoraAction(filtros: FiltrarBitacoraInput = {}) {
  // Única condición de acceso: permiso BITACORA (LEER) en rol_funcion (BD).
  if (!(await tienePermisoModulo('/bitacora'))) {
    throw new Error('No autorizado: tu rol no tiene el permiso del módulo Bitácora.')
  }

  const parsed = filtrarBitacoraSchema.parse(filtros)

  const db = getSupabaseServiceClient()
  return listarBitacora(db, parsed)
}

export async function registrarBitacoraAction(
  usuarioId: number | null,
  accion: string,
  descripcion: string,
  ip?: string | null
) {
  const db = getSupabaseServiceClient()
  const ipOrigen = (ip && ip.trim()) ? ip.trim() : (await obtenerIpOrigen())

  const { error } = await db.from('bitacora').insert({
    usuario_id: usuarioId as number,
    accion: accion,
    descripcion: descripcion,
    ip: ipOrigen,
    fecha_hora: new Date().toISOString(),
  } as any)

  if (error) {
    console.error('Error al registrar en bitácora:', error)
  }
}