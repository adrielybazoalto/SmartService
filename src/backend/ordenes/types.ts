import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

export type OrdenTrabajo = Tables<'orden_trabajo'>
export type NuevaOrdenTrabajo = TablesInsert<'orden_trabajo'>
export type OrdenTrabajoUpdate = TablesUpdate<'orden_trabajo'>

export type OrdenTrabajoTecnico = Tables<'orden_trabajo_tecnico'>
export type NuevoOrdenTrabajoTecnico = TablesInsert<'orden_trabajo_tecnico'>

export type DetalleConsumoMaterial = Tables<'detalle_consumo_material'>
export type NuevoDetalleConsumoMaterial = TablesInsert<'detalle_consumo_material'>

export type NotaServicio = Tables<'nota_servicio'>
export type NuevaNotaServicio = TablesInsert<'nota_servicio'>

/** Convención de la aplicación (el esquema no define CHECK en ORDEN_TRABAJO). */
export const ESTADO_ORDEN = ['PROGRAMADA', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA'] as const
export type EstadoOrden = (typeof ESTADO_ORDEN)[number]