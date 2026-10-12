import { cache } from 'react'
import { requireUser, type UsuarioConRol } from '@/lib/auth'
import { getPermisosDeRol } from '@/lib/permisos'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { ErrorInventario } from './errores'
import { evaluarAccesoInventario } from './reglas'
import { FUNCION_INVENTARIO, PERMISO_INVENTARIO, type AccionInventario } from './types'

/**
 * Acciones de ROL_FUNCION concedidas al rol sobre 'Catálogo e Inventario'.
 * Memoizado por petición. Fail-closed: ante cualquier error, ninguna acción.
 */
const accionesInventarioDeRol = cache(async (rolId: number): Promise<string[]> => {
  const db = getSupabaseServiceClient()
  const { data, error } = await db
    .from('rol_funcion')
    .select('funcion:funcion_id(nombre), accion:accion_id(nombre)')
    .eq('rol_id', rolId)

  if (error) {
    console.warn(`[CU16] No se pudieron leer las acciones del rol ${rolId}: ${error.message}`)
    return []
  }
  return (data ?? [])
    .filter((fila) => fila.funcion?.nombre === FUNCION_INVENTARIO)
    .map((fila) => fila.accion?.nombre)
    .filter((nombre): nombre is string => Boolean(nombre))
})

/**
 * Guard de CU16 para cada Server Action (verificación en el SERVIDOR):
 *   1) sesión válida (requireUser: JWT + usuario activo en BD);
 *   2) permiso de ruta INVENTARIO en ROL_PERMISO;
 *   3) la acción pedida en ROL_FUNCION ('Catálogo e Inventario').
 * Devuelve el usuario autenticado: su `id` es la ÚNICA identidad que se usa.
 *
 * No usa tienePermisoModulo('/inventario'): '/inventario' aún no está en
 * MODULOS (lib/permisos.ts) y esa función permite las rutas no registradas.
 */
export async function exigirAccesoInventario(accion: AccionInventario): Promise<UsuarioConRol> {
  let usuario: UsuarioConRol
  try {
    usuario = await requireUser()
  } catch {
    throw new ErrorInventario('No autorizado: inicia sesión para continuar.', 'SIN_SESION')
  }
  const [permisosRuta, acciones] = await Promise.all([
    getPermisosDeRol(usuario.rol_id),
    accionesInventarioDeRol(usuario.rol_id),
  ])

  const tieneRuta = permisosRuta.includes(PERMISO_INVENTARIO)
  if (!evaluarAccesoInventario(tieneRuta, acciones, accion)) {
    throw new ErrorInventario(
      tieneRuta
        ? 'No autorizado: tu rol no tiene permiso para esta operación de inventario.'
        : 'No autorizado: tu rol no tiene acceso al módulo de Inventario.',
      'NO_AUTORIZADO',
    )
  }
  return usuario
}
