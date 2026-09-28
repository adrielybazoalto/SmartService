import type { Db } from '@/lib/supabase/types'

/**
 * GestorSesiones — invalida las sesiones previas de un usuario (CU02).
 *
 * Las sesiones son JWTs stateless: la invalidación se resuelve con un
 * contador `version_sesion` por usuario. Cada JWT lleva la versión con la que
 * fue emitido; al cambiarse la contraseña por recuperación se incrementa el
 * contador y `getCurrentUser` rechaza cualquier sesión emitida con una versión
 * anterior (el JWT "viejo" deja de ser válido en el servidor).
 */
export class GestorSesiones {
  static async invalidarSesiones(db: Db, usuarioId: number): Promise<void> {
    const { data, error } = await db
      .from('usuario')
      .select('version_sesion')
      .eq('id', usuarioId)
      .maybeSingle()

    if (error || !data) {
      throw new Error('No se pudo invalidar las sesiones del usuario.')
    }

    const { error: errActualizar } = await db
      .from('usuario')
      .update({ version_sesion: data.version_sesion + 1 })
      .eq('id', usuarioId)

    if (errActualizar) {
      throw new Error('No se pudo invalidar las sesiones del usuario.')
    }
  }
}