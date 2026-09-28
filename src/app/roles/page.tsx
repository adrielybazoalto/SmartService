"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchRolesYPermisos,
  guardarPermisosRol,
  RolEntity,
  ModuloPermiso,
} from "../actions/roles";
import { IconoModulo } from "@/components/icono-modulo";

/**
 * Consola RBAC (módulo /roles): lee roles, módulos y asignaciones DESDE LA
 * BASE DE DATOS (ROL, PERMISO, ROL_PERMISO). Al guardar, persiste en la BD y
 * refresca el sitio (router.refresh + revalidatePath) para que el Dashboard y
 * el Navbar reflejen los cambios de inmediato en cualquier sesión.
 */
export default function RolesPage() {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  const [roles, setRoles] = useState<RolEntity[]>([]);
  const [modulos, setModulos] = useState<ModuloPermiso[]>([]);
  const [asignacion, setAsignacion] = useState<{ [rolId: number]: string[] }>({});
  const [rolSeleccionadoId, setRolSeleccionadoId] = useState<number>(1);
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const cargarConfiguracion = useCallback(async () => {
    try {
      const data = await fetchRolesYPermisos();
      setRoles(data.roles);
      setModulos(data.modulos);
      setAsignacion(data.asignacion);
      setRolSeleccionadoId((prev) =>
        data.roles.some((r) => r.id === prev) ? prev : data.roles[0]?.id ?? 1,
      );
    } catch {
      setMensajeError("Error al cargar los permisos desde el servidor.");
    } finally {
      setMontado(true);
    }
  }, []);

  useEffect(() => {
    cargarConfiguracion();
  }, [cargarConfiguracion]);

  const rolSeleccionado = roles.find((r) => r.id === rolSeleccionadoId);
  const activosDelRol = new Set(asignacion[rolSeleccionadoId] ?? []);

  const toggleModulo = (nombre: string) => {
    setAsignacion((prev) => {
      const actuales = new Set(prev[rolSeleccionadoId] ?? []);
      if (actuales.has(nombre)) actuales.delete(nombre);
      else actuales.add(nombre);
      return { ...prev, [rolSeleccionadoId]: [...actuales] };
    });
  };

  const handleGuardarCambios = async () => {
    setGuardando(true);
    setMensajeError(null);
    setMensajeExito(null);
    try {
      const listaActiva = modulos
        .filter((m) => activosDelRol.has(m.nombre))
        .map((m) => m.nombre);
      const resp = await guardarPermisosRol(rolSeleccionadoId, listaActiva);
      if (resp.ok) {
        setMensajeExito(resp.mensaje);
        router.refresh(); // re-renderiza los server components (Navbar, etc.)
        await cargarConfiguracion(); // resincroniza con la BD
      } else {
        setMensajeError(resp.mensaje);
      }
    } catch (e) {
      setMensajeError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  if (!montado) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm font-medium text-zinc-500">Cargando roles y permisos del sistema…</p>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="flex flex-col gap-6">
        {/* Cabecera */}
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between dark:border-zinc-800 dark:bg-zinc-950">
          <div>
            <span className="inline-block rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              RBAC • Roles y Permisos
            </span>
            <h1 className="mt-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              Configuración de Roles y Permisos
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Asignación de módulos por rol, guardada en la base de datos (
              <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">
                rol_permiso
              </code>
              ). Los cambios se reflejan al instante en el Navbar y el Dashboard.
            </p>
          </div>
          <button
            onClick={handleGuardarCambios}
            disabled={guardando}
            className="shrink-0 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
          >
            {guardando ? "Guardando…" : "Guardar Cambios"}
          </button>
        </div>

        {/* Notificaciones */}
        {mensajeExito && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            ✓ {mensajeExito}
          </div>
        )}
        {mensajeError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
            ⚠ {mensajeError}
          </div>
        )}

        {/* Contenedor principal */}
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:grid-cols-12 dark:border-zinc-800 dark:bg-zinc-950">
          {/* Columna izquierda: roles */}
          <div className="space-y-2 border-b border-zinc-200 bg-zinc-50/60 p-4 md:col-span-4 md:border-b-0 md:border-r dark:border-zinc-800 dark:bg-zinc-900/40">
            <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Roles del Sistema
            </h2>
            {roles.map((rol) => {
              const seleccionado = rolSeleccionadoId === rol.id;
              const cuenta = (asignacion[rol.id] ?? []).length;
              return (
                <button
                  key={rol.id}
                  onClick={() => setRolSeleccionadoId(rol.id)}
                  className={`flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-all ${
                    seleccionado
                      ? "border border-zinc-200 bg-white font-semibold text-zinc-900 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
                      : "text-zinc-600 hover:bg-white/60 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900/60"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${rol.colorBadge}`}
                  >
                    {rol.letra}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm leading-tight font-medium text-zinc-900 dark:text-zinc-50">
                      {rol.nombre}
                    </span>
                    <span className="line-clamp-2 text-[11px] font-normal text-zinc-400">
                      {rol.descripcion}
                    </span>
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {cuenta}/{modulos.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Columna derecha: módulos */}
          <div className="space-y-6 p-6 md:col-span-8">
            <div className="border-b border-zinc-100 pb-4 dark:border-zinc-800">
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Módulos del rol:{" "}
                <span className="text-emerald-600 dark:text-emerald-400">
                  {rolSeleccionado?.nombre}
                </span>
              </h2>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Activa o desactiva los módulos que este rol puede ver en el Navbar y el Dashboard.
              </p>
            </div>

            <div className="grid max-h-[620px] grid-cols-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-2">
              {modulos.map((modulo) => {
                const activo = activosDelRol.has(modulo.nombre);
                return (
                  <div
                    key={modulo.id}
                    className={`space-y-3 rounded-xl border p-4 transition-all ${
                      activo
                        ? "border-emerald-300 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/30"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-2 dark:border-zinc-800">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                            activo
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                              : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          <IconoModulo clave={modulo.nombre} className="h-5 w-5" />
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                            {modulo.etiqueta}
                          </h3>
                          <code className="text-[11px] text-zinc-400">{modulo.ruta}</code>
                        </div>
                      </div>
                      <button
                        role="switch"
                        aria-checked={activo}
                        aria-label={`Permitir ${modulo.etiqueta}`}
                        onClick={() => toggleModulo(modulo.nombre)}
                        className={`relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                          activo
                            ? "bg-emerald-500"
                            : "bg-zinc-300 dark:bg-zinc-700"
                        }`}
                      >
                        <span
                          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            activo ? "translate-x-5" : ""
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{modulo.descripcion}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}