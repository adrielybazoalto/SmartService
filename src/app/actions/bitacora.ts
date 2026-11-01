'use server'

import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { tieneAccionModulo } from '@/lib/permisos'
import {
  listarBitacora,
  filtrarBitacoraSchema,
  type FiltrarBitacoraInput,
} from '@/backend/bitacora'

export async function listarBitacoraAction(filtros: FiltrarBitacoraInput = {}) {
  // Única condición de acceso: permiso BITACORA (LEER) en rol_funcion (BD).
  if (!(await tieneAccionModulo('BITACORA', 'LEER'))) {
    throw new Error('No autorizado: tu rol no tiene el permiso del módulo Bitácora.')
  }

  const parsed = filtrarBitacoraSchema.parse(filtros)

  const db = getSupabaseServiceClient()
  return listarBitacora(db, parsed)
}
