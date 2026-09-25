import { z } from 'zod'

/** Convención de la aplicación (el esquema no define CHECK en CLIENTE). */
export const TIPO_CLIENTE = ['NATURAL', 'JURIDICO'] as const

export const crearClienteSchema = z.object({
  nombre: z.string().min(2, 'El nombre es obligatorio').max(150),
  tipo_cliente: z.enum(TIPO_CLIENTE),
  razon_social: z.string().max(150).nullable().optional(),
  documento_identidad: z.string().max(30).nullable().optional(),
  correo: z.string().email('Correo inválido').max(100).nullable().optional(),
  telefono: z.string().max(20).nullable().optional(),
  telefono_alternativo: z.string().max(20).nullable().optional(),
})

export const actualizarClienteSchema = crearClienteSchema.partial()

export type CrearClienteInput = z.infer<typeof crearClienteSchema>
export type ActualizarClienteInput = z.infer<typeof actualizarClienteSchema>