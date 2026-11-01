import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser, type UsuarioConRol } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { moduloPorRuta } from '@/lib/navigation'

/**
 * RBAC por rutas (Nivel 1 y 2).
 *
 * El catálogo de módulos (`MODULOS`) y `moduloPorRuta()` viven en
 * `src/lib/navigation.ts`, la **única fuente de verdad** del alcance del
 * sistema (compartida con el Sidebar y el panel principal). Este módulo solo
 * aporta la parte de servidor: la matriz de permisos VIVE EN LA BASE DE DATOS
 * en un solo modelo: ROL_FUNCION ⋈ FUNCION ⋈ ACCION. Cada FUNCION es un módulo
 * (clave + ruta) y el acceso al módulo es la acción LEER; las demás acciones
 * (CREAR, ACTUALIZAR, ELIMINAR, PROCESAR) controlan las operaciones internas.
 * Así el Administrador podrá editar los
 * permisos desde /roles sin tocar el código. Cualquier error de lectura opera
 * en modo "fail-closed" (sin permisos) por seguridad.
 *
 * Se reexportan `MODULOS`, `moduloPorRuta` y `ModuloRegistrado` para los
 * consumidores existentes.
 */

export { MODULOS, moduloPorRuta } from '@/lib/navigation'
export type { ModuloRegistrado } from '@/lib/navigation'

/** Acción de ACCION que da acceso (entrar) a un módulo. */
export const ACCION_ACCESO = 'LEER'

export type AccionPermiso = 'CREAR' | 'LEER' | 'ACTUALIZAR' | 'ELIMINAR' | 'PROCESAR'

const MSG_SIN_PERMISO = 'No autorizado: tu rol no tiene el permiso de este módulo.'

/** Acciones del rol como 'CLAVE:ACCION'. Fail-closed: si no se pueden leer, ninguna. */
const getAccionesDeRol = cache(async (rolId: number): Promise<string[]> => {
  const db = getSupabaseServiceClient()
  const { data, error } = await db
    .from('rol_funcion')
    .select('funcion:funcion_id(clave), accion:accion_id(nombre)')
    .eq('rol_id', rolId)

  if (error) {
    console.warn(`[RBAC] No se pudieron leer permisos del rol ${rolId}: ${error.message}`)
    return []
  }
  return (data ?? [])
    .filter((fila) => fila.funcion?.clave && fila.accion?.nombre)
    .map((fila) => `${fila.funcion?.clave}:${fila.accion?.nombre}`)
})

/**
 * Módulos (claves de FUNCION) a los que el rol puede entrar: filas de
 * ROL_FUNCION con la acción LEER sobre una FUNCION que tiene clave.
 */
export const getPermisosDeRol = cache(async (rolId: number): Promise<string[]> => {
  const db = getSupabaseServiceClient()
  const { data, error } = await db
    .from('rol_funcion')
    .select('funcion:funcion_id(clave), accion:accion_id(nombre)')
    .eq('rol_id', rolId)

  // Fail-closed: si no se pueden leer (p.ej. migración pendiente), sin permisos.
  if (error) {
    console.warn(`[RBAC] No se pudieron leer permisos del rol ${rolId}: ${error.message}`)
    return []
  }

  const claves = (data ?? [])
    .filter((fila) => fila.accion?.nombre === ACCION_ACCESO)
    .map((fila) => fila.funcion?.clave)
    .filter((clave): clave is string => Boolean(clave))
  return [...new Set(claves)]
})

/**
 * Nivel 2 — Verificación de acceso por permiso: ¿el usuario autenticado tiene
 * el permiso LEER de la ruta en ROL_FUNCION? Es la ÚNICA condición de acceso
 * a cualquier módulo (sin nombres de rol fijos en código).
 */
export async function tienePermisoModulo(ruta: string): Promise<boolean> {
  const usuario = await getCurrentUser()
  if (!usuario) return false

  const modulo = moduloPorRuta(ruta)
  if (!modulo) return true // Ruta no registrada en el catálogo: no aplica RBAC.

  const claves = await getPermisosDeRol(usuario.rol_id)
  return claves.includes(modulo.clave)
}

/**
 * ¿El rol del usuario autenticado tiene esta acción sobre el módulo (FUNCION.clave)?
 * Para operaciones que LEER no distingue. Fail-closed ante cualquier error.
 */
export async function tieneAccionModulo(clave: string, accion: AccionPermiso): Promise<boolean> {
  const usuario = await getCurrentUser()
  if (!usuario) return false
  return (await getAccionesDeRol(usuario.rol_id)).includes(`${clave}:${accion}`)
}

/**
 * Permiso de una operación: exige la acción sobre el módulo y devuelve el usuario
 * de la sesión. Es el control de las Server Actions; lanza si no hay permiso.
 */
export async function exigirPermiso(clave: string, accion: AccionPermiso = ACCION_ACCESO): Promise<UsuarioConRol> {
  const usuario = await getCurrentUser()
  if (!usuario) throw new Error('No autorizado: inicia sesión para continuar.')
  if (!(await tieneAccionModulo(clave, accion))) throw new Error(MSG_SIN_PERMISO)
  return usuario
}

/**
 * Nivel 2 — Protección de rutas: valida que el usuario autenticado tenga el
 * permiso de la ruta. Si no, redirige a la pantalla principal con el aviso
 * 'No tiene permisos para acceder a este módulo'. Usar al inicio de layouts o
 * páginas protegidas.
 */
export async function requerirAccesoModulo(ruta: string): Promise<void> {
  const usuario = await getCurrentUser()
  if (!usuario) redirect('/login')

  if (!(await tienePermisoModulo(ruta))) {
    redirect('/?aviso=sin_permiso')
  }
}
