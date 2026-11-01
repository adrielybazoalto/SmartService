import { cache } from 'react'
import { requireUser, type UsuarioConRol } from '@/lib/auth'
import { getPermisosDeRol } from '@/lib/permisos'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { ErrorCompras } from './errores'
import { evaluarAccesoCompras } from './reglas'
import { FUNCION_COMPRAS, PERMISO_COMPRAS, type AccionCompras } from './types'

/**
 * Acciones de ROL_FUNCION concedidas al rol sobre 'Compras'.
 * Memoizado por petición. Fail-closed: ante cualquier error, ninguna acción.
 */
const accionesComprasDeRol = cache(async (rolId: number): Promise<string[]> => {
  const db = getSupabaseServiceClient()
  const { data, error } = await db
    .from('rol_funcion')
    .select('funcion:funcion_id(nombre), accion:accion_id(nombre)')
    .eq('rol_id', rolId)

  if (error) {
    console.warn(`[CU15] No se pudieron leer las acciones del rol ${rolId}: ${error.message}`)
    return []
  }
  return (data ?? [])
    .filter((fila) => fila.funcion?.nombre === FUNCION_COMPRAS)
    .map((fila) => fila.accion?.nombre)
    .filter((nombre): nombre is string => Boolean(nombre))
})

/**
 * Guard de CU15 para cada Server Action (verificación en el SERVIDOR):
 *   1) sesión válida (requireUser: JWT + usuario activo en BD);
 *   2) permiso de ruta COMPRAS en ROL_FUNCION (acción LEER);
 *   3) la acción pedida en ROL_FUNCION ('Compras').
 * Devuelve el usuario autenticado: su `id` es la ÚNICA identidad que se usa.
 *
 * ADMINISTRADOR y ENCARGADO reciben LEER y CREAR en migracion_cu15_compras.sql.
 * No usa tienePermisoModulo('/compras'): '/compras' aún no está en MODULOS
 * (lib/permisos.ts) y esa función permite las rutas no registradas.
 */
export async function exigirAccesoCompras(accion: AccionCompras): Promise<UsuarioConRol> {
  let usuario: UsuarioConRol
  try {
    usuario = await requireUser()
  } catch {
    throw new ErrorCompras('No autorizado: inicia sesión para continuar.', 'SIN_SESION')
  }
  const [permisosRuta, acciones] = await Promise.all([
    getPermisosDeRol(usuario.rol_id),
    accionesComprasDeRol(usuario.rol_id),
  ])

  const tieneRuta = permisosRuta.includes(PERMISO_COMPRAS)
  if (!evaluarAccesoCompras(tieneRuta, acciones, accion)) {
    throw new ErrorCompras(
      tieneRuta
        ? 'No autorizado: tu rol no tiene permiso para esta operación de compras.'
        : 'No autorizado: tu rol no tiene acceso al módulo de Compras.',
      'NO_AUTORIZADO',
    )
  }
  return usuario
}
