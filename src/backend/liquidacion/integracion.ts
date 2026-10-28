// =====================================================================
//  CU13 - Integración con src/lib del proyecto SmartService
//
//  ÚNICO archivo que conecta el CU13 con lo que ya existe en el proyecto:
//    - @/lib/supabase  -> cliente de Supabase
//    - @/lib/auth y @/lib/sesiones -> usuario que inició sesión (login propio)
//    - @/lib/ip        -> IP del cliente para la bitácora
//
//  Como cada grupo nombra distinto sus funciones, este archivo busca
//  automáticamente la función correcta entre lo que exporta cada módulo.
//  Si no la encuentra, muestra un error que lista las funciones
//  disponibles para que se escriba la llamada directa aquí.
// =====================================================================

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as libSupabase from "@/lib/supabase";
import * as libAuth from "@/lib/auth";
import * as libSesiones from "@/lib/sesiones";
import * as libIp from "@/lib/ip";
import type { UsuarioSesion } from "./types";

type Modulo = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cualquiera = any;

const esFuncion = (v: unknown): v is (...a: unknown[]) => unknown => typeof v === "function";

function esClienteSupabase(v: unknown): v is SupabaseClient {
  const c = v as Cualquiera;
  return !!c && typeof c.from === "function" && typeof c.rpc === "function";
}

function nombresExportados(...modulos: Modulo[]): string {
  return modulos.flatMap((m) => Object.keys(m)).join(", ") || "(ninguna)";
}

// ---------------------------------------------------------------------
// 1. Cliente de Supabase  (lib/supabase/index.ts)
// ---------------------------------------------------------------------
const PREFERIDOS_SUPABASE = [
  "createClient", "createServerClient", "crearCliente", "crearClienteServidor",
  "getSupabase", "obtenerSupabase", "getSupabaseClient", "supabaseServer",
  "createServiceClient", "getServiceClient", "supabaseAdmin", "supabase",
];

export async function obtenerClienteSupabase(): Promise<SupabaseClient> {
  const modulo = libSupabase as unknown as Modulo;

  // a) Nombres conocidos primero
  for (const nombre of PREFERIDOS_SUPABASE) {
    const valor = modulo[nombre];
    if (esClienteSupabase(valor)) return valor;
    if (esFuncion(valor)) {
      const r = await valor();
      if (esClienteSupabase(r)) return r;
    }
  }
  // b) Cualquier cliente ya creado que exporte el módulo
  for (const valor of Object.values(modulo)) {
    if (esClienteSupabase(valor)) return valor;
  }
  // c) Cualquier función sin parámetros que devuelva un cliente
  for (const valor of Object.values(modulo)) {
    if (esFuncion(valor) && valor.length === 0) {
      try {
        const r = await valor();
        if (esClienteSupabase(r)) return r;
      } catch {
        /* no era la función del cliente */
      }
    }
  }
  throw new Error(
    "CU13: no se encontró el cliente de Supabase en @/lib/supabase. " +
      `Exporta: ${nombresExportados(modulo)}. Escriba la llamada directa en integracion.ts.`,
  );
}

// ---------------------------------------------------------------------
// 2. Usuario que inició sesión  (lib/auth.ts o lib/sesiones.ts)
// ---------------------------------------------------------------------
const PREFERIDOS_USUARIO = [
  "obtenerUsuarioActual", "obtenerUsuarioSesion", "obtenerSesionActual", "obtenerSesion",
  "usuarioActual", "getUsuarioActual", "getCurrentUser", "getSessionUser",
  "getUser", "getSession", "currentUser", "requireUser", "requireAuth", "auth",
];

function normalizarUsuario(r: Cualquiera): { id: number; nombre: string; rol: unknown; activo: boolean } | null {
  if (!r) return null;
  const u = r.usuario ?? r.user ?? r.data?.usuario ?? r.data?.user ?? r;
  const id = Number(u?.id ?? u?.usuario_id ?? u?.usuarioId ?? u?.userId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    id,
    nombre: String(u?.nombre ?? u?.name ?? ""),
    rol: u?.rol ?? u?.rol_nombre ?? u?.rolNombre ?? u?.role ?? u?.rol_id ?? u?.rolId ?? null,
    activo: u?.estado !== false && u?.activo !== false,
  };
}

async function resolverNombreRol(db: SupabaseClient, rol: unknown): Promise<string | null> {
  if (rol === null || rol === undefined) return null;
  if (typeof rol === "object") return (rol as Cualquiera).nombre ?? null;
  if (typeof rol === "number" || /^\d+$/.test(String(rol))) {
    const { data } = await db.from("rol").select("nombre").eq("id", Number(rol)).maybeSingle();
    return (data as Cualquiera)?.nombre ?? null;
  }
  return String(rol);
}

export async function obtenerUsuarioSesion(db: SupabaseClient): Promise<UsuarioSesion | null> {
  const modulos = [libAuth as unknown as Modulo, libSesiones as unknown as Modulo];

  for (const modulo of modulos) {
    for (const nombre of PREFERIDOS_USUARIO) {
      const fn = modulo[nombre];
      if (!esFuncion(fn)) continue;
      const usuario = normalizarUsuario(await fn());
      if (!usuario) continue;

      // Completa nombre/rol/estado desde la tabla usuario si hace falta
      let rolNombre = await resolverNombreRol(db, usuario.rol);
      if (!rolNombre || !usuario.nombre) {
        const { data } = await db
          .from("usuario")
          .select("nombre, estado, rol ( nombre )")
          .eq("id", usuario.id)
          .maybeSingle();
        const fila = data as Cualquiera;
        const rol = Array.isArray(fila?.rol) ? fila.rol[0] : fila?.rol;
        rolNombre = rolNombre ?? rol?.nombre ?? null;
        if (fila?.estado === false) usuario.activo = false;
        if (!usuario.nombre) usuario.nombre = fila?.nombre ?? "";
      }
      return { id: usuario.id, nombre: usuario.nombre, rol: rolNombre, activo: usuario.activo };
    }
  }

  const disponibles = nombresExportados(...modulos);
  const hayCandidata = modulos.some((m) => PREFERIDOS_USUARIO.some((n) => esFuncion(m[n])));
  if (!hayCandidata) {
    throw new Error(
      "CU13: no se encontró la función del usuario logueado en @/lib/auth ni @/lib/sesiones. " +
        `Exportan: ${disponibles}. Escriba la llamada directa en integracion.ts.`,
    );
  }
  return null; // hay función, pero no hay sesión iniciada
}

// ---------------------------------------------------------------------
// 3. IP del cliente  (lib/ip.ts)
// ---------------------------------------------------------------------
const PREFERIDOS_IP = ["obtenerIp", "obtenerIP", "obtenerIpCliente", "getIp", "getIP", "getClientIp", "getClientIP", "ipCliente"];

export async function obtenerIpCliente(): Promise<string | null> {
  const modulo = libIp as unknown as Modulo;
  const h = await headers();

  const candidatas = [
    ...PREFERIDOS_IP.map((n) => modulo[n]),
    ...Object.values(modulo),
  ].filter(esFuncion);

  for (const fn of candidatas) {
    try {
      const r = await (fn.length > 0 ? fn(h) : fn());
      if (typeof r === "string" && r.trim()) return r.split(",")[0].trim();
      if (r === null) return null;
    } catch {
      /* probar la siguiente */
    }
  }

  // Respaldo: cabeceras estándar del proxy (Vercel)
  const reenviada = h.get("x-forwarded-for");
  if (reenviada) return reenviada.split(",")[0].trim();
  return h.get("x-real-ip");
}
