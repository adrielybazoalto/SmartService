'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { loginSchema } from '@/backend/usuarios/schema'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServiceClient } from '@/lib/supabase/service'

/**
 * Método del diagrama UML: validarCredenciales() [Pasos 4 y 5]
 * Valida las credenciales utilizando Supabase Auth
 */
export async function validarCredenciales(correo: string, password: string) {
  // Instanciamos un cliente de Supabase para autenticación del usuario
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: password,
  })

  return { data, error }
}

/**
 * Método  registrarAcceso() Paso 6
 * Utiliza tu cliente de servicio para registrar el evento en la bitácora ignorando RLS
 */
export async function registrarAcceso(usuarioId: string, correo: string) {
  try {
    const serviceClient = getSupabaseServiceClient()

    await serviceClient.from('bitacora').insert({
      usuario_id: usuarioId,
      fecha_hora: new Date().toISOString(),
      accion: 'INICIO_SESION',
      descripcion: `El usuario corporativo ${correo} inició sesión en SmartService.`,
    }as any)
  } catch (err) {
    console.error('[BITACORA ERROR] Error al registrar acceso en base de datos:', err)
  }
}

/**
 * Controlador Principal de Inicio de Sesión
 */
export async function loginAction(prevState: any, formData: FormData) {
  const rawCorreo = String(formData.get('correo') ?? '')
  const rawPassword = String(formData.get('password') ?? '')

  // 1. Validar sintaxis con Zod
  const validation = loginSchema.safeParse({
    correo: rawCorreo,
    password: rawPassword,
  })

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

  // 2. Invocar validarCredenciales() [Paso 5]
  const { data, error } = await validarCredenciales(correo, password)

  if (error || !data?.user) {
    return {
      success: false,
      errors: { correo: 'Correo o contraseña incorrectos. Verifica tus credenciales.' },
    }
  }

  // 3. Invocar registrarAcceso() usando el Service Role Client [Paso 6]
  await registrarAcceso(data.user.id, correo)

  // 4. Redirigir al panel principal [Paso 7: redirigirPanel()]
  revalidatePath('/', 'layout')
  redirect('/')
}

/**
 * Controlador de Cierre de Sesión (Logout)
 */
export async function logoutAction() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}