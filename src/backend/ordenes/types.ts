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

export { ESTADO_ORDEN, type EstadoOrden } from './estados'