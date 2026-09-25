import { z } from 'zod'

export const crearServicioSchema = z.object({
  nombre: z.string().min(2, 'El nombre es obligatorio').max(150),
  descripcion: z.string().nullable().optional(),
  precio_hora_base: z.coerce.number().min(0, 'El precio por hora es obligatorio'),
})

export const actualizarServicioSchema = crearServicioSchema.partial()

export type CrearServicioInput = z.infer<typeof crearServicioSchema>
export type ActualizarServicioInput = z.infer<typeof actualizarServicioSchema>