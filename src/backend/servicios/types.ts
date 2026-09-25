import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

export type Servicio = Tables<'servicio'>
export type NuevoServicio = TablesInsert<'servicio'>
export type ServicioUpdate = TablesUpdate<'servicio'>