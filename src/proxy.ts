import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

// Nombre de la cookie de sesión — debe coincidir con `COOKIE_NAME` en
// src/lib/session.ts (no importamos ese módulo aquí: es server-only).
const COOKIE_NAME = 'sesion'

const RUTAS_PUBLICAS = ['/login', '/recuperar']

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET ?? ''
  return new TextEncoder().encode(secret)
}

/**
 * PROXY (Next 16 — antes llamado "middleware").
 * Check OPTIMISTA de sesión: redirige a /login si no hay cookie JWT válida
 * y la ruta es privada. La validación real de la sesión vive en los
 * Server Actions / servicios (requireUser), no aquí.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(COOKIE_NAME)?.value

  let sesionValida = false
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret())
      sesionValida = typeof payload.uid === 'number'
    } catch {
      sesionValida = false
    }
  }

  const esPublica = RUTAS_PUBLICAS.some((ruta) => pathname.startsWith(ruta))

  if (!sesionValida && !esPublica) {
    const url = new URL('/login', request.url)
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (sesionValida && pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Todas las rutas excepto assets estáticos y archivos públicos
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}