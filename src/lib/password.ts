import bcrypt from 'bcryptjs'
import { z } from 'zod'

/** Costo del hash bcrypt (10 = ~100 ms, recomendado para serverless). */
export const COSTO_BCRYPT = 10

/**
 * Regla de contraseña exigida al crear/actualizar credenciales.
 * bcrypt procesa solo los primeros 72 bytes → se valida también por bytes.
 */
export const contrasenaSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(72, 'La contraseña no puede superar los 72 caracteres')
  .refine((p) => /[A-Z]/.test(p), 'Debe incluir al menos una letra mayúscula')
  .refine((p) => /\d/.test(p), 'Debe incluir al menos un número')
  .refine(
    (p) => Buffer.byteLength(p, 'utf8') <= 72,
    'La contraseña supera el límite de 72 bytes de bcrypt',
  )

/** Genera el hash bcrypt de una contraseña (nunca se guarda el texto plano). */
export async function hashContrasena(contrasena: string): Promise<string> {
  return bcrypt.hash(contrasena, COSTO_BCRYPT)
}

/** Compara una contraseña en texto plano contra su hash bcrypt. */
export async function verificarContrasena(
  contrasena: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(contrasena, hash)
}