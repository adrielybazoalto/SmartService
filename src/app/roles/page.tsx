"use client";

import { useState, useEffect } from "react";
import {
  fetchRolesYPermisos,
  postAsignacionPermiso,
  RolEntity,
  ModuloGranular,
} from "../actions/roles";

export default function RolesPage() {
  const [montado, setMontado] = useState(false);
  const [roles, setRoles] = useState<RolEntity[]>([]);
  const [modulos, setModulos] = useState<ModuloGranular[]>([]);
  const [matrizPermisos, setMatrizPermisos] = useState<{
    [rolId: number]: { [moduloCodigo: string]: string[] };
  }>({});

  const [rolSeleccionadoId, setRolSeleccionadoId] = useState<number>(1);
  const [guardando, setGuardando] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  const cargarConfiguracion = async () => {
    try {
      const data = await fetchRolesYPermisos();
      setRoles(data.roles);
      setModulos(data.modulos);
      setMatrizPermisos(data.matriz);
      if (data.roles.length > 0) {
        setRolSeleccionadoId(data.roles[0].id);
      }
    } catch (err) {
      setMensajeError("Error al cargar los permisos desde el servidor.");
    } finally {
      setMontado(true);
    }
  };

  useEffect(() => {
    cargarConfiguracion();
  }, []);

  const togglePermiso = (moduloCodigo: string, permisoId: string) => {
    if (rolSeleccionadoId === 1) {
      setMensajeError("Aviso: El rol Administrador Principal no puede perder permisos del sistema.");
      setTimeout(() => setMensajeError(null), 3500);
      return;
    }

    setMatrizPermisos((prev) => {
      const permisosRol = prev[rolSeleccionadoId] || {};
      const listaPermisosModulo = permisosRol[moduloCodigo] || [];
      const existe = listaPermisosModulo.includes(permisoId);

      const nuevaLista = existe
        ? listaPermisosModulo.filter((id) => id !== permisoId)
        : [...listaPermisosModulo, permisoId];

      return {
        ...prev,
        [rolSeleccionadoId]: {
          ...permisosRol,
          [moduloCodigo]: nuevaLista,
        },
      };
    });
  };

  const handleGuardarCambios = async () => {
    setGuardando(true);
    setMensajeError(null);
    setMensajeExito(null);

    const permisosDelRol = matrizPermisos[rolSeleccionadoId] || {};
    const resp = await postAsignacionPermiso(rolSeleccionadoId, permisosDelRol);

    setGuardando(false);
    if (resp.ok) {
      setMensajeExito(resp.mensaje);
      setTimeout(() => setMensajeExito(null), 3500);
    } else {
      setMensajeError(resp.mensaje);
      setTimeout(() => setMensajeError(null), 4000);
    }
  };

  if (!montado) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm font-medium text-slate-500">Cargando roles y permisos del sistema...</p>
      </div>
    );
  }

  const rolActual = roles.find((r) => r.id === rolSeleccionadoId);
  const permisosRolActual = matrizPermisos[rolSeleccionadoId] || {};

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 text-slate-800">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Cabecera */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-md">
              Caso de Uso 04 • Seguridad y Gestión de Accesos
            </span>
            <h1 className="text-2xl font-bold mt-2 text-slate-900">Configuración de Roles y Permisos</h1>
            <p className="text-sm text-slate-500">
              Parametrización detallada de permisos para los 8 módulos operativos de SmartService.
            </p>
          </div>
          <button
            onClick={handleGuardarCambios}
            disabled={guardando}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium text-sm rounded-xl shadow-sm transition-all"
          >
            {guardando ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>

        {/* Notificaciones */}
        {mensajeExito && (
          <div className="p-4 rounded-xl text-sm font-medium border bg-emerald-50 text-emerald-900 border-emerald-200">
            ✓ {mensajeExito}
          </div>
        )}
        {mensajeError && (
          <div className="p-4 rounded-xl text-sm font-medium border bg-rose-50 text-rose-900 border-rose-200">
            ⚠ {mensajeError}
          </div>
        )}

        {/* Contenedor Principal */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          
          {/* Columna Izquierda: Roles */}
          <div className="md:col-span-4 border-r border-slate-200 p-4 space-y-2 bg-slate-50/50">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
              Roles del Sistema
            </h2>
            {roles.map((rol) => {
              const seleccionado = rolSeleccionadoId === rol.id;
              return (
                <button
                  key={rol.id}
                  onClick={() => setRolSeleccionadoId(rol.id)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl text-left transition-all ${
                    seleccionado
                      ? "bg-white shadow-sm border border-slate-200 text-indigo-600 font-semibold"
                      : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                  }`}
                >
                  <span
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border shrink-0 ${rol.colorBadge}`}
                  >
                    {rol.letra}
                  </span>
                  <div>
                    <span className="block text-sm leading-tight font-medium text-slate-900">{rol.nombre}</span>
                    <span className="text-[11px] text-slate-400 font-normal line-clamp-2">{rol.descripcion}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Columna Derecha: Matriz Granular */}
          <div className="md:col-span-8 p-6 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Permisos asignados al rol:{" "}
                <span className="text-indigo-600">{rolActual?.nombre}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Habilita o deshabilita los privilegios específicos de cada módulo.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[620px] overflow-y-auto pr-1">
              {modulos.map((modulo) => {
                const permisosActivos = permisosRolActual[modulo.codigo] || [];

                return (
                  <div
                    key={modulo.id}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all space-y-3"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h3 className="text-sm font-semibold text-slate-800">
                        {modulo.id}. {modulo.nombre}
                      </h3>
                      <span className="text-[11px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                        {permisosActivos.length}/{modulo.permisosDisponibles.length}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {modulo.permisosDisponibles.map((permiso) => {
                        const activo = permisosActivos.includes(permiso.id);

                        return (
                          <label
                            key={permiso.id}
                            className="flex items-center justify-between p-2 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer border border-slate-100 text-xs transition-colors"
                          >
                            <span className={`font-medium ${activo ? "text-slate-900" : "text-slate-500"}`}>
                              {permiso.nombre}
                            </span>
                            <input
                              type="checkbox"
                              checked={activo}
                              onChange={() => togglePermiso(modulo.codigo, permiso.id)}
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}