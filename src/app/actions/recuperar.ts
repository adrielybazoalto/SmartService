'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { ControlRecuperarContrasena } from '@/backend/recuperar'

export interface SolicitarRecuperacionState {
  ok: boolean
  error?: string
  correo?: string
  enlace?: string
}

export interface RestablecerContrasenaState {
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
 * CU02 — Formulario 1 (mostrarFormularioEmail).
 * Solicita el enlace de recuperación. Si el correo no existe, el servicio
 * lanza 'No existe una cuenta asociada a este correo' (se muestra al usuario).
 * Envía el enlace directamente al correo electrónico del usuario mediante Nodemailer.
 */
export async function solicitarRecuperacionAction(
  _prevState: SolicitarRecuperacionState,
  formData: FormData,
): Promise<SolicitarRecuperacionState> {
  try {
    const db = getSupabaseServiceClient()
    const headerList = await headers()
    const host = headerList.get('host') || 'localhost:3000'
    const proto = headerList.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`

    const resultado = await ControlRecuperarContrasena.solicitarRecuperacion(
      db,
      {
        correo: String(formData.get('correo') ?? ''),
      },
      baseUrl,
    )

    // Por seguridad, ya no se expone el enlace directamente al cliente en el frontend
    return { ok: true, correo: resultado.correo }
  } catch (e) {
    return {
      ok: false,
      error: errorVisible(e, 'No se pudo solicitar la recuperación.'),
    }
  }
}

/**
 * CU02 — Formulario 2 (mostrarFormularioNuevaContrasena).
 * Restablece la contraseña con el token del enlace; marca el token como usado,
 * invalida sesiones previas y registra el evento en BITACORA.
 */
export async function restablecerContrasenaAction(
  _prevState: RestablecerContrasenaState,
  formData: FormData,
): Promise<RestablecerContrasenaState> {
  try {
    const db = getSupabaseServiceClient()
    await ControlRecuperarContrasena.restablecerContrasena(
      db,
      String(formData.get('token') ?? ''),
      {
        contrasena: String(formData.get('contrasena') ?? ''),
        confirmacion: String(formData.get('confirmacion') ?? ''),
      },
    )

    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      error: errorVisible(e, 'No se pudo restablecer la contraseña.'),
    }
  }
}
