// =====================================================================
//  CU13 - Autorización: quién puede emitir notas de servicio
// =====================================================================

import { ErrorNegocio, MENSAJES } from "./errores";
import type { UsuarioSesion } from "./types";

/** Roles autorizados (actor del CU13: Encargado). */
export const ROLES_PERMITIDOS = ["ENCARGADO", "ADMINISTRADOR"];

export function verificarPermisoEmitirNota(usuario: UsuarioSesion | null): UsuarioSesion {
  if (!usuario || !usuario.activo) throw new ErrorNegocio(MENSAJES.SIN_SESION);
  if (!usuario.rol || !ROLES_PERMITIDOS.includes(usuario.rol.toUpperCase())) {
    throw new ErrorNegocio(MENSAJES.SIN_PERMISO);
  }
  return usuario;
}
