/**
 * CU18 — Catálogos del ticket de soporte (chk_ticket_estado, chk_ticket_tipo,
 * chk_ticket_urgencia). Sin imports de servidor: también los usan la pantalla
 * y el parser de comandos de voz.
 */

export const ESTADOS_TICKET = ['ABIERTO', 'EN_PROCESO', 'RESUELTO', 'CANCELADO'] as const
export type EstadoTicket = (typeof ESTADOS_TICKET)[number]

export const TIPOS_TICKET = ['PREVENTIVO', 'CORRECTIVO'] as const
export type TipoTicket = (typeof TIPOS_TICKET)[number]

export const URGENCIAS_TICKET = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const
export type UrgenciaTicket = (typeof URGENCIAS_TICKET)[number]

export const ORIGENES_TICKET = ['MANUAL', 'VOZ'] as const
export type OrigenTicket = (typeof ORIGENES_TICKET)[number]

export const ETIQUETA_ESTADO: Record<EstadoTicket, string> = {
  ABIERTO: 'Abierto',
  EN_PROCESO: 'En Proceso',
  RESUELTO: 'Resuelto',
  CANCELADO: 'Cancelado',
}

export const ETIQUETA_TIPO: Record<TipoTicket, string> = {
  PREVENTIVO: 'Preventivo',
  CORRECTIVO: 'Correctivo',
}

export const ETIQUETA_URGENCIA: Record<UrgenciaTicket, string> = {
  BAJA: 'Baja',
  MEDIA: 'Media',
  ALTA: 'Alta',
  CRITICA: 'Crítica',
}

/** Estados a los que se puede pasar desde cada estado (RESUELTO y CANCELADO son finales). */
export const TRANSICIONES_TICKET: Record<EstadoTicket, readonly EstadoTicket[]> = {
  ABIERTO: ['EN_PROCESO', 'RESUELTO', 'CANCELADO'],
  EN_PROCESO: ['RESUELTO', 'CANCELADO'],
  RESUELTO: [],
  CANCELADO: [],
}

/** Solo un ticket abierto o en proceso puede derivarse a una Orden de Trabajo. */
export const ESTADOS_DERIVABLES: readonly EstadoTicket[] = ['ABIERTO', 'EN_PROCESO']

export const MSG_SISTEMA_OBLIGATORIO = 'Debe seleccionar un sistema instalado para asociar el ticket.'
export const MSG_DESCRIPCION_OBLIGATORIA = 'La descripción de la incidencia es obligatoria.'
export const MSG_TIPO_OBLIGATORIO = 'Debe seleccionar el tipo de mantenimiento.'
export const MSG_URGENCIA_OBLIGATORIA = 'Debe seleccionar el nivel de urgencia.'

/** Correlativo visible TK-AAAA-NNN, generado a partir del id y del año del reporte. */
export function codigoTicket(id: number, fechaReporte: string | null | undefined): string {
  const anio = fechaReporte?.slice(0, 4) || String(new Date().getFullYear())
  return `TK-${anio}-${String(id).padStart(3, '0')}`
}

export function esEstadoTicket(valor: unknown): valor is EstadoTicket {
  return typeof valor === 'string' && (ESTADOS_TICKET as readonly string[]).includes(valor)
}

export function esUrgenciaTicket(valor: unknown): valor is UrgenciaTicket {
  return typeof valor === 'string' && (URGENCIAS_TICKET as readonly string[]).includes(valor)
}

export function esTipoTicket(valor: unknown): valor is TipoTicket {
  return typeof valor === 'string' && (TIPOS_TICKET as readonly string[]).includes(valor)
}
