import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

export type Cliente = Tables<'cliente'>
export type NuevoCliente = TablesInsert<'cliente'>
export type ClienteUpdate = TablesUpdate<'cliente'>