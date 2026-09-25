import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

/**
 * Cliente Supabase de SESIÓN para el servidor (@supabase/ssr).
 * Usa las cookies del usuario autenticado → las políticas RLS con
 * `auth.uid()` se aplican por usuario. Debe llamarse dentro de un
 * contexto de request (Server Action, Route Handler, Server Component).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.',
    )
  }

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Llamado desde un Server Component: la sesión se refresca
          // automáticamente en Server Actions / Route Handlers.
        }
      },
    },
  })
}