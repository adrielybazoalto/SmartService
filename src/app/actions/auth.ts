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

const loginSchema = z.object({
  email: z.string().email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
})

export interface LoginActionState {
  ok: boolean
  error?: string
}

/**
 * Actualiza los contadores de bloqueo (CU01). Si la migración aún no se aplicó
 * en la BD (columnas ausentes), el login sigue funcionando y solo se omite el
 * registro de intentos: nunca debe impedir autenticarse.
 */
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

/** Ruta de destino válida (evita open-redirects mediante el parámetro `next`). */
function destinoSeguro(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

/**
 * Inicia sesión verificando el hash bcrypt almacenado en `usuario.contrasena`
 * y crea la cookie de sesión JWT propia (firmada con AUTH_SECRET).
 * Supabase se usa solo como base de datos.
 *
 * CU01 — control de intentos fallidos (parámetros en `@/lib/bloqueo-cu01`):
 *   1) Bloqueo vigente → se niega antes de validar la contraseña.
 *   2) Contraseña incorrecta → +1 intento; al llegar al límite se bloquea.
 *   3) Contraseña correcta → se reinician los contadores y se inicia sesión.
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

    // Cuenta inexistente: mensaje genérico (sin revelar existencia del correo).
    if (!usuario) {
      return { ok: false, error: 'Correo o contraseña incorrectos.' }
    }

    const ahora = Date.now()

    // (1) Bloqueo vigente → denegar ANTES de validar la contraseña.
    if (usuario.bloqueado_hasta) {
      const finBloqueo = new Date(usuario.bloqueado_hasta).getTime()
      if (Number.isFinite(finBloqueo) && finBloqueo > ahora) {
        const segundos = Math.ceil((finBloqueo - ahora) / 1000)
        return {
          ok: false,
          error: `Tu cuenta ha sido bloqueada temporalmente por demasiados intentos fallidos. Inténtalo de nuevo en ${segundos} segundos.`,
        }
      }
      // Penalización vencida → ventana limpia (se reinicia el contador).
      await actContadores(db, usuario.id, { intentos_fallidos: 0, bloqueado_hasta: null })
    }

    const contrasenaCorrecta = await verificarContrasena(parsed.password, usuario.contrasena)

    // (2) Contraseña incorrecta → incrementar intentos / bloquear al llegar al límite.
    if (!contrasenaCorrecta) {
      const intentos = (usuario.intentos_fallidos ?? 0) + 1

      if (intentos >= CU01.maxIntentos) {
        const bloqueadoHasta = new Date(ahora + CU01.minutosBloqueo * 60_000).toISOString()
        // Se reinicia el contador junto con el bloqueo (ventana por período).
        await actContadores(db, usuario.id, { intentos_fallidos: 0, bloqueado_hasta: bloqueadoHasta })
        return {
          ok: false,
          error: `Has superado el límite de ${CU01.maxIntentos} intentos fallidos. Tu cuenta estará bloqueada durante ${CU01.minutosBloqueo} minuto${CU01.minutosBloqueo === 1 ? '' : 's'}.`,
        }
      }

      await actContadores(db, usuario.id, { intentos_fallidos: intentos })
      return {
        ok: false,
        error: `Contraseña incorrecta. Te quedan ${CU01.maxIntentos - intentos} intento(s).`,
      }
    }

    if (!usuario.estado) {
      return { ok: false, error: 'Correo o contraseña incorrectos.' }
    }

    // (3) Contraseña correcta → reiniciar contadores e iniciar sesión.
    await actContadores(db, usuario.id, { intentos_fallidos: 0, bloqueado_hasta: null })

    await createSession({
      uid: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol_id: usuario.rol_id,
      rol: usuario.rol?.nombre ?? '',
      version: usuario.version_sesion,
    })

    // BITÁCORA (CU06): registra el acceso exitoso. Un fallo aquí JAMÁS
    // bloquea el login (se loguea y se continúa).
    try {
      await registrarEvento(db, {
        usuario_id: usuario.id,
        accion: 'INICIO_SESION',
        descripcion: `Inicio de sesión exitoso del usuario ${usuario.correo}`,
      })
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

/** Cierra la sesión eliminando la cookie. */
export async function logoutAction() {
  // BITÁCORA (CU06): registra el cierre cuando hay sesión activa.
  const usuario = await getCurrentUser()
  if (usuario) {
    try {
      const db = getSupabaseServiceClient()
      await registrarEvento(db, {
        usuario_id: usuario.id,
        accion: 'CIERRE_SESION',
        descripcion: `Cierre de sesión del usuario ${usuario.correo}`,
      })
    } catch (e) {
      console.error('Error al registrar en bitácora:', e)
    }
  }

  await destroySession()
  revalidatePath('/', 'layout')
  redirect('/login')
}