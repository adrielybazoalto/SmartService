import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/auth'
import { obtenerIpOrigen } from '@/lib/ip'
import type { UsuarioSesion } from './types'

// =====================================================================
//  CU20 - Integración con src/lib (las mismas funciones que usa el CU13)
// =====================================================================

export function obtenerClienteSupabase(): SupabaseClient {
  return getSupabaseServiceClient() as unknown as SupabaseClient
}

export async function obtenerUsuarioSesion(): Promise<UsuarioSesion | null> {
  const usuario = await getCurrentUser()
  if (!usuario) return null
  return { id: usuario.id, nombre: usuario.nombre, activo: usuario.estado !== false }
}

/** IP de origen de la petición (la obtiene el servidor, nunca el usuario). */
export async function obtenerIpCliente(): Promise<string | null> {
  try {
    return await obtenerIpOrigen()
  } catch {
    return null
  }
}
