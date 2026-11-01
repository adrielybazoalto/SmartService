'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import nodemailer, { type Transporter } from 'nodemailer'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
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
 * Obtiene y configura el transporter de Nodemailer leyendo las credenciales SMTP desde el entorno
 * (.env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, o sus variantes HOST, PORT, USER, PASS).
 */
export async function getEmailTransporter(): Promise<Transporter> {
  const host = process.env.SMTP_HOST || process.env.HOST || 'smtp.gmail.com'
  const port = parseInt(process.env.SMTP_PORT || process.env.PORT || '587', 10)
  const secure = process.env.SMTP_SECURE === 'true' || process.env.SECURE === 'true' || port === 465
  const user = process.env.SMTP_USER || process.env.USER
  const pass = process.env.SMTP_PASS || process.env.PASS

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? {
      user,
      pass,
    } : undefined,
  })
}

/**
 * CU02 — Formulario 1 (mostrarFormularioEmail).
 * Server Action para solicitar el enlace de recuperación.
 * Configura el transporter de Nodemailer con las variables de entorno (.env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS)
 * y ejecuta transporter.sendMail enviando el enlace de recuperación directamente al correo ingresado.
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
    const headerList = await headers()
    const hostHeader = headerList.get('host') || 'localhost:3000'
    const proto = headerList.get('x-forwarded-proto') || (hostHeader.startsWith('localhost') ? 'http' : 'https')
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || `${proto}://${hostHeader}`

    // 1. Generar token seguro en BD y construir el enlace de recuperación
    const resultado = await ControlRecuperarContrasena.solicitarRecuperacion(
      db,
      { correo },
      baseUrl,
    )

    const enlaceRecuperacion = resultado.enlace

    // 2. Configurar transporter con las variables de entorno de .env
    const host = process.env.SMTP_HOST || process.env.HOST || 'smtp.gmail.com'
    const port = parseInt(process.env.SMTP_PORT || process.env.PORT || '587', 10)
    const secure = process.env.SMTP_SECURE === 'true' || process.env.SECURE === 'true' || port === 465
    const user = process.env.SMTP_USER || process.env.USER
    const pass = process.env.SMTP_PASS || process.env.PASS
    const from = process.env.SMTP_FROM || process.env.FROM || user || 'SmartService <no-reply@smartservice.com>'

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? {
        user,
        pass,
      } : undefined,
    })

    // 3. Ejecutar el envío real del correo mediante transporter.sendMail
    await transporter.sendMail({
      from,
      to: correo,
      subject: 'Recuperación de contraseña — SmartService',
      text: `Hola,\n\nHas solicitado restablecer tu contraseña para acceder a SmartService.\n\nPuedes restablecerla ingresando al siguiente enlace:\n${enlaceRecuperacion}\n\nEste enlace caduca en 15 minutos y solo puede ser utilizado una vez.\n\nSi no realizaste esta solicitud, puedes ignorar este mensaje.\n\nAtentamente,\nEl equipo de SmartService`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <h2 style="color: #0f172a; margin-bottom: 16px;">Recuperación de contraseña</h2>
          <p style="color: #334155; font-size: 15px; line-height: 1.5;">
            Has solicitado restablecer tu contraseña en <strong>SmartService</strong> para la cuenta <strong>${correo}</strong>.
          </p>
          <div style="margin: 28px 0; text-align: center;">
            <a href="${enlaceRecuperacion}" target="_blank" style="background-color: #a3e635; color: #0f172a; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 10px; display: inline-block;">
              Restablecer contraseña
            </a>
          </div>
          <p style="color: #64748b; font-size: 13px;">
            O accede directamente mediante este enlace:<br/>
            <a href="${enlaceRecuperacion}" style="color: #65a30d; word-break: break-all;">${enlaceRecuperacion}</a>
          </p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 12px;">
            Este enlace caducará en 15 minutos y solo puede utilizarse una vez.
          </p>
        </div>
      `,
    })

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
