import { z } from 'zod'
import { contrasenaSchema } from '@/lib/password'

/**
 * NOTA: las credenciales las gestiona la APLICACIÓN con bcryptjs.
 * La contraseña llega aquí en texto plano desde el Server Action, se
 * valida con `contrasenaSchema` y el servicio guarda SOLO su hash
 * en `usuario.contrasena` (migración `auth_local.sql`).
 */

export const crearUsuarioSchema = z.object({
  rol_id: z.number().int().positive('Debe seleccionar un rol'),
  nombre: z.string().min(2, 'El nombre es obligatorio').max(150),
  correo: z.string().email('Correo inválido').max(100),
  telefono: z.string().max(20).nullable().optional(),
  estado: z.boolean().default(true),
  contrasena: contrasenaSchema,
})

export const actualizarUsuarioSchema = z.object({
  rol_id: z.number().int().positive().optional(),
  nombre: z.string().min(2).max(150).optional(),
  correo: z.string().email().max(100).optional(),
  telefono: z.string().max(20).nullable().optional(),
  estado: z.boolean().optional(),
  contrasena: contrasenaSchema.optional(),
})

/** Cambio de contraseña del propio perfil (verifica la actual). */
export const cambiarContrasenaSchema = z.object({
  contrasenaActual: z.string().min(1, 'La contraseña actual es obligatoria'),
  contrasenaNueva: contrasenaSchema,
})

export const crearRolSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(50),
  descripcion: z.string().nullable().optional(),
})

export const actualizarRolSchema = crearRolSchema.partial()

export const asignarPermisoSchema = z.object({
  rol_id: z.number().int().positive(),
  funcion_id: z.number().int().positive(),
  accion_id: z.number().int().positive(),
  descripcion: z.string().nullable().optional(),
})

export type CrearUsuarioInput = z.infer<typeof crearUsuarioSchema>
export type ActualizarUsuarioInput = z.infer<typeof actualizarUsuarioSchema>
export type CambiarContrasenaInput = z.infer<typeof cambiarContrasenaSchema>
export type CrearRolInput = z.infer<typeof crearRolSchema>
export type AsignarPermisoInput = z.infer<typeof asignarPermisoSchema>

// CU01: Inicio de Sesión

export const loginSchema = z.object({
  correo: z
    .string()
    .min(1, 'El correo electrónico es obligatorio')
    .email('Ingresa un correo electrónico válido'),
  password: z
    .string()
    .min(1, 'La contraseña es obligatoria')
    .min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

export type LoginInput = z.infer<typeof loginSchema>