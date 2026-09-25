import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { User } from '@/lib/supabase/types'

/**
 * Devuelve el usuario autenticado vía Supabase Auth, o null si no hay sesión.
 * Usa el cliente de sesión (RLS por usuario).
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user
}

/**
 * Requiere sesión autenticada; lanza un error si no la hay.
 * Úsalo al inicio de los Server Actions y servicios que tocan datos.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser()
  if (!user) {
    throw new Error('No autorizado: inicia sesión para continuar.')
  }
  return user
}