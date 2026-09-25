'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  crearCliente,
  crearClienteSchema,
  type CrearClienteInput,
} from '@/backend/clientes'

/**
 * EJEMPLO del patrón de la capa de datos:
 *   1) requireUser()          → exige sesión de Supabase Auth
 *   2) zod (esquema)          → valida la entrada
 *   3) cliente de SESIÓN      → RLS por usuario (auth.uid())
 *   4) servicio del dominio   → lógica de negocio desacoplada de la UI
 */
export async function crearClienteAction(data: CrearClienteInput) {
  await requireUser()

  const parsed = crearClienteSchema.parse(data)

  const supabase = await createSupabaseServerClient()
  const cliente = await crearCliente(supabase, parsed)

  revalidatePath('/clientes')
  return { id: cliente.id }
}