'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import {
  crearCliente,
  crearClienteSchema,
  type CrearClienteInput,
} from '@/backend/clientes'

/**
 * EJEMPLO del patrón de la capa de datos:
 *   1) requireUser()              → exige sesión JWT propia (cookie firmada)
 *   2) zod (esquema)              → valida la entrada
 *   3) cliente SERVICE ROLE       → Supabase es solo BD (server-only)
 *   4) servicio del dominio       → lógica de negocio desacoplada de la UI
 */
export async function crearClienteAction(data: CrearClienteInput) {
  await requireUser()

  const parsed = crearClienteSchema.parse(data)

  const db = getSupabaseServiceClient()
  const cliente = await crearCliente(db, parsed)

  revalidatePath('/clientes')
  return { id: cliente.id }
}