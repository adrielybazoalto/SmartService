"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { tienePermisoModulo } from "@/lib/permisos";
import { registrarBitacora } from "@/backend/bitacora";
import { obtenerIpOrigen } from "@/lib/ip";
import {
  crearUsuario,
  actualizarUsuario as actualizarUsuarioEnBD,
  listarRoles,
  listarUsuarios as listarUsuariosEnBD,
  type Rol,
  type Usuario,
} from "@/backend/usuarios";

export interface RolEntity {
  id: number;
  nombre: string;
  descripcion?: string;
}

export interface UsuarioEntity {
  id: number;
  rol_id: number;
  nombre: string;
  correo: string;
  telefono?: string;
  estado: boolean;
  rol?: RolEntity;
}

export interface RespuestaAccion {
  ok: boolean;
  mensaje: string;
  data?: UsuarioEntity;
}

type Db = ReturnType<typeof getSupabaseServiceClient>;

/**
 * Único guard de acceso del módulo: el permiso USUARIOS debe estar ACTIVO en
 * ROL_PERMISO (BD) para la sesión actual. Devuelve el usuario autenticado.
 * Cualquier otra condición de rol se evalúa después, sobre los datos reales
 * (nunca por nombre de rol en la matriz).
 */
async function exigirAccesoUsuarios() {
  if (!(await tienePermisoModulo("/usuarios"))) {
    throw new Error("No autorizado: tu rol no tiene el permiso del módulo Usuarios.");
  }
  return requireUser();
}

/** Rola el concat de la tabla USUARIO a la entidad de la UI (nunca expone el hash `contrasena`). */
function usuarioAEntidad(u: Usuario, roles: Rol[]): UsuarioEntity {
  const rol = roles.find((r) => r.id === u.rol_id);
  return {
    id: u.id,
    rol_id: u.rol_id,
    nombre: u.nombre,
    correo: u.correo,
    telefono: u.telefono ?? undefined,
    estado: u.estado,
    rol: rol ? { id: rol.id, nombre: rol.nombre, descripcion: rol.descripcion ?? undefined } : undefined,
  };
}

/** BITÁCORA (CU06): un fallo de auditoría nunca debe interrumpir la operación. */
async function registrarAuditoria(db: Db, usuarioId: number, accion: string, detalle: string) {
  try {
    const ip = await obtenerIpOrigen();
    await registrarBitacora(db, { usuario_id: usuarioId, accion, descripcion: detalle }, ip);
  } catch (e) {
    console.error("Error al registrar en bitácora:", e);
  }
}

/** Primer mensaje legible de un error de validación zod / error de servicio. */
function mensajeDeError(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) {
    return e.issues[0]?.message ?? fallback;
  }
  return e instanceof Error ? e.message : fallback;
}

export async function listarUsuarios(): Promise<UsuarioEntity[]> {
  await exigirAccesoUsuarios();

  const db = getSupabaseServiceClient();
  const [usuarios, roles] = await Promise.all([listarUsuariosEnBD(db), listarRoles(db)]);
  return usuarios.map((u) => usuarioAEntidad(u, roles));
}

export async function obtenerRolesActivos(): Promise<RolEntity[]> {
  await exigirAccesoUsuarios();

  const db = getSupabaseServiceClient();
  const roles = await listarRoles(db);
  return roles.map((r) => ({
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? undefined,
  }));
}

/**
 * Registra un usuario REAL en la BD. La contraseña llega en texto plano solo
 * aquí (Server Action) y el servicio guarda su hash bcrypt en `usuario.contrasena`
 * (migración auth_local): nunca se persiste el texto plano.
 */
