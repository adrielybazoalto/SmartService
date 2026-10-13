// Doble de next/cache: registra las rutas revalidadas.
export function revalidatePath(ruta) {
  globalThis.__cu16?.revalidadas?.push(ruta)
}
