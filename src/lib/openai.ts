import 'server-only'
import OpenAI from 'openai'

let openai: OpenAI | null = null

/**
 * Cliente de OpenAI para el Asistente IA (server-only). Lazy.
 */
export function getOpenAIClient(): OpenAI {
  if (openai) return openai

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Falta OPENAI_API_KEY en .env.local')
  }

  openai = new OpenAI({ apiKey })
  return openai
}