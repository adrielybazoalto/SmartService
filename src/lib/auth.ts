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
/**
 * Requiere que el usuario autenticado tenga uno de los roles indicados.
 * RLS (ver auth_bridge.sql) permite a cualquier `authenticated` leer/escribir;
 * el filtro fino por rol se hace aquí, en la capa de aplicación.
 */
export async function requireRole(...rolesPermitidos: string[]): Promise<User> {
  const user = await requireUser()

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase
    .from('usuario')
    .select('rol:rol_id(nombre)')
    .eq('auth_uid', user.id)
    .single()

  if (error || !data) {
    throw new Error('No autorizado: no se encontró el perfil de usuario.')
  }

  const nombreRol = data.rol?.nombre
  if (!nombreRol || !rolesPermitidos.includes(nombreRol)) {
    throw new Error('No autorizado: tu rol no tiene acceso a esta función.')
  }

  return user
}