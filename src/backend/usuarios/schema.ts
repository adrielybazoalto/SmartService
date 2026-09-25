import { z } from 'zod'

/**
 * NOTA: `contrasena` NO está en estos esquemas. Las credenciales las
 * gestiona Supabase Auth (auth.users); la columna legacy `contrasena`
 * deja de ser obligatoria con la migración auth_bridge.sql.
 */

export const crearUsuarioSchema = z.object({
  rol_id: z.number().int().positive('Debe seleccionar un rol'),
  nombre: z.string().min(2, 'El nombre es obligatorio').max(150),
  correo: z.string().email('Correo inválido').max(100),
  telefono: z.string().max(20).nullable().optional(),
  estado: z.boolean().default(true),
})

export const actualizarUsuarioSchema = z.object({
  rol_id: z.number().int().positive().optional(),
  nombre: z.string().min(2).max(150).optional(),
  correo: z.string().email().max(100).optional(),
  telefono: z.string().max(20).nullable().optional(),
  estado: z.boolean().optional(),
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
export type CrearRolInput = z.infer<typeof crearRolSchema>
export type AsignarPermisoInput = z.infer<typeof asignarPermisoSchema>