import { createHash, randomBytes } from 'crypto'
import type { Db } from '@/lib/supabase/types'
import { hashContrasena } from '@/lib/password'
import { registrarBitacora } from '@/backend/bitacora'
import { GestorSesiones } from '@/lib/sesiones'
import {
  nuevaContrasenaSchema,
  solicitarRecuperacionSchema,
  type NuevaContrasenaInput,
  type SolicitarRecuperacionInput,
} from './schema'
import type { EnlaceRecuperacion, TokenRecuperacion } from './types'

/** Vigencia del enlace de recuperación (minutos). */
const VIGENCIA_MINUTOS = 15

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function crearTokenSeguro(): string {
  return randomBytes(32).toString('hex')
}

/** Simula el envío del correo (no hay SMTP): registra el enlace en el log. */
function enviarCorreoRecuperacion(correo: string, enlace: string): void {
  console.log(`[SIMULADOR-CORREO] Enlace de recuperación para ${correo}: ${enlace}`)
}

/**
 * ControlRecuperarContrasena (CU02).
 * Middleware entre la IURecuperarContrasena y los datos: valida, genera el
 * token seguro, verifica el enlace y restablece la contraseña registrando la
 * acción en la BITACORA (CU06) e invalidando las sesiones previas.
 */
export class ControlRecuperarContrasena {
  /**
   * 1) Solicita el enlace: si el correo no está registrado lanza la excepción
   * 'No existe una cuenta asociada a este correo'. Si existe, genera un token
   * seguro con expiración limitada, lo guarda en TOKEN_RECUPERACION (solo su
   * hash) y simula el envío del correo.
   */
  static async solicitarRecuperacion(
    db: Db,
    input: SolicitarRecuperacionInput,
  ): Promise<EnlaceRecuperacion> {
    const { correo: correoRaw } = solicitarRecuperacionSchema.parse(input)
    const correo = correoRaw.trim().toLowerCase()

    const { data: usuario, error } = await db
      .from('usuario')
      .select('*')
      .eq('correo', correo)
      .maybeSingle()
    if (error) throw new Error('No se pudo consultar el usuario.')
    if (!usuario) throw new Error('No existe una cuenta asociada a este correo')

    const token = crearTokenSeguro()
    const expira = new Date(Date.now() + VIGENCIA_MINUTOS * 60_000).toISOString()

    const { error: errInsercion } = await db.from('token_recuperacion').insert({
      usuario_id: usuario.id,
      hash_token: hashToken(token),
      fecha_expiracion: expira,
    })
    if (errInsercion) {
      throw new Error(`No se pudo guardar el token de recuperación: ${errInsercion.message}`)
    }

    await registrarBitacora(db, {
      usuario_id: usuario.id,
      accion: 'SOLICITAR_RECUPERACION',
      descripcion: `Solicitud de recuperación de contraseña para ${correo}`,
    })

    const enlace = `/recuperar?token=${token}`
    enviarCorreoRecuperacion(correo, enlace)
    return { correo, enlace }
  }

  /**
   * 2) Verifica el enlace: el token debe existir, estar vigente (estaVigente)
   * y no haber sido consumido (usado == false). Si no, lanza la excepción
   * 'Enlace expirado, reinicie el proceso'.
   */
  static async verificarEnlace(db: Db, token: string): Promise<TokenRecuperacion> {
    const { data, error } = await db
      .from('token_recuperacion')
      .select('*')
      .eq('hash_token', hashToken(token))
      .maybeSingle()

    if (error) throw new Error('No se pudo validar el enlace de recuperación.')
    if (!data || data.usado) throw new Error('Enlace expirado, reinicie el proceso')

    /** estaVigente(): comprueba que no haya caducado. */
    const vigente = new Date(data.fecha_expiracion).getTime() > Date.now()
    if (!vigente) throw new Error('Enlace expirado, reinicie el proceso')

    return data
  }

  /**
   * 3) Restablece la contraseña: valida el formato, aplica hash bcrypt y
   * actualiza la contraseña del usuario, marca el token como usado
   * (marcarComoUsado), invalida las sesiones previas (GestorSesiones) y
   * registra el evento RECUPERAR_CONTRASENA en la BITACORA (CU06).
   */
  static async restablecerContrasena(
    db: Db,
    token: string,
    input: NuevaContrasenaInput,
  ): Promise<void> {
    const registro = await ControlRecuperarContrasena.verificarEnlace(db, token)
    const parsed = nuevaContrasenaSchema.parse(input)

    const hash = await hashContrasena(parsed.contrasena)
    const { error: errContrasena } = await db
      .from('usuario')
      .update({ contrasena: hash })
      .eq('id', registro.usuario_id)
    if (errContrasena) {
      throw new Error(`No se pudo actualizar la contraseña: ${errContrasena.message}`)
    }

    // Invalida las sesiones emitidas antes del cambio
    await GestorSesiones.invalidarSesiones(db, registro.usuario_id)

    // marcarComoUsado(): el enlace no se puede reutilizar
    const { error: errToken } = await db
      .from('token_recuperacion')
      .update({ usado: true })
      .eq('id', registro.id)
    if (errToken) {
      throw new Error(`No se pudo marcar el token como usado: ${errToken.message}`)
    }

    await registrarBitacora(db, {
      usuario_id: registro.usuario_id,
      accion: 'RECUPERAR_CONTRASENA',
      descripcion: 'Contraseña restablecida mediante enlace de recuperación (CU02)',
    })
  }
}