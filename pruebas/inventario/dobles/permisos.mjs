// Doble de @/lib/permisos: permisos de ruta (ROL_PERMISO ⋈ PERMISO) por rol.
export async function getPermisosDeRol(rolId) {
  return globalThis.__cu16?.permisosRuta?.[rolId] ?? []
}
export async function tienePermisoModulo(ruta) {
  return (globalThis.__cu16?.rutasPermitidas ?? []).includes(ruta)
}
