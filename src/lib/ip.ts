import { headers } from 'next/headers'
import os from 'os'

// Solo dígitos, letras a-f, ":" y ".": cubre IPv4, IPv6 e IPv6 mapeada a IPv4.
const PATRON_IP = /^[0-9a-fA-F:.]{3,45}$/

/**
 * Obtiene la dirección IPv4 de la red local (ej. 192.168.0.12)
 * de la interfaz de red activa de la máquina.
 */
export function obtenerIpRedLocal(): string | null {
  try {
    const nets = os.networkInterfaces()
    for (const name of Object.keys(nets)) {
      const netList = nets[name]
      if (!netList) continue
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal && net.address && net.address !== '127.0.0.1') {
          return net.address
        }
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Normaliza y limpia una dirección IP obtenida de los encabezados o del socket.
 * - Si viene una lista por proxy ("client, proxy1"), extrae la primera IP.
 * - Si viene con puerto o corchetes, los remueve.
 * - Si es IPv6 localhost ("::1") o IPv4 mapeada ("::ffff:127.0.0.1") o localhost,
 *   obtiene la IP real de la red si está disponible (ej: 192.168.0.12) o fallback a "127.0.0.1".
 * - Si es IPv6 mapeada a IPv4 pública (ej. "::ffff:190.181.25.10"), extrae la IPv4.
 * - Si está vacía o es inválida, retorna la IP de red local o "127.0.0.1".
 */
export function normalizarIp(ipRaw?: string | null): string {
  const redLocal = obtenerIpRedLocal() || '127.0.0.1'

  if (!ipRaw || typeof ipRaw !== 'string') return redLocal

  let ip = ipRaw.trim()

  // Si viene una lista separada por comas (ej: "client, proxy1, proxy2"), tomar la primera
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim()
  }

  // Quitar corchetes de IPv6 si los tiene (ej: "[::1]:8080" o "[::1]")
  if (ip.startsWith('[') && ip.includes(']')) {
    ip = ip.substring(1, ip.indexOf(']'))
  } else if (ip.includes(':') && ip.includes('.')) {
    // IPv6 mapeada a IPv4, ej: "::ffff:192.168.1.1" o "::ffff:127.0.0.1"
    const partes = ip.split(':')
    const ultima = partes[partes.length - 1]
    if (PATRON_IP.test(ultima) && ultima.includes('.')) {
      ip = ultima
    }
  }

  // Manejo explícito de localhost en IPv6 o texto -> usar IP real de la red local
  if (ip === '::1' || ip === '::' || ip === 'localhost' || ip === '127.0.0.1') {
    return redLocal
  }

  // Validar formato
  if (PATRON_IP.test(ip)) {
    return ip
  }

  return redLocal
}

/**
 * Obtiene la dirección IP real de origen de forma centralizada y segura.
 * Soporta peticiones HTTP explícitas (Request, NextRequest, IncomingMessage con req.headers, req.socket, req.ip)
 * o consulta automáticamente los headers() de Next.js en Server Actions y componentes del servidor.
 *
 * Prioriza la IP de proxy/remota, resolviendo la IP real de la red en localhost y garantizando
 * que nunca sea nula ni se muestre "No disponible".
 */
export async function obtenerIpOrigen(req?: any): Promise<string> {
  const redLocal = obtenerIpRedLocal() || '127.0.0.1'
  try {
    // 1. Si se pasa un objeto de petición (Request, NextRequest, req de Express/Node)
    if (req) {
      if (typeof req.headers?.get === 'function') {
        const xForwardedFor = req.headers.get('x-forwarded-for')
        const xRealIp = req.headers.get('x-real-ip')
        const cfConnectingIp = req.headers.get('cf-connecting-ip')
        const trueClientIp = req.headers.get('true-client-ip')
        const xClientIp = req.headers.get('x-client-ip')
        const ipCandidata = xForwardedFor || xRealIp || cfConnectingIp || trueClientIp || xClientIp || req.ip
        if (ipCandidata) return normalizarIp(ipCandidata)
      } else if (req.headers && typeof req.headers === 'object') {
        const xForwardedFor = req.headers['x-forwarded-for']
        const xRealIp = req.headers['x-real-ip']
        const cfConnectingIp = req.headers['cf-connecting-ip']
        const trueClientIp = req.headers['true-client-ip']
        const xClientIp = req.headers['x-client-ip']
        const ipCandidata =
          (Array.isArray(xForwardedFor) ? xForwardedFor[0] : xForwardedFor) ||
          (Array.isArray(xRealIp) ? xRealIp[0] : xRealIp) ||
          cfConnectingIp ||
          trueClientIp ||
          xClientIp ||
          req.ip ||
          req.socket?.remoteAddress ||
          req.connection?.remoteAddress
        if (ipCandidata) return normalizarIp(ipCandidata)
      } else if (req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress) {
        return normalizarIp(req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress)
      }
    }

    // 2. Consultar encabezados mediante headers() de Next.js
    const h = await headers()
    const xForwardedFor = h.get('x-forwarded-for')
    const xRealIp = h.get('x-real-ip')
    const cfConnectingIp = h.get('cf-connecting-ip')
    const trueClientIp = h.get('true-client-ip')
    const xClientIp = h.get('x-client-ip')

    const ip = xForwardedFor || xRealIp || cfConnectingIp || trueClientIp || xClientIp
    return normalizarIp(ip)
  } catch {
    return redLocal
  }
}