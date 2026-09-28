'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { verificarContrasena } from '@/lib/password'
import { createSession, destroySession } from '@/lib/session'

const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

export interface LoginActionState {
  ok: boolean
  error?: string
}

/** Ruta de destino válida (evita open-redirects mediante el parámetro `next`). */
function destinoSeguro(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

/**
 * Inicia sesión verificando el hash bcrypt almacenado en `usuario.contrasena`
 * y crea la cookie de sesión JWT propia (firmada con AUTH_SECRET).
 * Supabase se usa solo como base de datos.
 */
export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const destino = destinoSeguro(String(formData.get('next') ?? ''))
  let redirigir = false

  try {
    const parsed = loginSchema.parse({
      email: String(formData.get('email') ?? '').trim().toLowerCase(),
      password: String(formData.get('password') ?? ''),
    })

    const db = getSupabaseServiceClient()
    const { data: usuario, error } = await db
      .from('usuario')
      .select('*, rol:rol_id(nombre)')
      .eq('correo', parsed.email)
      .maybeSingle()
    if (error) throw new Error('No se pudo consultar el usuario.')

    const valido = usuario
      ? await verificarContrasena(parsed.password, usuario.contrasena)
      : false

    if (!valido || !usuario?.estado) {
      return { ok: false, error: 'Correo o contraseña incorrectos.' }
    }

    await createSession({
      uid: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol_id: usuario.rol_id,
      rol: usuario.rol?.nombre ?? '',
      version: usuario.version_sesion,
    })
    redirigir = true
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'No se pudo iniciar sesión.',
    }
  }

  if (redirigir) {
    revalidatePath('/', 'layout')
    redirect(destino)
  }
  return { ok: false }
}

/** Cierra la sesión eliminando la cookie. */
export async function logoutAction() {
  await destroySession()
  revalidatePath('/', 'layout')
  redirect('/login')
}