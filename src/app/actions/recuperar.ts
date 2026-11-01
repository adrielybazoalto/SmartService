'use server'

import { z } from 'zod'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { enviarCorreoRecuperacion } from '@/lib/email'
import { obtenerIpOrigen } from '@/lib/ip'
import { ControlRecuperarContrasena } from '@/backend/recuperar'

export interface SolicitarRecuperacionState {
  success?: boolean
  ok?: boolean
  error?: string
  correo?: string
  enlace?: string
  mensaje?: string
}

export interface RestablecerContrasenaState {
  success?: boolean
  ok?: boolean
  error?: string
  mensaje?: string
}

/** Extrae el primer mensaje legible de un error de validación zod o excepción general. */
function errorVisible(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) {
    return e.issues[0]?.message ?? fallback
  }
  return e instanceof Error ? e.message : fallback
}

/**
 * CU02 — Formulario 1 (mostrarFormularioEmail).
 * Server Action para solicitar el enlace de recuperación.
 * Genera el enlace con APP_URL (nunca con la cabecera Host, que la controla quien hace
 * la petición) y lo envía al correo ingresado con src/lib/email.ts.
 */
export async function solicitarRecuperacionAction(
  _prevState: SolicitarRecuperacionState,
  formData: FormData,
): Promise<SolicitarRecuperacionState> {
  try {
    const correoRaw = formData.get('correo')
    if (!correoRaw || typeof correoRaw !== 'string') {
      return {
        success: false,
        ok: false,
        error: 'Debe ingresar un correo electrónico válido.',
      }
    }

    const correo = correoRaw.trim().toLowerCase()
    if (!correo) {
      return {
        success: false,
        ok: false,
        error: 'Debe ingresar un correo electrónico válido.',
      }
    }

    const db = getSupabaseServiceClient()
    const baseUrl = process.env.APP_URL?.trim()
    if (!baseUrl) throw new Error('Falta configurar APP_URL en el servidor.')

    // 1. Generar token seguro en BD y construir el enlace de recuperación
    const resultado = await ControlRecuperarContrasena.solicitarRecuperacion(
      db,
      { correo },
      baseUrl,
      await obtenerIpOrigen(),
    )

    // 2. Envío real del correo
    await enviarCorreoRecuperacion({ para: correo, enlace: resultado.enlace })

    return {
      success: true,
      ok: true,
      correo: resultado.correo,
      mensaje: 'Enlace de recuperación enviado correctamente.',
    }
  } catch (e) {
    return {
      success: false,
      ok: false,
      error: errorVisible(e, 'No se pudo procesar la solicitud de recuperación.'),
    }
  }
}

/**
 * CU02 — Formulario 2 (mostrarFormularioNuevaContrasena).
 * Restablece la contraseña con el token del enlace; marca el token como usado,
 * invalida sesiones previas y registra el evento en BITACORA.
 * Envuelve la lógica en try/catch y devuelve { success: true } o { success: false, error: ... }.
 */
export async function restablecerContrasenaAction(
  _prevState: RestablecerContrasenaState,
  formData: FormData,
): Promise<RestablecerContrasenaState> {
  try {
    const token = String(formData.get('token') ?? '').trim()
    const contrasena = String(formData.get('contrasena') ?? '')
    const confirmacion = String(formData.get('confirmacion') ?? '')

    if (!token) {
      return {
        success: false,
        ok: false,
        error: 'Token de recuperación no válido o ausente.',
      }
    }

    const db = getSupabaseServiceClient()
    await ControlRecuperarContrasena.restablecerContrasena(
      db,
      token,
      { contrasena, confirmacion },
      await obtenerIpOrigen(),
    )

    return {
      success: true,
      ok: true,
      mensaje: 'Contraseña restablecida correctamente.',
    }
  } catch (e) {
    return {
      success: false,
      ok: false,
      error: errorVisible(e, 'No se pudo restablecer la contraseña.'),
    }
  }
}
