'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { verificarContrasena } from '@/lib/password'
import { createSession, destroySession } from '@/lib/session'
import { CU01 } from '@/lib/bloqueo-cu01'
import { getCurrentUser } from '@/lib/auth'
import { registrarEvento } from '@/backend/bitacora'
import { obtenerIpOrigen } from '@/lib/ip'

const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

export interface LoginActionState {
  ok: boolean
  error?: string
}

async function actContadores(
  db: ReturnType<typeof getSupabaseServiceClient>,
  usuarioId: number,
  campos: { intentos_fallidos?: number; bloqueado_hasta?: string | null },
) {
  const { error } = await db.from('usuario').update(campos).eq('id', usuarioId)
  if (error) {
    console.warn(`[CU01] No se pudieron actualizar contadores del usuario ${usuarioId}: ${error.message}`)
  }
}

function destinoSeguro(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

// ---------------------------------------------------------------------------
// FUNCIÓN ADAPTADA: Se llama 'validarCredenciales' para hacer match con el diagrama
// ---------------------------------------------------------------------------
async function validarCredenciales(correo: string, passwordPlain: string, ip: string) {
  const db = getSupabaseServiceClient()
  
  // Equivale al mensaje 1.3: verificarUsuario en la BD
  const { data: usuario, error } = await db
    .from('usuario')
    .select('*, rol:rol_id(nombre)')
    .eq('correo', correo)
    .maybeSingle()
    
  if (error) throw new Error('No se pudo consultar el usuario.')
  if (!usuario) return { success: false, error: 'Correo o contraseña incorrectos.' }

  const ahora = Date.now()

  // (1) Bloqueo vigente (CU01)
  if (usuario.bloqueado_hasta) {
    const finBloqueo = new Date(usuario.bloqueado_hasta).getTime()
    if (Number.isFinite(finBloqueo) && finBloqueo > ahora) {
      const segundos = Math.ceil((finBloqueo - ahora) / 1000)
      return {
        success: false,
        error: `Tu cuenta ha sido bloqueada temporalmente. Inténtalo en ${segundos} segundos.`,
      }
    }
    await actContadores(db, usuario.id, { intentos_fallidos: 0, bloqueado_hasta: null })
  }

  const contrasenaCorrecta = await verificarContrasena(passwordPlain, usuario.contrasena)

  // (2) Contraseña incorrecta (CU01)
  if (!contrasenaCorrecta) {
    const intentos = (usuario.intentos_fallidos ?? 0) + 1
    if (intentos >= CU01.maxIntentos) {
      const bloqueadoHasta = new Date(ahora + CU01.minutosBloqueo * 60_000).toISOString()
      await actContadores(db, usuario.id, { intentos_fallidos: 0, bloqueado_hasta: bloqueadoHasta })
      return {
        success: false,
        error: `Has superado el límite de ${CU01.maxIntentos} intentos. Cuenta bloqueada por ${CU01.minutosBloqueo} min.`,
      }
    }
    await actContadores(db, usuario.id, { intentos_fallidos: intentos })
    return { success: false, error: 'Contraseña incorrecta.' }
  }

  if (!usuario.estado) {
    return { success: false, error: 'Correo o contraseña incorrectos.' }
  }

  // (3) Contraseña correcta -> Reiniciar contadores
  await actContadores(db, usuario.id, { intentos_fallidos: 0, bloqueado_hasta: null })
  return { success: true, usuario }
}

// ---------------------------------------------------------------------------
// Server Action principal (El Controlador del Diagrama)
// ---------------------------------------------------------------------------
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

    const ip = await obtenerIpOrigen()
    const db = getSupabaseServiceClient()

    // Llamada unificada que se alinea con el diagrama
    const resultado = await validarCredenciales(parsed.email, parsed.password, ip)
    if (!resultado.success) {
      return { ok: false, error: resultado.error }
    }

    const usuario = resultado.usuario!

    // Crear sesión (Mensaje 1.5 equivalente)
    await createSession({
      uid: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol_id: usuario.rol_id,
      rol: usuario.rol?.nombre ?? '',
      version: usuario.version_sesion,
    })

    // BITÁCORA (Equivalente al mensaje 1.4: registrarAcceso del diagrama)
    try {
      await registrarEvento(
        db,
        {
          usuario_id: usuario.id,
          accion: 'INICIO_SESION',
          descripcion: `Inicio de sesión exitoso de ${usuario.correo}`,
        },
        ip,
      )
    } catch (e) {
      console.error('Error al registrar en bitácora:', e)
    }

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

// ---------------------------------------------------------------------------
// Cierre de sesión (Equivalente al flujo rojo del diagrama)
// ---------------------------------------------------------------------------
export async function logoutAction() {
  const usuario = await getCurrentUser()
  if (usuario) {
    try {
      const db = getSupabaseServiceClient()
      const ip = await obtenerIpOrigen()

      // Equivalente al mensaje 2.2: registrarAcceso con 'CIERRE_SESION' e IP
      await registrarEvento(
        db,
        {
          usuario_id: usuario.id,
          accion: 'CIERRE_SESION',
          descripcion: `Cierre de sesión de ${usuario.correo}`,
        },
        ip,
      )
    } catch (e) {
      console.error('Error al registrar en bitácora:', e)
    }
  }

  await destroySession()
  revalidatePath('/', 'layout')
  redirect('/login')
}