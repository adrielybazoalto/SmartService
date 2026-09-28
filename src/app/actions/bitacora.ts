'use server'

import { requireRole } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import {
  listarBitacora,
  filtrarBitacoraSchema,
  type FiltrarBitacoraInput,
} from '@/backend/bitacora'

export async function listarBitacoraAction(filtros: FiltrarBitacoraInput = {}) {
  await requireRole('ADMINISTRADOR')

  const parsed = filtrarBitacoraSchema.parse(filtros)

  const db = getSupabaseServiceClient()
  return listarBitacora(db, parsed)
}