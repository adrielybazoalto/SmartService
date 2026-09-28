
'use server'

import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// 1. VALIDAR CREDENCIALES (INICIAR SESIÓN)
export async function validarCredenciales(
  correo: string,
  contrasena: string
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Buscar al usuario por correo
  const { data: usuario, error } = await supabase
    .from('usuario')
    .select('*')
    .eq('correo', correo.trim())
    .single()

  // Error al consultar la base de datos
  if (error) {
    return {
      success: false,
      error: `Error Supabase: ${error.message} | Código: ${error.code}`
    }
  }

  // Usuario no encontrado
  if (!usuario) {
    return {
      success: false,
      error: 'El usuario no está registrado en el sistema.'
    }
  }

  // Comparar contraseña ingresada con el hash almacenado
  const passwordValida = await bcrypt.compare(
    contrasena,
    usuario.contrasena
  )

  // Contraseña incorrecta
  if (!passwordValida) {
    return {
      success: false,
      error: 'Contraseña incorrecta. Inténtalo de nuevo.'
    }
  }

  // Registrar inicio de sesión en la bitácora
  const { error: errorBitacora } = await supabase
    .from('bitacora')
    .insert({
      usuario_id: usuario.id,
      fecha_hora: new Date()
        .toISOString()
        .replace('T', ' ')
        .substring(0, 19),
      accion: 'INICIO_SESION',
      descripcion: `Inicio de sesión exitoso del usuario ${usuario.correo}`
    })

  // Si ocurre un error en la bitácora, no impedir el inicio de sesión
  if (errorBitacora) {
    console.error('Error al registrar en BITACORA:', errorBitacora)
  }

  // Crear cookie de sesión
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
// 2. RECUPERAR / ACTUALIZAR CONTRASEÑA
export async function recuperarContrasena(
  correo: string,
  nuevaContrasenaPlana: string
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Buscar al usuario por correo
  const { data: usuario, error: errorBusqueda } = await supabase
    .from('usuario')
    .select('*')
    .eq('correo', correo.trim())
    .single()

  // Usuario no encontrado
  if (errorBusqueda || !usuario) {
    return {
      success: false,
      error: 'El correo electrónico no está registrado en el sistema.'
    }
  }

  // Generar hash de la nueva contraseña
  const salt = await bcrypt.genSalt(10)
  const hashedPassword = await bcrypt.hash(
    nuevaContrasenaPlana,
    salt
  )

  // Actualizar contraseña
  const { error: errorUpdate } = await supabase
    .from('usuario')
    .update({
      contrasena: hashedPassword
    })
    .eq('correo', correo.trim())

  if (errorUpdate) {
    return {
      success: false,
      error: 'Hubo un error al actualizar la contraseña en la base de datos.'
    }
  }

  return {
    success: true,
    error: null
  }
}
// 3. CERRAR SESIÓN (LOGOUT)
export async function cerrarSesion() {
  const cookieStore = await cookies()

  cookieStore.delete('smartservice_user')

  
    redirect('/')
  
}
