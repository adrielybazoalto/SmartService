'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import nodemailer, { type Transporter } from 'nodemailer'
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
 * Obtiene el transporte de Nodemailer leyendo las credenciales SMTP directamente
 * del archivo .env (soporta HOST, PORT, USER, PASS, así como SMTP_HOST, SMTP_PORT, etc.).
 */
export function getEmailTransporter(): Transporter {
  const host = process.env.HOST || process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = parseInt(process.env.PORT || process.env.SMTP_PORT || '587', 10)
  const secure = process.env.SECURE === 'true' || process.env.SMTP_SECURE === 'true' || port === 465
  const user = process.env.USER || process.env.SMTP_USER
  const pass = process.env.PASS || process.env.SMTP_PASS

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
 * Envío real del correo electrónico con el enlace de recuperación usando Nodemailer.
 */
export async function enviarCorreoRecuperacion(correo: string, enlace: string): Promise<void> {
  const transporter = getEmailTransporter()
  const user = process.env.USER || process.env.SMTP_USER
  const from = process.env.FROM || process.env.SMTP_FROM || user || 'SmartService <no-reply@smartservice.com>'

  await transporter.sendMail({
    from,
    to: correo,
    subject: 'Recuperación de contraseña — SmartService',
    text: `Hola,

Has solicitado restablecer tu contraseña para tu cuenta en SmartService.

Para continuar con el restablecimiento, accede al siguiente enlace:
${enlace}

Este enlace es válido por 15 minutos y solo puede ser utilizado una vez.

Si no has solicitado este cambio, por favor ignora este mensaje.

Atentamente,
El equipo de SmartService`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px;">
        <div style="margin-bottom: 24px; text-align: center;">
          <h2 style="color: #0f172a; margin: 0 0 8px 0; font-size: 24px; font-weight: 700;">Recuperación de contraseña</h2>
          <p style="color: #64748b; font-size: 14px; margin: 0;">SmartService</p>
        </div>
        <p style="color: #334155; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
          Hola, hemos recibido una solicitud para restablecer la contraseña de tu cuenta asociada al correo <strong>${correo}</strong>.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${enlace}" target="_blank" style="display: inline-block; background-color: #a3e635; color: #0f172a; padding: 14px 28px; border-radius: 14px; font-weight: 700; font-size: 15px; text-decoration: none; box-shadow: 0 4px 14px rgba(163, 230, 53, 0.4);">
            Restablecer mi contraseña
          </a>
        </div>
        <p style="color: #64748b; font-size: 13px; line-height: 1.5; margin: 0 0 16px 0;">
          Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:<br />
          <a href="${enlace}" style="color: #65a30d; word-break: break-all;">${enlace}</a>
        </p>
        <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; color: #94a3b8; font-size: 12px; line-height: 1.5;">
          <p style="margin: 0 0 6px 0;">Este enlace caducará en <strong>15 minutos</strong> y solo puede ser utilizado una sola vez.</p>
          <p style="margin: 0;">Si no solicitaste este cambio, puedes ignorar este correo de forma segura. Tu contraseña actual permanecerá intacta.</p>
        </div>
      </div>
    `,
  })
}

/**
 * CU02 — Formulario 1 (mostrarFormularioEmail).
 * Solicita el enlace de recuperación y realiza el envío real por correo electrónico
 * usando Nodemailer configurado con las variables SMTP del entorno (.env).
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
