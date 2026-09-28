'use server'

import { requireRole } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  listarBitacora,
  filtrarBitacoraSchema,
  type FiltrarBitacoraInput,
} from '@/backend/bitacora'

export async function listarBitacoraAction(filtros: FiltrarBitacoraInput = {}) {
  await requireRole('ADMINISTRADOR')

  const parsed = filtrarBitacoraSchema.parse(filtros)

  const supabase = await createSupabaseServerClient()
  return listarBitacora(supabase, parsed)
}