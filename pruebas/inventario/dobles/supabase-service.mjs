// Doble de @/lib/supabase/service: devuelve el cliente FALSO de la prueba actual.
// Nunca crea un cliente real ni lee variables de entorno.
export function getSupabaseServiceClient() {
  const db = globalThis.__cu16?.db
  if (!db) throw new Error('Prueba sin cliente falso configurado')
  return db
}
