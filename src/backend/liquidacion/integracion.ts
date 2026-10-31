import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/auth'
import { obtenerIpOrigen } from '@/lib/ip'
import { headers } from 'next/headers'
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

/**
 * Dirección del sistema (http://localhost:3000 o la de Vercel), para que
 * Stripe sepa a dónde devolver al cliente después de pagar.
 * Se puede fijar con APP_URL en .env.local / Vercel.
 */
export async function obtenerUrlBase(): Promise<string> {
  const fija = process.env.APP_URL?.trim();
  if (fija) return fija.replace(/\/+$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const protocolo = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)/.test(host) ? "http" : "https");
  return `${protocolo}://${host}`;
}

/** IP de origen de la petición (la obtiene el servidor, nunca el usuario). */
export async function obtenerIpCliente(): Promise<string | null> {
  try {
    return await obtenerIpOrigen()
  } catch {
    return null
  }
}
