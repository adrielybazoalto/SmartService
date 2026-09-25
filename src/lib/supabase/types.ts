import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Database } from './database.types'

/** Cliente tipado de Supabase usado por toda la capa de servicios. */
export type Db = SupabaseClient<Database>

/** Fila (Row) de una tabla pública. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

/** Fila de inserción (Insert) de una tabla pública. */
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

/** Fila de actualización (Update) de una tabla pública. */
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

export type { User }