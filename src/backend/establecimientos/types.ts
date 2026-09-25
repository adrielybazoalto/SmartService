import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

export type Establecimiento = Tables<'establecimiento'>
export type NuevoEstablecimiento = TablesInsert<'establecimiento'>
export type EstablecimientoUpdate = TablesUpdate<'establecimiento'>

export type SistemaInstalado = Tables<'sistema_instalado'>
export type NuevoSistemaInstalado = TablesInsert<'sistema_instalado'>
export type SistemaInstaladoUpdate = TablesUpdate<'sistema_instalado'>