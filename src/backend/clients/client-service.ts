import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { Client, CreateClientInput } from './types'

/**
 * Ejemplo de servicio de dominio.
 * Se ejecuta solo en el servidor; los Server Actions en src/app lo invocan.
 */

export async function listClients(): Promise<Client[]> {
  const supabase = getSupabaseServerClient()
  // TODO: tipar con los tipos generados por `supabase gen types` cuando exista el esquema.
  const { data, error } = await supabase.from('clients').select('*')
  if (error) {
    throw new Error(`No se pudieron obtener los clientes: ${error.message}`)
  }
  return (data ?? []) as Client[]
}

export async function getClientById(id: string): Promise<Client | null> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) {
    throw new Error(`No se pudo obtener el cliente: ${error.message}`)
  }
  return (data ?? null) as Client | null
}

export async function createClient(input: CreateClientInput): Promise<Client> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('clients')
    .insert(input)
    .select()
    .single()
  if (error) {
    throw new Error(`No se pudo crear el cliente: ${error.message}`)
  }
  return data as Client
}