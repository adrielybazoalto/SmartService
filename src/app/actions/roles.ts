"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth";
import { moduloPorRuta, tienePermisoModulo } from "@/lib/permisos";
import { registrarEvento } from "@/backend/bitacora";
import { obtenerIpOrigen } from "@/lib/ip";

export interface RolEntity {
  id: number;
  nombre: string;
  descripcion: string;
  letra: string;
  colorBadge: string;
}

/** Permiso a nivel de módulo/ruta (fila de la tabla PERMISO de la BD). */
export interface ModuloPermiso {
  id: number;
  nombre: string;
  ruta: string;
  descripcion: string;
  etiqueta: string;
}

export interface RespuestaAccionRoles {
  ok: boolean;
  mensaje: string;
}

const COLORES_BADGE: Record<string, string> = {
  ADMINISTRADOR: "bg-purple-100 text-purple-700 border-purple-300",
  ENCARGADO: "bg-blue-100 text-blue-700 border-blue-300",
  TECNICO: "bg-emerald-100 text-emerald-700 border-emerald-300",
};

function rolAEntidad(rol: { id: number; nombre: string; descripcion: string | null }): RolEntity {
  return {
    id: rol.id,
    nombre: rol.nombre,
    descripcion: rol.descripcion ?? "",
    letra: rol.nombre.charAt(0),
    colorBadge: COLORES_BADGE[rol.nombre] ?? "bg-zinc-100 text-zinc-700 border-zinc-300",
  };
}

/**
 * Lee desde la base de datos: roles (ROL), catálogo de módulos (PERMISO) y la
 * asignación actual de cada rol (ROL_PERMISO). El Navbar y el Dashboard leen
 * la misma consulta, así que lo que se ve aquí es lo que verán los usuarios.
 */
export async function fetchRolesYPermisos(): Promise<{
  roles: RolEntity[];
  modulos: ModuloPermiso[];
  asignacion: { [rolId: number]: string[] };
  esSesionAdministrador: boolean;
}> {
  // Única condición de acceso: permiso ROLES activo en rol_permiso (BD).
  if (!(await tienePermisoModulo("/roles"))) {
    throw new Error("No autorizado: tu rol no tiene el permiso del módulo Roles.");
  }
  const usuario = await requireUser();
  const esSesionAdministrador = usuario.rol?.nombre === "ADMINISTRADOR";

  const db = getSupabaseServiceClient();

  const { data: roles, error: er } = await db.from("rol").select("*").order("id");
  if (er) throw new Error(`No se pudieron cargar los roles: ${er.message}`);

  const { data: modulos, error: em } = await db.from("permiso").select("*").order("id");
  if (em) throw new Error(`No se pudieron cargar los módulos: ${em.message}`);

  const { data: rp, error: era } = await db
    .from("rol_permiso")
    .select("rol_id, permiso:permiso_id(nombre)");
  if (era) throw new Error(`No se pudieron cargar las asignaciones: ${era.message}`);

  const asignacion: { [rolId: number]: string[] } = {};
  for (const fila of rp ?? []) {
    const nombre = fila.permiso?.nombre;
    if (!nombre) continue;
    (asignacion[fila.rol_id] ??= []).push(nombre);
  }

  return {
    roles: (roles ?? []).map(rolAEntidad),
    modulos: (modulos ?? []).map((m) => ({
      id: m.id,
      nombre: m.nombre,
      ruta: m.ruta,
      descripcion: m.descripcion ?? "",
      etiqueta: moduloPorRuta(m.ruta)?.etiqueta ?? m.nombre,
    })),
    asignacion,
    esSesionAdministrador,
  };
}

/**
 * Guarda la asignación COMPLETA de módulos de un rol en ROL_PERMISO (BD) y
 * revalida el sitio para que el Navbar y el Dashboard reflejen los cambios de
 * inmediato en la siguiente carga o navegación.
 */
export async function guardarPermisosRol(
  rolId: number,
  nombresPermisos: string[],
): Promise<RespuestaAccionRoles> {
  // Única condición de acceso: permiso ROLES activo en rol_permiso (BD).
  if (!(await tienePermisoModulo("/roles"))) {
    return {
      ok: false,
      mensaje: "No autorizado: tu rol no tiene el permiso del módulo Roles.",
    };
  }
  const usuario = await requireUser();

  const db = getSupabaseServiceClient();
  const { data: rol, error: erRol } = await db
    .from("rol")
    .select("id, nombre")
    .eq("id", rolId)
    .maybeSingle();
  if (erRol) return { ok: false, mensaje: "No se pudo consultar el rol seleccionado." };
  if (!rol) return { ok: false, mensaje: "El rol seleccionado no es válido." };

  // Protección del rol ADMINISTRADOR: solo un Administrador puede modificar
  // sus permisos (peticiones de otros roles se rechazan por autorización).
  if (rol.nombre === "ADMINISTRADOR" && usuario.rol?.nombre !== "ADMINISTRADOR") {
    return {
      ok: false,
      mensaje: "No tienes permisos para modificar el rol Administrador.",
    };
  }

  const unicos = [...new Set(nombresPermisos)];
  let permisosIds: number[] = [];

  if (unicos.length > 0) {
    const { data: permisos, error } = await db
      .from("permiso")
      .select("id, nombre")
      .in("nombre", unicos);
    if (error) return { ok: false, mensaje: `No se pudieron validar los permisos: ${error.message}` };
    if ((permisos ?? []).length !== unicos.length) {
      return { ok: false, mensaje: "Uno o más permisos seleccionados no existen en el sistema." };
    }
    permisosIds = (permisos ?? []).map((p) => p.id);
  }

  // Reemplaza la asignación completa del rol (pequeña y atómica: ≤8 filas).
  const { error: borrado } = await db.from("rol_permiso").delete().eq("rol_id", rolId);
  if (borrado) return { ok: false, mensaje: `No se pudo actualizar: ${borrado.message}` };

  if (permisosIds.length > 0) {
    const { error: insercion } = await db.from("rol_permiso").insert(
      permisosIds.map((permisoId) => ({
        rol_id: rolId,
        permiso_id: permisoId,
        descripcion: "Asignado desde /roles (Consola RBAC)",
      })),
    );
    if (insercion) return { ok: false, mensaje: `No se pudo guardar: ${insercion.message}` };
  }

  const ip = await obtenerIpOrigen();
  await registrarEvento(db, {
    usuario_id: usuario.id,
    accion: "CONFIGURAR_ROLES_PERMISOS",
    descripcion: `Se guardaron ${permisosIds.length} permiso(s) de módulos para el rol ${rol.nombre}`,
  }, ip);

  // Reflejo inmediato: invalida el caché del layout raíz (Navbar) y del panel.
  revalidatePath("/", "layout");
  revalidatePath("/roles");
  revalidatePath("/");

  return {
    ok: true,
    mensaje: `Permisos del rol ${rol.nombre} guardados en la base de datos y aplicados al instante.`,
  };
}