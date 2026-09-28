import { cache } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase/service'

/**
 * RBAC por rutas (Nivel 1 y 2).
 * La matriz de permisos VIVE EN LA BASE DE DATOS (PERMISO ⋈ ROL_PERMISO):
 * la interfaz del menú consulta aquí los módulos activos de cada rol, de modo
 * que el Administrador podrá editar los permisos desde /roles (futuro) sin
 * tocar el código. Cualquier error de lectura opera en modo "fail-closed"
 * (sin permisos) por seguridad.
 */

export interface ModuloRegistrado {
  /** Clave del permiso en PERMISO.nombre (p. ej. 'USUARIOS'). */
  clave: string
  ruta: string
  etiqueta: string
  /** true si la página existe hoy; los módulos futuros aparecerán al crearse. */
  implementado: boolean
}

/** Catálogo de módulos. La fila en PERMISO (BD) otorga el acceso. */
export const MODULOS: ModuloRegistrado[] = [
  { clave: 'PERFIL', ruta: '/perfil', etiqueta: 'Mi perfil', implementado: true },
  { clave: 'USUARIOS', ruta: '/usuarios', etiqueta: 'Usuarios', implementado: true },
  { clave: 'ROLES', ruta: '/roles', etiqueta: 'Roles', implementado: true },
  { clave: 'BITACORA', ruta: '/bitacora', etiqueta: 'Bitácora', implementado: true },
  { clave: 'COTIZACIONES', ruta: '/cotizaciones', etiqueta: 'Cotizaciones', implementado: false },
  { clave: 'ORDENES_TRABAJO', ruta: '/ordenes-trabajo', etiqueta: 'Órdenes de trabajo', implementado: false },
  { clave: 'CAJA', ruta: '/caja', etiqueta: 'Caja', implementado: false },
  { clave: 'VENTAS', ruta: '/ventas', etiqueta: 'Ventas', implementado: false },
]

export function moduloPorRuta(ruta: string): ModuloRegistrado | undefined {
  return MODULOS.find((m) => m.ruta === ruta)
}

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

/** Módulos implementados que el usuario autenticado puede ver (Nivel 1). */
export async function getModulosPermitidos(): Promise<ModuloRegistrado[]> {
  const usuario = await getCurrentUser()
  if (!usuario) return []

  const claves = await getPermisosDeRol(usuario.rol_id)
  return MODULOS.filter((m) => m.implementado && claves.includes(m.clave))
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

  const modulo = moduloPorRuta(ruta)
  if (!modulo) return // Ruta no registrada en el catálogo: no aplica RBAC.

  const claves = await getPermisosDeRol(usuario.rol_id)
  if (!claves.includes(modulo.clave)) {
    redirect('/?aviso=sin_permiso')
  }
}