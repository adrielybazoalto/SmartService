import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { moduloPorRuta } from '@/lib/navigation'

/**
 * RBAC por rutas (Nivel 1 y 2).
 *
 * El catálogo de módulos (`MODULOS`) y `moduloPorRuta()` viven en
 * `src/lib/navigation.ts`, la **única fuente de verdad** del alcance del
 * sistema (compartida con el Sidebar y el panel principal). Este módulo solo
 * aporta la parte de servidor: la matriz de permisos VIVE EN LA BASE DE DATOS
 * (PERMISO ⋈ ROL_PERMISO), de modo que el Administrador podrá editar los
 * permisos desde /roles sin tocar el código. Cualquier error de lectura opera
 * en modo "fail-closed" (sin permisos) por seguridad.
 *
 * Se reexportan `MODULOS`, `moduloPorRuta` y `ModuloRegistrado` para los
 * consumidores existentes.
 */

export { MODULOS, moduloPorRuta } from '@/lib/navigation'
export type { ModuloRegistrado } from '@/lib/navigation'

/** Permisos (claves) activos de un rol, leídos de ROL_PERMISO ⋈ PERMISO. */
export const getPermisosDeRol = cache(async (rolId: number): Promise<string[]> => {
  const db = getSupabaseServiceClient()
  const { data, error } = await db
    .from('rol_permiso')
    .select('permiso:permiso_id(nombre)')
    .eq('rol_id', rolId)

  // Fail-closed: si no se pueden leer (p.ej. migración pendiente), sin permisos.
  if (error) {
    console.warn(`[RBAC] No se pudieron leer permisos del rol ${rolId}: ${error.message}`)
    return []
  }

  return (data ?? [])
    .map((fila) => fila.permiso?.nombre)
    .filter((nombre): nombre is string => Boolean(nombre))
})

/**
 * Nivel 2 — Verificación de acceso por permiso: ¿el usuario autenticado tiene
 * el permiso ACTIVO de la ruta en ROL_PERMISO? Es la ÚNICA condición de acceso
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
