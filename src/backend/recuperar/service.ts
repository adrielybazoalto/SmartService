import { createHash, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Db } from '@/lib/supabase/types'
import { hashContrasena } from '@/lib/password'
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
   * hash) y genera el enlace para el envío por correo.
   */
  static async solicitarRecuperacion(
    db: Db,
    input: SolicitarRecuperacionInput,
    baseUrl?: string,
    ip: string | null = null,
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
    // Límite de 60 s, enlaces anteriores invalidados y bitácora, en una transacción
    const { error: errToken } = await (db as unknown as SupabaseClient).rpc('fn_registrar_token_recuperacion', {
      p_usuario_id: usuario.id,
      p_hash_token: hashToken(token),
      p_minutos: VIGENCIA_MINUTOS,
      p_correo: correo,
      p_ip: ip,
    })
    if (errToken) throw new Error(errToken.message)

    const enlaceRelativo = `/recuperar?token=${token}`
    const enlaceCompleto = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}${enlaceRelativo}`
      : enlaceRelativo

    return { correo, enlace: enlaceCompleto }
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
   * 3) Restablece la contraseña: valida el formato y aplica hash bcrypt. La
   * actualización, el token usado, las sesiones invalidadas y el evento
   * RECUPERAR_CONTRASENA van en una transacción (fn_restablecer_contrasena).
   */
  static async restablecerContrasena(
    db: Db,
    token: string,
    input: NuevaContrasenaInput,
    ip: string | null = null,
  ): Promise<void> {
    await ControlRecuperarContrasena.verificarEnlace(db, token)
    const parsed = nuevaContrasenaSchema.parse(input)

    const hash = await hashContrasena(parsed.contrasena)
    const { error } = await (db as unknown as SupabaseClient).rpc('fn_restablecer_contrasena', {
      p_hash_token: hashToken(token),
      p_contrasena: hash,
      p_ip: ip,
    })
    if (error) throw new Error(error.message)
  }
}
