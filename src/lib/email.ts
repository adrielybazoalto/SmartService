import 'server-only'
import nodemailer, { type Transporter } from 'nodemailer'

export interface EnviarCorreoRecuperacionParams {
  para: string
  enlace: string
}

/**
 * Transporte de Nodemailer con las variables SMTP_* del entorno. No usa HOST, PORT ni
 * USER: esos nombres los define también el sistema operativo o la plataforma.
 */
export function getEmailTransporter(): Transporter {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? {
      user,
      pass,
    } : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  })
}

/**
 * Envía el correo electrónico real con el enlace de recuperación de contraseña usando Nodemailer.
 */
export async function enviarCorreoRecuperacion({ para, enlace }: EnviarCorreoRecuperacionParams): Promise<void> {
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const remitente = process.env.SMTP_FROM || user || 'SmartService <no-reply@smartservice.com>'

  // El enlace da acceso a la cuenta: nunca se escribe en el log
  if (!user || !pass) {
    throw new Error('El envío de correo no está configurado. Contacte al administrador.')
  }

  const transporter = getEmailTransporter()

  await Promise.race([
    transporter.sendMail({
      from: remitente,
      to: para,
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
            Hola, hemos recibido una solicitud para restablecer la contraseña de tu cuenta asociada al correo <strong>${para}</strong>.
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
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tiempo de espera agotado al conectar con el servidor SMTP')), 6000)
    ),
  ])
}
