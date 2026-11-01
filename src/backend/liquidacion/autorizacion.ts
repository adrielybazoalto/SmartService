// =====================================================================
//  CU13 - Autorización: quién puede emitir notas de servicio
// =====================================================================

import { tieneAccionModulo, type AccionPermiso } from "@/lib/permisos";
import { ErrorNegocio, MENSAJES } from "./errores";
import type { UsuarioSesion } from "./types";

/** El permiso sale de ROL_FUNCION, no del nombre del rol: CREAR emite y PROCESAR cobra. */
export async function verificarPermisoNota(
  usuario: UsuarioSesion | null,
  accion: AccionPermiso,
): Promise<UsuarioSesion> {
  if (!usuario || !usuario.activo) throw new ErrorNegocio(MENSAJES.SIN_SESION);
  if (!(await tieneAccionModulo("NOTAS_SERVICIO", accion))) throw new ErrorNegocio(MENSAJES.SIN_PERMISO);
  return usuario;
}
