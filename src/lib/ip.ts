import { headers } from 'next/headers'

// Solo dígitos, letras a-f, ":" y ".": cubre IPv4, IPv6 e IPv6 mapeada a IPv4.
const PATRON_IP = /^[0-9a-fA-F:.]{3,45}$/

/**
 * Obtiene la IP de origen de la solicitud actual (CU06).
 * Se calcula SIEMPRE en el servidor; nunca la envía el cliente.
 * Devuelve null si no hay solicitud (scripts, pruebas) o la IP no es válida.
 */
export async function obtenerIpOrigen(): Promise<string | null> {
  try {
    const h = await headers()
    const reenviada = h.get('x-forwarded-for')?.split(',')[0]?.trim()
    const ip = reenviada || h.get('x-real-ip')?.trim() || null
    return ip && PATRON_IP.test(ip) ? ip : null
  } catch {
    return null
  }
}