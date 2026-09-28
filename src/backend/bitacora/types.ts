import type { Tables, TablesInsert } from '@/lib/supabase/types'

export type Bitacora = Tables<'bitacora'>
export type NuevaBitacora = TablesInsert<'bitacora'>
export type NuevoEventoBitacora = TablesInsert<'bitacora'>
// Sin BitacoraUpdate: la tabla es inmutable, no se permite editar registros.