import { headers } from 'next/headers'

// Solo dígitos, letras a-f, ":" y ".": cubre IPv4, IPv6 e IPv6 mapeada a IPv4.
const PATRON_IP = /^[0-9a-fA-F:.]{3,45}$/

const LOOPBACK = ['::1', '::', '127.0.0.1']

/**
 * Limpia una IP de encabezado: quita corchetes, puerto y el prefijo IPv6 mapeado.
 * Devuelve null si no es válida o es loopback: esa no identifica al cliente.
 */
export function normalizarIp(ipRaw?: string | null): string | null {
  if (!ipRaw) return null
  let ip = ipRaw.trim()

  if (ip.startsWith('[') && ip.includes(']')) {
    ip = ip.slice(1, ip.indexOf(']'))
  } else if (ip.includes(':') && ip.includes('.')) {
    // "::ffff:190.181.25.10" o "190.181.25.10:443"
    ip = ip.split(':').find((parte) => parte.includes('.')) ?? ip
  }

  if (LOOPBACK.includes(ip) || !PATRON_IP.test(ip)) return null
  return ip
}

/**
 * IP de origen de la petición (CU06): x-real-ip o el ÚLTIMO valor de x-forwarded-for,
 * el que agregó nuestro proxy; los anteriores los puede inventar el cliente.
 * Si no se sabe, null: nunca la IP de la red local del servidor.
 */
export async function obtenerIpOrigen(): Promise<string | null> {
  try {
    const h = await headers()
    const reenviada = h.get('x-forwarded-for')?.split(',').pop()
    return normalizarIp(h.get('x-real-ip')) ?? normalizarIp(reenviada)
  } catch {
    return null
  }
}
