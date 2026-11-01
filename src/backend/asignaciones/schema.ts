import { z } from 'zod'

export const guardarCuadrillaSchema = z
  .object({
    orden_trabajo_id: z.number().int().positive(),
    tecnico_ids: z.array(z.number().int().positive()).min(1, 'Debe seleccionar al menos un técnico'),
    lider_id: z.number().int().positive().nullable().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.lider_id == null) {
      ctx.addIssue({ code: 'custom', message: 'Debe designar un técnico líder para la cuadrilla', path: ['lider_id'] })
    } else if (!d.tecnico_ids.includes(d.lider_id)) {
      ctx.addIssue({ code: 'custom', message: 'El técnico líder debe pertenecer a la cuadrilla', path: ['lider_id'] })
    }
  })

export type GuardarCuadrillaInput = z.input<typeof guardarCuadrillaSchema>

/** Filtros del listado de órdenes: búsqueda por código, estado y cuadrilla. */
export const filtrarOrdenesSchema = z.object({
  q: z.string().trim().max(50).optional(),
  estado: z.enum(['programadas', 'en_curso', 'finalizadas', 'canceladas', 'todas']).optional(),
  cuadrilla: z.enum(['todas', 'sin_asignar', 'asignadas']).optional(),
})

export type FiltrarOrdenesInput = z.input<typeof filtrarOrdenesSchema>
