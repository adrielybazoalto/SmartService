/**
 * Estados de ORDEN_TRABAJO (chk_orden_estado). Única definición: la comparten
 * órdenes (CU12), asignaciones (CU11) y liquidación (CU13). Sin imports de
 * servidor: también los usa la pantalla.
 */
export const ESTADO_PROGRAMADA = 'PROGRAMADA'
export const ESTADO_EN_PROGRESO = 'EN_PROGRESO'
export const ESTADO_FINALIZADA = 'FINALIZADA'
export const ESTADO_CANCELADA = 'CANCELADA'

export const ESTADO_ORDEN = [ESTADO_PROGRAMADA, ESTADO_EN_PROGRESO, ESTADO_FINALIZADA, ESTADO_CANCELADA] as const
export type EstadoOrden = (typeof ESTADO_ORDEN)[number]

/** Una orden en cualquier otro estado ocupa al técnico. */
export const ESTADOS_NO_ACTIVOS: readonly string[] = [ESTADO_FINALIZADA, ESTADO_CANCELADA]
