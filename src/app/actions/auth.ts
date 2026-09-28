'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { loginSchema } from '@/backend/usuarios/schema'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServiceClient } from '@/lib/supabase/service'

export async function introducirDatos(correo: string, password: string) {
  return loginSchema.safeParse({ correo, password })
}

export async function enviarFormulario(formData: FormData) {
  const rawCorreo = String(formData.get('correo') ?? '')
  const rawPassword = String(formData.get('password') ?? '')
  return await introducirDatos(rawCorreo, rawPassword)
}

export async function validarCredenciales(correo: string, password: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  
  const { data: usuario, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('correo', correo)
    .single()

  if (error || !usuario) {
    return { data: null, error: 'Usuario no encontrado' }
  }

  if (usuario.contrasena !== password && usuario.password !== password) {
    return { data: null, error: 'Contraseña incorrecta' }
  }

  return { data: { user: usuario }, error: null }
}

export async function registrarAcceso(usuarioId: string, correo: string) {
  try {
    const serviceClient = getSupabaseServiceClient()

    await serviceClient.from('bitacora').insert({
      usuario_id: usuarioId,
      fecha_hora: new Date().toISOString(),
      accion: 'INICIO_SESION',
      descripcion: `El usuario corporativo ${correo} inició sesión en SmartService.`,
    } as any)
  } catch (err) {
    console.error('[BITACORA ERROR] Error al registrar acceso en base de datos:', err)
  }
}

export async function redirigirPanel() {
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function iniciarSesion(prevState: any, formData: FormData) {
  const validation = await enviarFormulario(formData)

  if (!validation.success) {
    const errors = validation.error.flatten().fieldErrors
    return {
      success: false,
      errors: {
        correo: errors.correo?.[0],
        password: errors.password?.[0],
      },
    }
  }

  const { correo, password } = validation.data

  const { data, error } = await validarCredenciales(correo, password)

  if (error || !data?.user) {
    return {
      success: false,
      errors: { correo: 'Correo o contraseña incorrectos. Verifica tus credenciales.' },
    }
  }

  await registrarAcceso(data.user.id || data.user.id_usuario, correo)

  await redirigirPanel()
}

export async function logoutAction() {
  revalidatePath('/', 'layout')
  redirect('/login')
}