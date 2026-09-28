'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { actualizarPerfil, cambiarContrasena } from '@/backend/usuarios'
import { createSession } from '@/lib/session'

export interface PerfilActionState {
  ok: boolean
  error?: string
}

export interface CambiarContrasenaState {
  ok: boolean
  error?: string
}

/** Extrae el primer mensaje legible de un error de validación zod. */
function errorVisible(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) {
    return e.issues[0]?.message ?? fallback
  }
  return e instanceof Error ? e.message : fallback
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
      error: errorVisible(e, 'No se pudo guardar el perfil.'),
    }
  }
}

/**
 * Cambia la contraseña del propio perfil (CU05).
 * El servicio verifica la contraseña actual ANTES de aplicar el cambio: si no
 * coincide lanza 'Contraseña actual incorrecta' y se cancela el cambio. El
 * evento `CAMBIAR_CONTRASENA` queda registrado en BITACORA.
 */
export async function cambiarContrasenaAction(
  _prevState: CambiarContrasenaState,
  formData: FormData,
): Promise<CambiarContrasenaState> {
  try {
    const usuario = await requireUser()

    const db = getSupabaseServiceClient()
    await cambiarContrasena(db, usuario.id, {
      contrasenaActual: String(formData.get('contrasena_actual') ?? ''),
      contrasenaNueva: String(formData.get('contrasena_nueva') ?? ''),
      confirmacion: String(formData.get('confirmacion') ?? ''),
    })

    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: errorVisible(e, 'No se pudo cambiar la contraseña.'),
    }
  }
}