export async function registrarUsuario(
  nombre: string,
  correo: string,
  contrasena: string,
  telefono: string,
  rol_id: number
): Promise<RespuestaAccion> {
  try {
    const actor = await exigirAccesoUsuarios();

    const db = getSupabaseServiceClient();
    const nuevo = await crearUsuario(db, {
      rol_id: Number(rol_id),
      nombre: nombre.trim(),
      correo: correo.trim(),
      telefono: telefono.trim() || null,
      estado: true,
      contrasena,
    });

    await registrarAuditoria(
      db,
      actor.id,
      "REGISTRO_USUARIO",
      `Se registró una nueva cuenta para: ${nuevo.nombre} (${nuevo.correo}) con rol ID ${nuevo.rol_id}`
    );

    const roles = await listarRoles(db);
    return {
      ok: true,
      mensaje: "Usuario registrado exitosamente.",
      data: usuarioAEntidad(nuevo, roles),
    };
  } catch (e) {
    return { ok: false, mensaje: mensajeDeError(e, "No se pudo registrar el usuario.") };
  }
}

export async function actualizarUsuario(
  usuarioId: number,
  datos: { nombre: string; correo: string; telefono: string; rol_id: number }
): Promise<RespuestaAccion> {
  try {
    const actor = await exigirAccesoUsuarios();

    // Evita auto-bloqueo: un usuario no puede cambiarse su propio rol.
    if (usuarioId === actor.id && Number(datos.rol_id) !== actor.rol_id) {
      return { ok: false, mensaje: "No puedes cambiar tu propio rol de usuario." };
    }

    const db = getSupabaseServiceClient();
    await actualizarUsuarioEnBD(db, usuarioId, {
      nombre: datos.nombre.trim(),
      correo: datos.correo.trim(),
      telefono: datos.telefono.trim() || null,
      rol_id: Number(datos.rol_id),
    });

    await registrarAuditoria(
      db,
      actor.id,
      "MODIFICACION_USUARIO",
      `Se actualizaron los datos del usuario (ID: ${usuarioId})`
    );

    return { ok: true, mensaje: "Datos del usuario actualizados correctamente." };
  } catch (e) {
    return { ok: false, mensaje: mensajeDeError(e, "No se pudo actualizar el usuario.") };
  }
}

export async function cambiarEstadoCuenta(
  usuarioId: number,
  nuevoEstado: boolean
): Promise<RespuestaAccion> {
  try {
    const actor = await exigirAccesoUsuarios();
    const db = getSupabaseServiceClient();

    const { data: objetivo, error: errGet } = await db
      .from("usuario")
      .select("id, nombre, rol:rol_id(id, nombre)")
      .eq("id", usuarioId)
      .maybeSingle();
    if (errGet || !objetivo) {
      return { ok: false, mensaje: "Usuario no encontrado." };
    }

    // Protección del rol Administrador: nunca se desactiva a un ADMINISTRADOR.
    if (objetivo.rol?.nombre === "ADMINISTRADOR") {
      return {
        ok: false,
        mensaje: "Acción denegada: no se puede desactivar a un Administrador principal.",
      };
    }
    // Evita auto-bloqueo: no desactivarse a uno mismo.
    if (usuarioId === actor.id) {
      return { ok: false, mensaje: "Acción denegada: no puedes desactivar tu propia cuenta." };
    }

    const { error: errUpd } = await db
      .from("usuario")
      .update({ estado: nuevoEstado })
      .eq("id", usuarioId);
    if (errUpd) {
      return { ok: false, mensaje: `No se pudo actualizar el estado: ${errUpd.message}` };
    }

    await registrarAuditoria(
      db,
      actor.id,
      "CAMBIO_ESTADO",
      `Se cambió el estado del usuario ${objetivo.nombre} (ID: ${usuarioId}) a ${
        nuevoEstado ? "ACTIVO" : "INACTIVO"
      }`
    );

    return {
      ok: true,
      mensaje: `Cuenta de ${objetivo.nombre} ${nuevoEstado ? "activada" : "desactivada"} exitosamente.`,
    };
  } catch (e) {
    return { ok: false, mensaje: mensajeDeError(e, "No se pudo cambiar el estado de la cuenta.") };
  }
}