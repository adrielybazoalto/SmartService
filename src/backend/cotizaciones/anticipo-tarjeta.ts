import type { SupabaseClient } from '@supabase/supabase-js'
import { bsACentavosUsd, type PasarelaPago } from '@/backend/pagos/pasarela-pago'
import { ahoraBolivia } from '@/lib/fechas'

// ===========================================================================
// CU08, subflujo "Anticipo con tarjeta" (mismo patrón que CU09 y CU13):
//   iniciarAnticipoTarjeta(...)    -> PasarelaPago.crearSesionPago
//   confirmarAnticipoTarjeta(...)  -> PasarelaPago.verificarPago
//                                  -> fn_aprobar_cotizacion_tarjeta
// La cotización SOLO se aprueba cuando Stripe confirma el pago.
// ===========================================================================

export const TIPO_PAGO_ANTICIPO = 'ANTICIPO_COTIZACION'
export const MSG_PAGO_NO_CONFIRMADO = 'El pago con tarjeta no fue confirmado. La cotización sigue pendiente.'

export const MSG_FALTA_MIGRACION = 'Falta aplicar la migración del anticipo en la base de datos'

type PasarelaAnticipo = Pick<PasarelaPago, 'crearSesionPago' | 'verificarPago'>

// PGRST202/PGRST204: la API no ve la función o la columna. 42883/42703: Postgres no las encuentra.
const CODIGOS_SIN_MIGRACION = ['PGRST202', 'PGRST204', '42883', '42703']

/** ¿El error es porque la migración del anticipo no está aplicada? */
export function faltaMigracionAnticipo(error: { code?: string } | null | undefined): boolean {
  return CODIGOS_SIN_MIGRACION.includes(error?.code ?? '')
}

/**
 * Comprueba la base ANTES de cobrar. Con la sesión vacía, la función rechaza la
 * llamada en su primera línea, sin leer ni escribir datos.
 */
async function exigirBaseLista(db: SupabaseClient): Promise<void> {
  const { error } = await db.rpc('fn_aprobar_cotizacion_tarjeta', {
    p_usuario_id: 0,
    p_cotizacion_id: 0,
    p_session_id: '',
    p_monto_pagado: 0,
    p_ip: null,
  })
  if (faltaMigracionAnticipo(error)) throw new Error(MSG_FALTA_MIGRACION)
}

/** Valida la cotización y crea el cobro en Stripe. Devuelve el enlace de pago. */
export async function iniciarAnticipoTarjeta(
  db: SupabaseClient,
  pasarela: PasarelaAnticipo,
  params: { cotizacionId: number; monto: number },
  urlBase: string,
): Promise<{ url: string }> {
  const { cotizacionId, monto } = params
  await exigirBaseLista(db)

  const { data: cot, error } = await db
    .from('cotizacion')
    .select('id, numero_cotizacion, estado, total, fecha_vencimiento')
    .eq('id', cotizacionId)
    .maybeSingle()

  if (error) throw new Error(`No se pudo leer la cotización: ${error.message}`)
  if (!cot) throw new Error('La cotización no existe')
  if (cot.estado !== 'PENDIENTE') throw new Error('Solo se pueden aprobar cotizaciones en estado PENDIENTE')
  if (cot.fecha_vencimiento && cot.fecha_vencimiento < ahoraBolivia().slice(0, 10)) {
    const [anio, mes, dia] = cot.fecha_vencimiento.split('-')
    throw new Error(`La cotización venció el ${dia}/${mes}/${anio}`)
  }
  if (!Number.isFinite(monto) || monto <= 0 || monto > Number(cot.total)) {
    throw new Error('El anticipo debe ser mayor a 0 y no superar el total de la cotización')
  }
  if (monto !== Math.round(monto * 100) / 100) throw new Error('El anticipo admite como máximo 2 decimales')

  const sesion = await pasarela.crearSesionPago({
    montoBs: monto,
    descripcion: `Anticipo de la cotización ${cot.numero_cotizacion} - SgarNet`,
    urlRetorno: `${urlBase}/cotizaciones?anticipo=exito`,
    urlCancelacion: `${urlBase}/cotizaciones?anticipo=cancelado`,
    metadata: {
      tipo: TIPO_PAGO_ANTICIPO,
      cotizacion_id: String(cot.id),
      monto_bs: monto.toFixed(2),
    },
  })
  return { url: sesion.url }
}

/**
 * Al volver de Stripe: verifica el pago y aprueba la cotización con el monto
 * que guarda Stripe. Stripe cobra en USD: reconvertir a Bs daría diferencias de
 * redondeo, por eso se usa monto_bs de la metadata (la escribe el servidor) y se
 * comprueba que coincida con los centavos realmente cobrados.
 */
export async function confirmarAnticipoTarjeta(
  db: SupabaseClient,
  pasarela: PasarelaAnticipo,
  params: { sessionId: string; usuarioId: number; ip?: string | null },
): Promise<void> {
  const pago = await pasarela.verificarPago(params.sessionId)
  if (!pago.pagado) throw new Error(MSG_PAGO_NO_CONFIRMADO)

  const m = pago.metadata
  if (m.tipo !== TIPO_PAGO_ANTICIPO) throw new Error('El pago no corresponde a un anticipo de cotización')

  const cotizacionId = Number(m.cotizacion_id)
  const montoBs = Number(m.monto_bs)
  if (!Number.isInteger(cotizacionId) || cotizacionId <= 0 || !Number.isFinite(montoBs)) {
    throw new Error('El pago no corresponde a un anticipo de cotización')
  }
  if (Math.round(pago.montoUsd * 100) !== bsACentavosUsd(montoBs)) {
    throw new Error(`El monto cobrado no coincide con el anticipo. Revise el pago ${pago.sessionId} en Stripe.`)
  }

  const { error } = await db.rpc('fn_aprobar_cotizacion_tarjeta', {
    p_usuario_id: params.usuarioId,
    p_cotizacion_id: cotizacionId,
    p_session_id: pago.sessionId,
    p_monto_pagado: montoBs,
    p_ip: params.ip ?? null,
  })
  // Stripe ya cobró: el mensaje debe permitir ubicar el pago para registrarlo o devolverlo
  if (error) {
    const motivo = faltaMigracionAnticipo(error) ? MSG_FALTA_MIGRACION : error.message
    throw new Error(`${motivo}. El pago ${pago.sessionId} se cobró pero no se registró: revíselo en Stripe.`)
  }
}
