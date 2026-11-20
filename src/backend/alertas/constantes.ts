/**
 * CU19 — Constantes de Alertas Preventivas.
 *
 * Sin imports de servidor: lo usan el backend, la interfaz y las pruebas.
 */

/** Clave RBAC y ruta del módulo (deben coincidir con lib/navigation.ts). */
export const CLAVE_MODULO_ALERTAS = 'ALERTAS_PREVENTIVAS'
export const RUTA_ALERTAS = '/alertas'

/** Días de anticipación por defecto (se puede cambiar con ALERTAS_UMBRAL_DIAS). */
export const UMBRAL_DIAS_POR_DEFECTO = 30
/** Rango aceptado para ALERTAS_UMBRAL_DIAS (0 = solo vencidos). */
export const UMBRAL_DIAS_MIN = 0
export const UMBRAL_DIAS_MAX = 3650

/**
 * ÚNICO formato del mensaje de ALERTA_NOTIFICACION.
 *
 * Es también la clave lógica de idempotencia (no hay UNIQUE en la tabla):
 * un sistema y un ciclo de mantenimiento tienen como máximo una alerta con
 * este texto. La migración `migracion_cu19_alertas.sql` construye EXACTAMENTE
 * el mismo texto en SQL; la prueba `cu19-rpc.prueba.mjs` compara ambos para
 * que no puedan divergir.
 *
 * `{fecha}` = fecha_proximo_mantenimiento en formato AAAA-MM-DD.
 */
export const PLANTILLA_MENSAJE_ALERTA = 'Mantenimiento preventivo programado para el {fecha}.'

/** Mensaje de la alerta para una fecha de próximo mantenimiento AAAA-MM-DD. */
export function mensajeAlerta(fechaProximoMantenimiento: string): string {
  return PLANTILLA_MENSAJE_ALERTA.replace('{fecha}', fechaProximoMantenimiento)
}

/** Acción de bitácora del único subflujo con usuario (marcar como leída). */
export const ACCION_BITACORA_MARCAR_LEIDA = 'MARCAR_ALERTA_LEIDA'

export const MSG_ALERTA_NO_ENCONTRADA = 'No se encontró la alerta solicitada.'
export const MSG_ALERTA_ID_INVALIDO = 'Alerta inválida.'
export const MSG_FALTA_MIGRACION =
  'Falta aplicar la migración del CU19 (migracion_cu19_alertas.sql) en la base de datos.'
