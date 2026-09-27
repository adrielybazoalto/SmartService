import { getSession } from '@/lib/session'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import type { Tables } from '@/lib/supabase/types'

/**
 * Devuelve el usuario de NEGOCIO de la sesión activa (JWT propia),
 * o null si no hay sesión válida. Carga la fila `usuario` por su id.
 */
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
  if (!data.estado) return null // usuario inactivo no puede usar el sistema
  return data
}

/**
 * Requiere sesión autenticada; lanza un error si no la hay.
 * Úsalo al inicio de los Server Actions y servicios que tocan datos.
 */
export async function requireUser(): Promise<Tables<'usuario'>> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('No autorizado: inicia sesión para continuar.')
  }
  return user
}