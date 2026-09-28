import type { Db } from '@/lib/supabase/types'
import {
  registrarBitacoraSchema,
  type RegistrarBitacoraInput,
} from './schema'
import type { Bitacora, NuevaBitacora } from './types'

/**
 * Inserta un evento de auditoría en BITACORA.
 * Obligatorio en operaciones sensibles (CU05: ACTUALIZAR_PERFIL; CU06: auditoría).
 * `fecha_hora` se completa automáticamente con CURRENT_TIMESTAMP.
 */
export async function registrarBitacora(
  db: Db,
  input: RegistrarBitacoraInput,
): Promise<Bitacora> {
  const parsed = registrarBitacoraSchema.parse(input)

  const { data, error } = await db
    .from('bitacora')
    .insert(parsed as NuevaBitacora)
    .select()
    .single()
  if (error) throw new Error(`No se pudo registrar en la bitácora: ${error.message}`)
  return data
}