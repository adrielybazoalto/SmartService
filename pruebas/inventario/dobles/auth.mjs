// Doble de @/lib/auth: la "sesión" la fija cada prueba en globalThis.__cu16.usuario.
export async function requireUser() {
  const usuario = globalThis.__cu16?.usuario
  if (!usuario) throw new Error('No autorizado: inicia sesión para continuar.')
  return usuario
}
export async function getCurrentUser() {
  return globalThis.__cu16?.usuario ?? null
}
