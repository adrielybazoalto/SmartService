import type { Tables, TablesInsert } from '@/lib/supabase/types'

export type TokenRecuperacion = Tables<'token_recuperacion'>
export type NuevoTokenRecuperacion = TablesInsert<'token_recuperacion'>

/** Respuesta de solicitarRecuperacion: datos para el envío del enlace de recuperación. */
export interface EnlaceRecuperacion {
  correo: string
  enlace: string
}
