// Doble de next/headers: cabeceras de la petición simulada.
export async function headers() {
  const h = new Map(Object.entries(globalThis.__cu16?.cabeceras ?? {}))
  return { get: (nombre) => h.get(nombre.toLowerCase()) ?? null }
}
