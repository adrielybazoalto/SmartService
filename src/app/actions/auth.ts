'use server'

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// Método 6: registrarAcceso() [Clase/Entidad: BITACORA]
async function registrarAcceso(usuarioId: number, correo: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  
  const { error } = await supabase
    .from('bitacora')
    .insert({
      usuario_id: usuarioId,
      fecha_hora: new Date()
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19),
      accion: 'INICIO_SESION',
      descripcion: `Inicio de sesión exitoso del usuario ${correo}`
    })

  if (error) {
    console.error('Error al registrar en BITACORA:', error)
  }
}

// Método 5: validarCredenciales() [Clase/Entidad: USUARIO]
async function validarCredencialesUsuario(correo: string) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  return await supabase
    .from('usuario')
    .select('*')
    .eq('correo', correo.trim())
    .single()
}

// Método 4: validarCredenciales() [Clase/Controlador: Inicio de Sesión]
export async function validarCredenciales(
  correo: string,
  contrasena: string
) {
  // Llama al método de la entidad USUARIO
  const { data: usuario, error } = await validarCredencialesUsuario(correo)

  if (error || !usuario) {
    return {
      success: false,
      error: 'El usuario no está registrado en el sistema.'
    }
  }

  const passwordValida = await bcrypt.compare(
    contrasena,
    usuario.contrasena
  )

  if (!passwordValida) {
    return {
      success: false,
      error: 'Contraseña incorrecta. Inténtalo de nuevo.'
    }
  }

  // Llama al método registrarAcceso() de la entidad BITACORA
  await registrarAcceso(usuario.id, usuario.correo)

  const cookieStore = await cookies()
  cookieStore.set(
    'smartservice_user',
    JSON.stringify({
      id: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol_id
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24,
      path: '/'
    }
  )

  return {
    success: true,
    usuario,
    error: null
  }
}

// Cierre de sesión (Cierre del CU01)
export async function cerrarSesion() {
  const cookieStore = await cookies()
  cookieStore.delete('smartservice_user')
  redirect('/')
}