import type { SupabaseClient } from '@supabase/supabase-js'

// ===========================================================================
// CU08 · El anticipo de la cotización queda registrado en caja
// (migracion_cu08_anticipo_caja.sql)
//
// fn_aprobar_cotizacion genera un recibo RECIBO_ANTICIPO en el turno de caja
// abierto del usuario. EFECTIVO / QR / TRANSFERENCIA exigen caja abierta;
// TARJETA (Stripe) deja recibo solo si hay caja abierta.
// ===========================================================================

export const TIPO_RECIBO_ANTICIPO = 'RECIBO_ANTICIPO'
export const MSG_SIN_CAJA_ANTICIPO = 'Debe abrir un turno de caja antes de registrar el anticipo'

export interface TurnoCajaAnticipo {
  abierta: boolean
  cajaId: number | null
}

/** ¿El usuario tiene un turno de caja abierto? (aviso previo en el modal del anticipo) */
export async function consultarCajaAbierta(db: SupabaseClient, usuarioId: number): Promise<TurnoCajaAnticipo> {
  const { data, error } = await db
    .from('caja')
    .select('id')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'ABIERTA')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`No se pudo verificar la caja: ${error.message}`)
  return { abierta: Boolean(data), cajaId: data ? Number(data.id) : null }
}

/** Respuesta de fn_aprobar_cotizacion / fn_aprobar_cotizacion_tarjeta (solo lo que se usa) */
export interface RespuestaAprobacion {
  numero_cotizacion?: string | null
  anticipo_monto?: number | string | null
  anticipo_metodo?: string | null
  recibo_nro?: string | null
  recibo_caja_id?: number | null
}

/** Mensaje para el usuario después de aprobar: indica el recibo y la caja del anticipo. */
export function mensajeAprobacion(r: RespuestaAprobacion | null | undefined): string {
  const monto = Number(r?.anticipo_monto ?? 0)
  if (!r || !(monto > 0)) return 'Cotización aprobada sin anticipo.'
  const bs = `Bs. ${monto.toFixed(2)}`
  if (r.recibo_nro) {
    return `Cotización aprobada. Anticipo de ${bs} registrado en caja (turno #${r.recibo_caja_id}) con el recibo ${r.recibo_nro}.`
  }
  // Solo pasa con tarjeta sin turno abierto: Stripe ya cobró
  return `Cotización aprobada. Anticipo de ${bs} cobrado con tarjeta; no había turno de caja abierto, así que no se emitió recibo.`
}
