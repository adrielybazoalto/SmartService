import { z } from 'zod'
import { contrasenaSchema } from '@/lib/password'

/** Formulario 1 (IURecuperarContrasena): correo registrado. */
export const solicitarRecuperacionSchema = z.object({
  correo: z
    .string()
    .min(1, 'El correo es obligatorio')
    .email('Ingresa un correo válido'),
})

/**
 * Formulario 2: nueva contraseña con confirmación.
 * Aplica las mismas reglas de `contrasenaSchema` que el resto del sistema.
 */
export const nuevaContrasenaSchema = z
  .object({
    contrasena: contrasenaSchema,
    confirmacion: z.string().min(1, 'Confirma la nueva contraseña'),
  })
  .refine((d) => d.contrasena === d.confirmacion, {
    message: 'La confirmación no coincide con la nueva contraseña',
    path: ['confirmacion'],
  })

export type SolicitarRecuperacionInput = z.infer<typeof solicitarRecuperacionSchema>
export type NuevaContrasenaInput = z.infer<typeof nuevaContrasenaSchema>