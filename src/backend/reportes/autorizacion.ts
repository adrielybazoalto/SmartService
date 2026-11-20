// =====================================================================
//  CU20 - Autorización: solo quien tiene el permiso REPORTES.
//  LEER = generar reportes, PROCESAR = exportar (ROL_FUNCION en la BD;
//  la migración se lo da solo al ADMINISTRADOR).
// =====================================================================

import { tieneAccionModulo, type AccionPermiso } from "@/lib/permisos";
import { ErrorNegocio, MENSAJES } from "./errores";
import type { UsuarioSesion } from "./types";

export const CLAVE_MODULO_REPORTES = "REPORTES";

export async function verificarPermisoReporte(
  usuario: UsuarioSesion | null,
  accion: Extract<AccionPermiso, "LEER" | "PROCESAR"> = "LEER",
): Promise<UsuarioSesion> {
  if (!usuario || !usuario.activo) throw new ErrorNegocio(MENSAJES.SIN_SESION);
  if (!(await tieneAccionModulo(CLAVE_MODULO_REPORTES, accion))) {
    throw new ErrorNegocio(accion === "PROCESAR" ? MENSAJES.SIN_PERMISO_EXPORTAR : MENSAJES.SIN_PERMISO);
  }
  return usuario;
}
