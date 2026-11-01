"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/auth";
import { exigirPermiso, moduloPorRuta, tieneAccionModulo } from "@/lib/permisos";
import { crearRol } from "@/backend/usuarios/service";
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
  /** Nombre de MODULO: agrupa las filas de la matriz. */
  grupo: string;
}

export interface AccionEntity {
  id: number;
  nombre: string;
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
 * Lee desde la base de datos: roles (ROL), módulos (FUNCION con clave y ruta,
 * agrupados por MODULO), acciones (ACCION) y la matriz de cada rol (ROL_FUNCION,
 * como 'funcionId:accionId'). El Navbar y el Dashboard leen la misma matriz, así
 * que lo que se ve aquí es lo que verán los usuarios.
 */
export async function fetchRolesYPermisos(): Promise<{
  roles: RolEntity[];
  modulos: ModuloPermiso[];
  acciones: AccionEntity[];
  asignacion: { [rolId: number]: string[] };
  esSesionAdministrador: boolean;
}> {
  const usuario = await exigirPermiso("ROLES");
  const esSesionAdministrador = usuario.rol?.nombre === "ADMINISTRADOR";

  const db = getSupabaseServiceClient();

  const { data: roles, error: er } = await db.from("rol").select("*").order("id");
  if (er) throw new Error(`No se pudieron cargar los roles: ${er.message}`);

  const { data: funciones, error: em } = await db
    .from("funcion")
    .select("id, clave, ruta, descripcion, modulo:modulo_id(nombre)")
    .not("clave", "is", null)
    .order("modulo_id")
    .order("id");
  if (em) throw new Error(`No se pudieron cargar los módulos: ${em.message}`);

  const { data: acciones, error: ea } = await db.from("accion").select("id, nombre").order("id");
  if (ea) throw new Error(`No se pudieron cargar las acciones: ${ea.message}`);

  const { data: rf, error: era } = await db
    .from("rol_funcion")
    .select("rol_id, funcion_id, accion_id, funcion:funcion_id(clave)");
  if (era) throw new Error(`No se pudieron cargar las asignaciones: ${era.message}`);

  const asignacion: { [rolId: number]: string[] } = {};
  for (const fila of rf ?? []) {
    if (!fila.funcion?.clave) continue;
    (asignacion[fila.rol_id] ??= []).push(`${fila.funcion_id}:${fila.accion_id}`);
  }

  return {
    roles: (roles ?? []).map(rolAEntidad),
    modulos: (funciones ?? [])
      .filter((f): f is typeof f & { clave: string; ruta: string } => Boolean(f.clave && f.ruta))
      .map((f) => ({
        id: f.id,
        nombre: f.clave,
        ruta: f.ruta,
        descripcion: f.descripcion ?? "",
        etiqueta: moduloPorRuta(f.ruta)?.etiqueta ?? f.clave,
        grupo: f.modulo?.nombre ?? "Otros",
      })),
    acciones: acciones ?? [],
    asignacion,
    esSesionAdministrador,
  };
}

/**
 * Guarda la matriz COMPLETA de un rol en una sola transacción
 * (fn_guardar_permisos_rol) y revalida el sitio para que el Navbar y el Dashboard
 * reflejen los cambios en la siguiente carga o navegación.
 */
export async function guardarPermisosRol(
  rolId: number,
  permisos: { funcion_id: number; accion_id: number }[],
): Promise<RespuestaAccionRoles> {
  if (!(await tieneAccionModulo("ROLES", "ACTUALIZAR"))) {
    return { ok: false, mensaje: "No autorizado: tu rol no tiene el permiso del módulo Roles." };
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

  // database.types.ts aún no declara las funciones SQL (se regenera en la Fase 10)
  const cliente = db as unknown as SupabaseClient;
  const { error } = await cliente.rpc("fn_guardar_permisos_rol", {
    p_usuario_id: usuario.id,
    p_rol_id: rolId,
    p_permisos: permisos,
    p_ip: await obtenerIpOrigen(),
  });
  if (error) return { ok: false, mensaje: error.message };

  // Reflejo inmediato: invalida el caché del layout raíz (Navbar) y del panel.
  revalidatePath("/", "layout");
  revalidatePath("/roles");
  revalidatePath("/");

  return {
    ok: true,
    mensaje: `Permisos del rol ${rol.nombre} guardados en la base de datos y aplicados al instante.`,
  };
}

/** Flujo "Nuevo Rol" del CU04: nace sin permisos y se configura en la matriz. */
export async function crearRolAccion(nombre: string, descripcion: string): Promise<RespuestaAccionRoles> {
  if (!(await tieneAccionModulo("ROLES", "CREAR"))) {
    return { ok: false, mensaje: "No autorizado: tu rol no tiene el permiso del módulo Roles." };
  }
  const usuario = await requireUser();
  const nombreRol = nombre.trim().toUpperCase();
  if (!nombreRol) return { ok: false, mensaje: "El nombre del rol es obligatorio." };

  const db = getSupabaseServiceClient();
  const { data: existente } = await db.from("rol").select("id").eq("nombre", nombreRol).maybeSingle();
  if (existente) return { ok: false, mensaje: `Ya existe un rol con el nombre ${nombreRol}.` };

  try {
    await crearRol(db, { nombre: nombreRol, descripcion: descripcion.trim() || null });
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : "No se pudo crear el rol." };
  }

  await registrarEvento(db, {
    usuario_id: usuario.id,
    accion: "CREAR_ROL",
    descripcion: `Se creó el rol ${nombreRol}`,
  }, await obtenerIpOrigen());

  revalidatePath("/roles");
  return { ok: true, mensaje: `Rol ${nombreRol} creado. Ahora asígnale sus permisos.` };
}
