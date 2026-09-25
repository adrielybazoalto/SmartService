import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

export type Usuario = Tables<'usuario'>
export type NuevoUsuario = TablesInsert<'usuario'>
export type UsuarioUpdate = TablesUpdate<'usuario'>

export type Rol = Tables<'rol'>
export type NuevoRol = TablesInsert<'rol'>
export type RolUpdate = TablesUpdate<'rol'>

export type RolFuncion = Tables<'rol_funcion'>
export type NuevoRolFuncion = TablesInsert<'rol_funcion'>