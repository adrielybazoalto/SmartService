import { z } from 'zod'

export const crearServicioSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(150, 'El nombre es demasiado largo'),
  descripcion: z.string().trim().max(1000, 'La descripción es demasiado larga').nullable().optional(),
  precio_hora_base: z.coerce
    .number({ error: 'La tarifa por hora debe ser un número' })
    .positive('La tarifa por hora debe ser mayor a cero')
    .max(99999999, 'La tarifa por hora es demasiado alta'),
})

export const actualizarServicioSchema = crearServicioSchema.partial()

/** Filtros del listado: búsqueda por nombre y por estado. */
export const filtrarServiciosSchema = z.object({
  q: z.string().trim().max(100).optional(),
  estado: z.enum(['todos', 'activos', 'inactivos']).optional(),
})

export type CrearServicioInput = z.infer<typeof crearServicioSchema>
export type ActualizarServicioInput = z.infer<typeof actualizarServicioSchema>
export type FiltrarServiciosInput = z.input<typeof filtrarServiciosSchema>