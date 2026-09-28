import type { Tables, TablesInsert } from '@/lib/supabase/types'

export type TokenRecuperacion = Tables<'token_recuperacion'>
export type NuevoTokenRecuperacion = TablesInsert<'token_recuperacion'>

/** Respuesta de solicitarRecuperacion: enlace simulado (sin SMTP real). */
export interface EnlaceRecuperacion {
  correo: string
  enlace: string
}