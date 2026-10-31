import 'server-only'
import { headers } from 'next/headers'
import { getStripeClient } from '@/lib/stripe'

// =====================================================================
//  PasarelaPago - cobro con tarjeta mediante Stripe Checkout (modo prueba)
//  Clase "PasarelaPago" de los diagramas de análisis, comunicación y
//  secuencia del CU09 y del CU13:
//    crearSesionPago(monto, descripcion, urlRetorno)
//    ingresarDatosTarjeta()   -> lo hace el cliente en la página de Stripe
//    verificarPago(sessionId)
//
//  Stripe no cobra en bolivianos: el monto se convierte a USD con un tipo
//  de cambio fijo (STRIPE_TIPO_CAMBIO en .env.local; por defecto 6.96).
// =====================================================================

/**
 * Dirección del sistema (http://localhost:3000 o la de Vercel), para que
 * Stripe sepa a dónde devolver al cliente después de pagar.
 * Se puede fijar con APP_URL en .env.local / Vercel.
 */
export async function obtenerUrlBase(): Promise<string> {
  const fija = process.env.APP_URL?.trim()
  if (fija) return fija.replace(/\/+$/, "")
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const protocolo = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)/.test(host) ? "http" : "https")
  return `${protocolo}://${host}`
}

export class ErrorPago extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ErrorPago'
  }
}

const tc = Number(process.env.STRIPE_TIPO_CAMBIO)
export const TIPO_CAMBIO_BS_USD = Number.isFinite(tc) && tc > 0 ? tc : 6.96
export const MONEDA = 'usd'
const MINIMO_CENTAVOS = 50 // Stripe no acepta cobros menores a USD 0.50

/** Bs -> centavos de dólar (entero, como lo pide Stripe). */
export function bsACentavosUsd(montoBs: number): number {
  return Math.round((montoBs / TIPO_CAMBIO_BS_USD) * 100)
}

export interface SesionPago {
  sessionId: string
  url: string
  montoUsd: number
}

export interface ResultadoPago {
  pagado: boolean
  sessionId: string
  metadata: Record<string, string>
  montoUsd: number
}

export class PasarelaPago {
  /** Crea la página de pago de Stripe y devuelve su enlace. */
  async crearSesionPago(params: {
    montoBs: number
    descripcion: string
    urlRetorno: string
    urlCancelacion: string
    metadata: Record<string, string>
  }): Promise<SesionPago> {
    const centavos = bsACentavosUsd(params.montoBs)
    if (centavos < MINIMO_CENTAVOS) {
      throw new ErrorPago(
        `El monto es muy bajo para cobrar con tarjeta: Stripe exige al menos USD 0.50 (Bs ${(0.5 * TIPO_CAMBIO_BS_USD).toFixed(2)}).`,
      )
    }

    const separador = params.urlRetorno.includes('?') ? '&' : '?'
    try {
      const sesion = await getStripeClient().checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: MONEDA,
              unit_amount: centavos,
              product_data: {
                name: params.descripcion,
                description: `Equivalente a Bs ${params.montoBs.toFixed(2)} (tipo de cambio ${TIPO_CAMBIO_BS_USD})`,
              },
            },
          },
        ],
        // Stripe reemplaza {CHECKOUT_SESSION_ID} por el código del pago
        success_url: `${params.urlRetorno}${separador}session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: params.urlCancelacion,
        metadata: params.metadata,
      })
      if (!sesion.url) throw new ErrorPago('Stripe no devolvió la página de pago.')
      return { sessionId: sesion.id, url: sesion.url, montoUsd: centavos / 100 }
    } catch (e) {
      throw traducirError(e)
    }
  }

  /** Pregunta a Stripe si el pago quedó realmente pagado. */
  async verificarPago(sessionId: string): Promise<ResultadoPago> {
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) throw new ErrorPago('El código de pago no es válido.')
    try {
      const sesion = await getStripeClient().checkout.sessions.retrieve(sessionId)
      return {
        pagado: sesion.payment_status === 'paid',
        sessionId: sesion.id,
        metadata: (sesion.metadata ?? {}) as Record<string, string>,
        montoUsd: (sesion.amount_total ?? 0) / 100,
      }
    } catch (e) {
      throw traducirError(e)
    }
  }
}

function traducirError(e: unknown): Error {
  if (e instanceof ErrorPago) return e
  const mensaje = e instanceof Error ? e.message : String(e)
  if (mensaje.includes('STRIPE_SECRET_KEY')) {
    return new ErrorPago('Falta configurar Stripe: agregue STRIPE_SECRET_KEY (sk_test_...) en .env.local y reinicie el servidor.')
  }
  if (/api key|authentication/i.test(mensaje)) {
    return new ErrorPago('La clave de Stripe no es válida. Revise STRIPE_SECRET_KEY en .env.local.')
  }
  return new ErrorPago(`No se pudo comunicar con la pasarela de pago: ${mensaje}`)
}