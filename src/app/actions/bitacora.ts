'use server'

import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { tienePermisoModulo } from '@/lib/permisos'
import {
  listarBitacora,
  filtrarBitacoraSchema,
  type FiltrarBitacoraInput,
} from '@/backend/bitacora'

export async function listarBitacoraAction(filtros: FiltrarBitacoraInput = {}) {
  // Única condición de acceso: permiso BITACORA activo en rol_permiso (BD).
  if (!(await tienePermisoModulo('/bitacora'))) {
    throw new Error('No autorizado: tu rol no tiene el permiso del módulo Bitácora.')
  }

  const parsed = filtrarBitacoraSchema.parse(filtros)

  const db = getSupabaseServiceClient()
  return listarBitacora(db, parsed)
}