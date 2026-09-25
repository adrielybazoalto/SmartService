'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

/**
 * Cliente Supabase para el NAVEGADOR (anon key).
 * Lazy: se crea en la primera llamada para no lanzar errores si
 * las variables de entorno aún no están configuradas.
 */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local',
    )
  }

  client = createClient(url, anonKey)
  return client
}