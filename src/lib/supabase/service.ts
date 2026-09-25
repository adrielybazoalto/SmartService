import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

let client: SupabaseClient<Database> | null = null

/**
 * Cliente Supabase con SERVICE ROLE KEY para el servidor.
 * BYPASSA las políticas RLS: reservado EXCLUSIVAMENTE para tareas
 * privilegiadas de administración (crear usuarios, tareas internas).
 * NUNCA en Server Actions que reciban input del cliente directamente.
 */
export function getSupabaseServiceClient(): SupabaseClient<Database> {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.',
    )
  }

  client = createClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
  return client
}