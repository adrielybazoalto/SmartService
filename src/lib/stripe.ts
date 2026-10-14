import 'server-only'
import Stripe from 'stripe'

let stripe: Stripe | null = null

/**
 * Cliente de Stripe (server-only). Lazy.
 */
export function getStripeClient(): Stripe {
  if (stripe) return stripe

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error('Falta STRIPE_SECRET_KEY en .env.local')
  }

  stripe = new Stripe(secretKey)
  return stripe
}