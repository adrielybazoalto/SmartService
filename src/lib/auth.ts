import { getSession } from '@/lib/session'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import type { Tables } from '@/lib/supabase/types'

export async function getCurrentUser(): Promise<Tables<'usuario'> | null> {
  const sesion = await getSession()
  if (!sesion) return null

  const db = getSupabaseServiceClient()
  const { data, error } = await db
    .from('usuario')
    .select('*')
    .eq('id', sesion.uid)
    .maybeSingle()

  if (error || !data) return null
  if (!data.estado) return null
  // Sesión emitida antes de la última invalidación (CU02) → ya no es válida
  if (sesion.version !== data.version_sesion) return null
  return data
}

export async function requireUser(): Promise<Tables<'usuario'>> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('No autorizado: inicia sesión para continuar.')
  }
  return user
}

/**
 * Requiere que el usuario autenticado tenga uno de los roles indicados.
 * El service role client bypasea RLS; el filtro fino por rol vive aquí.
 */
export async function requireRole(...rolesPermitidos: string[]): Promise<Tables<'usuario'>> {
  const user = await requireUser()

  const db = getSupabaseServiceClient()
  const { data, error } = await db
    .from('rol')
    .select('nombre')
    .eq('id', user.rol_id)
    .maybeSingle()

  if (error || !data) {
    throw new Error('No autorizado: no se encontró el rol del usuario.')
  }

  if (!rolesPermitidos.includes(data.nombre)) {
    throw new Error('No autorizado: tu rol no tiene acceso a esta función.')
  }

  return user
}