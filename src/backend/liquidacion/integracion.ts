import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/auth'
import { obtenerIpOrigen } from '@/lib/ip'
import type { UsuarioSesion } from './types'

// =====================================================================
//  CU13 - Integración con src/lib (mismas funciones que usan CU11 y CU12)
//   - Cliente de Supabase  -> getSupabaseServiceClient()  (lib/supabase/service)
//   - Usuario de la sesión -> getCurrentUser()            (lib/auth, login propio CU01)
//   - IP de origen         -> obtenerIpOrigen()           (lib/ip, regla del CU06)
// =====================================================================

/** Cliente de Supabase del servidor (el mismo que usan los demás módulos). */
export function obtenerClienteSupabase(): SupabaseClient {
  return getSupabaseServiceClient() as unknown as SupabaseClient
}

/** Usuario autenticado con su rol, o null si no hay sesión válida. */
export async function obtenerUsuarioSesion(): Promise<UsuarioSesion | null> {
  const usuario = await getCurrentUser()
  if (!usuario) return null
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol?.nombre ?? null,
    activo: usuario.estado !== false,
  }
}

/** IP de origen de la petición (la obtiene el servidor, nunca el usuario). */
export async function obtenerIpCliente(): Promise<string | null> {
  try {
    return await obtenerIpOrigen()
  } catch {
    return null
  }
}
