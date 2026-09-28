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

/**
 * Inicia sesión verificando el hash bcrypt almacenado en `usuario.contrasena`
 * y crea la cookie de sesión JWT propia (firmada con AUTH_SECRET).
 * Supabase se usa solo como base de datos.
 */
export async function loginAction(formData: FormData) {
  const parsed = loginSchema.parse({
    email: String(formData.get('email') ?? '').trim().toLowerCase(),
    password: String(formData.get('password') ?? ''),
  })

  const db = getSupabaseServiceClient()
  const { data: usuario, error } = await db
    .from('usuario')
    .select('*')
    .eq('correo', parsed.email)
    .maybeSingle()
  if (error) throw new Error('No se pudo consultar el usuario.')

  const valido = usuario
    ? await verificarContrasena(parsed.password, usuario.contrasena)
    : false

  if (!valido || !usuario?.estado) {
    throw new Error('Correo o contraseña incorrectos.')
  }

  await createSession({
    uid: usuario.id,
    nombre: usuario.nombre,
    correo: usuario.correo,
    rol_id: usuario.rol_id,
  })

  revalidatePath('/', 'layout')
  redirect('/')
}

/** Cierra la sesión eliminando la cookie. */
export async function logoutAction() {
  await destroySession()
  revalidatePath('/', 'layout')
  redirect('/login')
}