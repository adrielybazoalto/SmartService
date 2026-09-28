'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { actualizarPerfil } from '@/backend/usuarios'
import { createSession } from '@/lib/session'

export interface PerfilActionState {
  ok: boolean
  error?: string
}

/**
 * CU05 — Configuración de Perfil Personal.
 * Actualiza nombre y teléfono del usuario autenticado (el correo es de solo
 * lectura). El servicio registra el evento `ACTUALIZAR_PERFIL` en BITACORA.
 * Al final se refresca la cookie JWT para que refleje el nombre nuevo.
 */
export async function actualizarPerfilAction(
  _prevState: PerfilActionState,
  formData: FormData,
): Promise<PerfilActionState> {
  try {
    const usuario = await requireUser()

    const telefono = String(formData.get('telefono') ?? '').trim() || null

    const db = getSupabaseServiceClient()
    const actualizado = await actualizarPerfil(db, usuario.id, {
      nombre: String(formData.get('nombre') ?? '').trim(),
      telefono,
    })

    // Refresca la cookie de sesión con los datos actualizados
    await createSession({
      uid: actualizado.id,
      nombre: actualizado.nombre,
      correo: actualizado.correo,
      rol_id: actualizado.rol_id,
    })

    revalidatePath('/perfil')
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'No se pudo guardar el perfil.',
    }
  }
}