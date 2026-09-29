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
  const [esSesionAdministrador, setEsSesionAdministrador] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const cargarConfiguracion = useCallback(async () => {
    try {
      const data = await fetchRolesYPermisos();
      setRoles(data.roles);
      setModulos(data.modulos);
      setAsignacion(data.asignacion);
      setEsSesionAdministrador(data.esSesionAdministrador);
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
  // Los permisos del rol ADMINISTRADOR solo pueden modificarlos Administradores.
  const rolBloqueado = rolSeleccionado?.nombre === "ADMINISTRADOR" && !esSesionAdministrador;

  const toggleModulo = (nombre: string) => {
    if (rolBloqueado) return;
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
        <p className="text-sm font-medium text-slate-500">Cargando roles y permisos del sistema…</p>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <div className="flex flex-col gap-6">
        {/* Cabecera */}
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <span className="inline-block rounded-md border border-lime-200 bg-lime-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-lime-700">
              RBAC • Roles y Permisos
            </span>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              Configuración de Roles y Permisos
            </h1>
            <p className="text-sm text-slate-500">
              Asignación de módulos por rol, guardada en la base de datos (
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-600">
                rol_permiso
              </code>
              ). Los cambios se reflejan al instante en el Navbar y el Dashboard.
            </p>
          </div>
          <button
            onClick={handleGuardarCambios}
            disabled={guardando || rolBloqueado}
            className="shrink-0 cursor-pointer rounded-xl bg-lime-400 px-6 py-2.5 text-sm font-semibold text-slate-900 shadow-sm shadow-lime-200/60 transition-all hover:bg-lime-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar Cambios"}
          </button>
        </div>

        {/* Notificaciones */}
        {mensajeExito && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
            ✓ {mensajeExito}
          </div>
        )}
        {mensajeError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium text-rose-700">
            ⚠ {mensajeError}
          </div>
        )}

        {rolBloqueado && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            🔒 Los permisos del rol Administrador solo pueden ser modificados por un Administrador.
          </div>
        )}

        {/* Contenedor principal */}
        <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm md:grid-cols-12">
          {/* Columna izquierda: roles */}
          <div className="space-y-2 border-b border-slate-200 bg-slate-50/60 p-4 md:col-span-4 md:border-b-0 md:border-r">
            <h2 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Roles del Sistema
            </h2>
            {roles.map((rol) => {
              const seleccionado = rolSeleccionadoId === rol.id;
              const cuenta = (asignacion[rol.id] ?? []).length;
              return (
                <button
                  key={rol.id}
                  onClick={() => setRolSeleccionadoId(rol.id)}
                  className={`flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-all cursor-pointer ${
                    seleccionado
                      ? "border border-lime-300 bg-lime-100/70 font-semibold text-slate-900 shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${rol.colorBadge}`}
                  >
                    {rol.letra}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm leading-tight font-medium text-slate-900">
                      {rol.nombre}
                    </span>
                    <span className="line-clamp-2 text-[11px] font-normal text-slate-400">
                      {rol.descripcion}
                    </span>
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {cuenta}/{modulos.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Columna derecha: módulos */}
          <div className="space-y-6 p-6 md:col-span-8">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Módulos del rol:{" "}
                <span className="text-lime-700">
                  {rolSeleccionado?.nombre}
                </span>
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {rolBloqueado
                  ? "Modo solo lectura: selecciona otro rol para gestionar sus permisos."
                  : "Activa o desactiva los módulos que este rol puede ver en el Navbar y el Dashboard."}
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
                        ? "border-lime-300/70 bg-lime-50/70"
                        : "border-slate-200 bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                            activo
                              ? "border border-lime-200 bg-lime-100 text-lime-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <IconoModulo clave={modulo.nombre} className="h-5 w-5" />
                        </span>
                        <div>
                          <h3 className="text-sm font-semibold text-slate-800">
                            {modulo.etiqueta}
                          </h3>
                          <code className="text-[11px] text-slate-500">{modulo.ruta}</code>
                        </div>
                      </div>
                      <button
                        role="switch"
                        aria-checked={activo}
                        aria-label={`Permitir ${modulo.etiqueta}`}
                        onClick={() => toggleModulo(modulo.nombre)}
                        disabled={rolBloqueado}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                          activo
                            ? "bg-lime-400"
                            : "bg-slate-200"
                        } ${rolBloqueado ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                      >
                        <span
                          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            activo ? "translate-x-5" : ""
                          }`}
                        />
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">{modulo.descripcion}</p>
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