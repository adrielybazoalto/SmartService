import { cache } from 'react'
import { getSession } from '@/lib/session'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import type { Tables } from '@/lib/supabase/types'

/** Usuario autenticado con su rol (leído de la BD en cada petición). */
export type UsuarioConRol = Tables<'usuario'> & {
  rol: { id: number; nombre: string } | null
}

/**
 * Memoizado por request (React cache): dentro de una misma renderización o
 * Server Action se consulta a la BD una sola vez, aunque varios módulos
 * (navbar, dashboard, actions) lo llamen.
 */
export const getCurrentUser = cache(async (): Promise<UsuarioConRol | null> => {
  const sesion = await getSession()
  if (!sesion) return null

  const db = getSupabaseServiceClient()
  const { data, error } = await db
    .from('usuario')
    .select('*, rol:rol_id(id, nombre)')
    .eq('id', sesion.uid)
    .maybeSingle()

  if (error || !data) return null
  if (!data.estado) return null
  // Sesión emitida antes de la última invalidación (CU02) → ya no es válida
  if (sesion.version !== data.version_sesion) return null
  return data
})

export async function requireUser(): Promise<UsuarioConRol> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('No autorizado: inicia sesión para continuar.')
  }
  return user
}