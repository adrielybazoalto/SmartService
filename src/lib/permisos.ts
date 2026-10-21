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
  /** Breve descripción mostrada en las tarjetas del panel principal. */
  descripcion: string
}

/**
 * Catálogo de módulos. La fila en PERMISO (BD) otorga el acceso; el orden
 * aquí define el orden de los enlaces del navbar y de las tarjetas del panel.
 */
export const MODULOS: ModuloRegistrado[] = [
  { clave: 'USUARIOS', ruta: '/usuarios', etiqueta: 'Usuarios', descripcion: 'Gestión de usuarios del sistema' },
  { clave: 'ROLES', ruta: '/roles', etiqueta: 'Roles', descripcion: 'Roles y matriz de permisos' },
  { clave: 'BITACORA', ruta: '/bitacora', etiqueta: 'Bitácora', descripcion: 'Auditoría de eventos y accesos' },
  { clave: 'CLIENTES', ruta: '/clientes', etiqueta: 'Clientes', descripcion: 'Gestión de clientes y establecimientos' },
  { clave: 'COTIZACIONES', ruta: '/cotizaciones', etiqueta: 'Cotizaciones', descripcion: 'Cotizaciones y servicios' },
  { clave: 'SERVICIOS', ruta: '/servicios', etiqueta: 'Servicios', descripcion: 'Catálogo de servicios técnicos y tarifas' },
  { clave: 'PROVEEDORES', ruta: '/proveedores', etiqueta: 'Proveedores', descripcion: 'Gestión de proveedores y catálogo de mayoristas' },
  { clave: 'COMPRAS', ruta: '/compras', etiqueta: 'Compras', descripcion: 'Registro de compras de equipos e insumos' },
  { clave: 'INVENTARIO', ruta: '/inventario', etiqueta: 'Inventario', descripcion: 'Stock, movimientos de kárdex y ajustes' },
  { clave: 'ORDENES_TRABAJO', ruta: '/ordenes-trabajo', etiqueta: 'Órdenes de trabajo', descripcion: 'Órdenes de trabajo y asignaciones' },
  { clave: 'ASIGNAR_TECNICOS', ruta: '/asignar-tecnicos', etiqueta: 'Asignar técnicos', descripcion: 'Programación y asignación de cuadrillas técnicas' },
  { clave: 'CAJA', ruta: '/caja', etiqueta: 'Caja', descripcion: 'Control y arqueo de caja' },
  { clave: 'VENTAS', ruta: '/ventas', etiqueta: 'Ventas', descripcion: 'Registro de ventas' },
  { clave: 'PERFIL', ruta: '/perfil', etiqueta: 'Mi perfil', descripcion: 'Configuración de perfil personal' },
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