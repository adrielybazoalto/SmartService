"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth";
import { ACCION_ACCESO, moduloPorRuta, tienePermisoModulo } from "@/lib/permisos";
import { registrarEvento } from "@/backend/bitacora";
import { obtenerIpOrigen } from "@/lib/ip";

export interface RolEntity {
  id: number;
  nombre: string;
  descripcion: string;
  letra: string;
  colorBadge: string;
}

/** Módulo con clave y ruta (fila de FUNCION con clave). `nombre` = FUNCION.clave. */
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
 * Lee desde la base de datos: roles (ROL), catálogo de módulos (FUNCION con
 * clave y ruta) y la asignación actual de cada rol (ROL_FUNCION con LEER). El Navbar y el Dashboard leen
 * la misma consulta, así que lo que se ve aquí es lo que verán los usuarios.
 */
export async function fetchRolesYPermisos(): Promise<{
  roles: RolEntity[];
  modulos: ModuloPermiso[];
  asignacion: { [rolId: number]: string[] };
  esSesionAdministrador: boolean;
}> {
  // Única condición de acceso: permiso ROLES (LEER) en rol_funcion (BD).
  if (!(await tienePermisoModulo("/roles"))) {
    throw new Error("No autorizado: tu rol no tiene el permiso del módulo Roles.");
  }
  const usuario = await requireUser();
  const esSesionAdministrador = usuario.rol?.nombre === "ADMINISTRADOR";

  const db = getSupabaseServiceClient();

  const { data: roles, error: er } = await db.from("rol").select("*").order("id");
  if (er) throw new Error(`No se pudieron cargar los roles: ${er.message}`);

  const { data: funciones, error: em } = await db
    .from("funcion")
    .select("id, clave, ruta, descripcion")
    .not("clave", "is", null)
    .order("id");
  if (em) throw new Error(`No se pudieron cargar los módulos: ${em.message}`);
  const modulos = (funciones ?? [])
    .filter((f): f is typeof f & { clave: string; ruta: string } => Boolean(f.clave && f.ruta))
    .map((f) => ({ id: f.id, nombre: f.clave, ruta: f.ruta, descripcion: f.descripcion }));

  const { data: rf, error: era } = await db
    .from("rol_funcion")
    .select("rol_id, funcion:funcion_id(clave), accion:accion_id(nombre)");
  if (era) throw new Error(`No se pudieron cargar las asignaciones: ${era.message}`);

  const asignacion: { [rolId: number]: string[] } = {};
  for (const fila of rf ?? []) {
    const clave = fila.funcion?.clave;
    if (!clave || fila.accion?.nombre !== ACCION_ACCESO) continue;
    const lista = (asignacion[fila.rol_id] ??= []);
    if (!lista.includes(clave)) lista.push(clave);
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
 * Guarda la asignación COMPLETA de módulos de un rol en ROL_FUNCION (BD) y
 * revalida el sitio para que el Navbar y el Dashboard reflejen los cambios de
 * inmediato en la siguiente carga o navegación.
 */
export async function guardarPermisosRol(
  rolId: number,
  nombresPermisos: string[],
): Promise<RespuestaAccionRoles> {
  // Única condición de acceso: permiso ROLES (LEER) en rol_funcion (BD).
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

  // Catálogo de módulos = FUNCION con clave; acceso = acción LEER.
  const { data: funciones, error: ef } = await db
    .from("funcion")
    .select("id, clave")
    .not("clave", "is", null);
  if (ef) return { ok: false, mensaje: `No se pudieron validar los permisos: ${ef.message}` };
  const idPorClave = new Map((funciones ?? []).map((f) => [f.clave as string, f.id] as [string, number]));
  if (unicos.some((c) => !idPorClave.has(c))) {
    return { ok: false, mensaje: "Uno o más permisos seleccionados no existen en el sistema." };
  }
  const { data: leer, error: ea } = await db.from("accion").select("id").eq("nombre", ACCION_ACCESO).maybeSingle();
  if (ea || !leer) return { ok: false, mensaje: "No existe la acción LEER en la tabla ACCION." };

  const seleccionadas = unicos.map((c) => idPorClave.get(c) as number);
  const quitadas = [...idPorClave.values()].filter((id) => !seleccionadas.includes(id));
  const permisosIds = seleccionadas;

  // 1) Módulos desmarcados: se quitan TODAS sus acciones para el rol.
  if (quitadas.length > 0) {
    const { error: borrado } = await db
      .from("rol_funcion")
      .delete()
      .eq("rol_id", rolId)
      .in("funcion_id", quitadas);
    if (borrado) return { ok: false, mensaje: `No se pudo actualizar: ${borrado.message}` };
  }

  // 2) Módulos marcados: se asegura LEER (las demás acciones, p. ej. CREAR en
  //    Compras o Inventario, se conservan).
  if (seleccionadas.length > 0) {
    const { error: insercion } = await db.from("rol_funcion").upsert(
      seleccionadas.map((funcionId) => ({
        rol_id: rolId,
        funcion_id: funcionId,
        accion_id: leer.id,
        descripcion: "Asignado desde /roles (Consola RBAC)",
      })),
      { onConflict: "rol_id,funcion_id,accion_id", ignoreDuplicates: true },
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