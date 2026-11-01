"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  crearRolAccion,
  fetchRolesYPermisos,
  guardarPermisosRol,
  RolEntity,
  ModuloPermiso,
  AccionEntity,
} from "../actions/roles";
import { IconoModulo } from "@/components/icono-modulo";
import { ACCIONES_PROTEGIDAS_ADMIN, MODULOS_PROTEGIDOS_ADMIN } from "@/lib/navigation";
import { PageHeaderBadge } from "@/components/page-header-badge";

const celda = (moduloId: number, accionId: number) => `${moduloId}:${accionId}`;

/**
 * Consola RBAC (módulo /roles): lee roles, módulos y acciones DESDE LA BASE DE
 * DATOS (ROL, FUNCION, ACCION, ROL_FUNCION) y edita la matriz función × acción
 * agrupada por módulo. Al guardar, persiste en una sola transacción y refresca
 * el sitio para que el Dashboard y el Navbar reflejen los cambios de inmediato.
 */
export default function RolesPage() {
  const router = useRouter();
  const [montado, setMontado] = useState(false);
  const [roles, setRoles] = useState<RolEntity[]>([]);
  const [modulos, setModulos] = useState<ModuloPermiso[]>([]);
  const [acciones, setAcciones] = useState<AccionEntity[]>([]);
  const [asignacion, setAsignacion] = useState<{ [rolId: number]: string[] }>({});
  const [rolSeleccionadoId, setRolSeleccionadoId] = useState<number>(1);
  const [esSesionAdministrador, setEsSesionAdministrador] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [creandoRol, setCreandoRol] = useState(false);
  const [nombreRol, setNombreRol] = useState("");
  const [descripcionRol, setDescripcionRol] = useState("");

  /** Aplica la configuración leída de la BD (solo desde callbacks asíncronos). */
  const aplicarConfiguracion = useCallback(
    (data: Awaited<ReturnType<typeof fetchRolesYPermisos>>) => {
      setRoles(data.roles);
      setModulos(data.modulos);
      setAcciones(data.acciones);
      setAsignacion(data.asignacion);
      setEsSesionAdministrador(data.esSesionAdministrador);
      setRolSeleccionadoId((prev) =>
        data.roles.some((r) => r.id === prev) ? prev : data.roles[0]?.id ?? 1,
      );
    },
    [],
  );

  /** Recarga y resincroniza con la BD (usado tras guardar cambios). */
  const cargarConfiguracion = useCallback(async () => {
    try {
      aplicarConfiguracion(await fetchRolesYPermisos());
    } catch {
      setMensajeError("Error al cargar los permisos desde el servidor.");
    } finally {
      setMontado(true);
    }
  }, [aplicarConfiguracion]);

  // Carga inicial al montar la pantalla (setState solo en callbacks asíncronos).
  useEffect(() => {
    let activo = true;
    fetchRolesYPermisos()
      .then((data) => {
        if (activo) aplicarConfiguracion(data);
      })
      .catch(() => {
        if (activo) setMensajeError("Error al cargar los permisos desde el servidor.");
      })
      .finally(() => {
        if (activo) setMontado(true);
      });
    return () => {
      activo = false;
    };
  }, [aplicarConfiguracion]);

  const rolSeleccionado = roles.find((r) => r.id === rolSeleccionadoId);
  const activosDelRol = new Set(asignacion[rolSeleccionadoId] ?? []);
  // Los permisos del rol ADMINISTRADOR solo pueden modificarlos Administradores.
  const rolBloqueado = rolSeleccionado?.nombre === "ADMINISTRADOR" && !esSesionAdministrador;
  const accionLeer = acciones.find((a) => a.nombre === "LEER");
  const grupos = [...new Set(modulos.map((m) => m.grupo))];

  const esProtegida = (modulo: ModuloPermiso, accion: AccionEntity) =>
    rolSeleccionado?.nombre === "ADMINISTRADOR" &&
    MODULOS_PROTEGIDOS_ADMIN.includes(modulo.nombre) &&
    ACCIONES_PROTEGIDAS_ADMIN.includes(accion.nombre);

  /** Marcar una acción marca LEER; desmarcar LEER quita todas las del módulo. */
  const alternar = (modulo: ModuloPermiso, accion: AccionEntity) => {
    if (rolBloqueado || !accionLeer) return;
    setAsignacion((prev) => {
      const actuales = new Set(prev[rolSeleccionadoId] ?? []);
      const clave = celda(modulo.id, accion.id);
      if (actuales.has(clave)) {
        actuales.delete(clave);
        if (accion.id === accionLeer.id) {
          acciones.forEach((a) => actuales.delete(celda(modulo.id, a.id)));
        }
      } else {
        actuales.add(clave);
        actuales.add(celda(modulo.id, accionLeer.id));
      }
      return { ...prev, [rolSeleccionadoId]: [...actuales] };
    });
  };

  const handleGuardarCambios = async () => {
    setGuardando(true);
    setMensajeError(null);
    setMensajeExito(null);
    try {
      const permisos = (asignacion[rolSeleccionadoId] ?? []).map((c) => {
        const [funcion_id, accion_id] = c.split(":").map(Number);
        return { funcion_id, accion_id };
      });
      const resp = await guardarPermisosRol(rolSeleccionadoId, permisos);
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

  const handleCrearRol = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setMensajeError(null);
    setMensajeExito(null);
    const resp = await crearRolAccion(nombreRol, descripcionRol);
    setGuardando(false);
    if (resp.ok) {
      setMensajeExito(resp.mensaje);
      setCreandoRol(false);
      setNombreRol("");
      setDescripcionRol("");
      await cargarConfiguracion();
    } else {
      setMensajeError(resp.mensaje);
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
            <PageHeaderBadge paquete="P1" cu="CU04" titulo="CONFIGURAR ROLES Y ASIGNAR PERMISOS" />
            <h1 className="mt-2 text-2xl font-bold text-slate-900">
              Configuración de Roles y Permisos
            </h1>
            <p className="text-sm text-slate-500">
              Matriz de funciones y acciones por rol, guardada en la base de datos (
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-600">
                rol_funcion
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
            <div className="mb-2 flex items-center justify-between px-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Roles del Sistema
              </h2>
              <button
                onClick={() => setCreandoRol((v) => !v)}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                + Nuevo Rol
              </button>
            </div>

            {creandoRol && (
              <form onSubmit={handleCrearRol} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                <input
                  required
                  maxLength={50}
                  value={nombreRol}
                  onChange={(e) => setNombreRol(e.target.value)}
                  placeholder="Nombre del rol"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <input
                  maxLength={255}
                  value={descripcionRol}
                  onChange={(e) => setDescripcionRol(e.target.value)}
                  placeholder="Descripción (opcional)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={guardando}
                  className="w-full cursor-pointer rounded-lg bg-lime-400 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-lime-300 disabled:opacity-50"
                >
                  Crear rol
                </button>
              </form>
            )}

            {roles.map((rol) => {
              const seleccionado = rolSeleccionadoId === rol.id;
              const asignadas = asignacion[rol.id] ?? [];
              const cuenta = accionLeer
                ? modulos.filter((m) => asignadas.includes(celda(m.id, accionLeer.id))).length
                : 0;
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

          {/* Columna derecha: matriz función × acción */}
          <div className="space-y-6 p-6 md:col-span-8">
            <div className="border-b border-slate-200 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Permisos del rol:{" "}
                <span className="text-lime-700">
                  {rolSeleccionado?.nombre}
                </span>
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {rolBloqueado
                  ? "Modo solo lectura: selecciona otro rol para gestionar sus permisos."
                  : "LEER permite entrar al módulo. Las demás acciones controlan las operaciones internas."}
              </p>
            </div>

            <div className="max-h-[620px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-white text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-3 font-semibold">Función</th>
                    {acciones.map((a) => (
                      <th key={a.id} className="px-2 py-2 text-center font-semibold">
                        {a.nombre}
                      </th>
                    ))}
                  </tr>
                </thead>
                {grupos.map((grupo) => (
                  <tbody key={grupo}>
                    <tr>
                      <th
                        colSpan={acciones.length + 1}
                        className="bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600"
                      >
                        {grupo}
                      </th>
                    </tr>
                    {modulos
                      .filter((m) => m.grupo === grupo)
                      .map((modulo) => (
                        <tr key={modulo.id} className="border-t border-slate-100">
                          <td className="py-2 pr-3">
                            <span className="flex items-center gap-2">
                              <IconoModulo clave={modulo.nombre} className="h-4 w-4 text-slate-500" />
                              <span>
                                <span className="block text-sm font-medium text-slate-800">{modulo.etiqueta}</span>
                                <code className="text-[11px] text-slate-500">{modulo.ruta}</code>
                              </span>
                            </span>
                          </td>
                          {acciones.map((accion) => (
                            <td key={accion.id} className="px-2 py-2 text-center">
                              <input
                                type="checkbox"
                                aria-label={`${accion.nombre} en ${modulo.etiqueta}`}
                                checked={activosDelRol.has(celda(modulo.id, accion.id))}
                                disabled={rolBloqueado || esProtegida(modulo, accion)}
                                onChange={() => alternar(modulo, accion)}
                                className="h-4 w-4 cursor-pointer accent-lime-500 disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                ))}
              </table>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
