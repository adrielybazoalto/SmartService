import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'sesion'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 días

export interface SesionUsuario {
  uid: number
  nombre: string
  correo: string
  rol_id: number
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('Falta AUTH_SECRET en el entorno (configurar en .env.local y Vercel).')
  }
  return new TextEncoder().encode(secret)
}

/** Crea la cookie de sesión firmada (JWT HS256, httpOnly). */
export async function createSession(usuario: SesionUsuario): Promise<void> {
  const token = await new SignJWT({ ...usuario })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret())

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

/** Lee y verifica la cookie de sesión; devuelve null si no existe o es inválida. */
export async function getSession(): Promise<SesionUsuario | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (typeof payload.uid !== 'number') return null
    return {
      uid: payload.uid,
      nombre: String(payload.nombre ?? ''),
      correo: String(payload.correo ?? ''),
      rol_id: Number(payload.rol_id ?? 0),
    }
  } catch {
    return null
  }
}

/** Elimina la cookie de sesión (logout). */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(COOKIE_NAME)
}