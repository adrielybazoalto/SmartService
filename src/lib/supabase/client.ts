'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

let client: SupabaseClient<Database> | null = null

/**
 * Cliente Supabase para el NAVEGADOR (anon key, sesión por cookies).
 * Lazy: se crea en la primera llamada.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.',
    )
  }

  client = createBrowserClient<Database>(url, anonKey)
  return client
}