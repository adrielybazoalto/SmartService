// Doble de @/lib/permisos: permisos de ruta (ROL_PERMISO ⋈ PERMISO) por rol.
export async function getPermisosDeRol(rolId) {
  return globalThis.__cu16?.permisosRuta?.[rolId] ?? []
}
export async function tienePermisoModulo(ruta) {
  return (globalThis.__cu16?.rutasPermitidas ?? []).includes(ruta)
}
export async function tieneAccionModulo(clave, accion) {
  return (globalThis.__cu16?.accionesPermitidas ?? []).includes(`${clave}:${accion}`)
}
export async function exigirPermiso(clave, accion = 'LEER') {
  const usuario = globalThis.__cu16?.usuario
  if (!usuario) throw new Error('No autorizado: inicia sesión para continuar.')
  if (!(await tieneAccionModulo(clave, accion))) throw new Error('No autorizado: tu rol no tiene el permiso de este módulo.')
  return usuario
}
