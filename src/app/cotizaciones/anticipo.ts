import { formatearFechaHora } from '@/lib/fechas'

/** Columnas del anticipo; los montos llegan como texto o número según la consulta. */
interface CotizacionConAnticipo {
  total: number | string
  anticipo_monto?: number | string | null
  anticipo_metodo?: string | null
  anticipo_referencia?: string | null
  anticipo_fecha?: string | null
  anticipo_stripe_session_id?: string | null
}

const METODOS: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  QR: 'QR',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta',
}

/** Resumen del anticipo de una cotización (CU08, CU12): monto, %, método y fecha. */
export function textoAnticipo(cot: CotizacionConAnticipo | null | undefined): string {
  const monto = Number(cot?.anticipo_monto ?? 0)
  if (!cot || monto <= 0) return 'Sin anticipo'
  const total = Number(cot.total)
  const porcentaje = total > 0 ? ` (${Math.round((monto / total) * 100)} %)` : ''
  const ref = cot.anticipo_referencia ?? (cot.anticipo_stripe_session_id ? `…${cot.anticipo_stripe_session_id.slice(-8)}` : null)
  const referencia = ref ? ` · Ref. ${ref}` : ''
  const metodo = METODOS[cot.anticipo_metodo ?? ''] ?? cot.anticipo_metodo
  return `Bs. ${monto.toFixed(2)}${porcentaje} · ${metodo} · ${formatearFechaHora(cot.anticipo_fecha)}${referencia}`
}
