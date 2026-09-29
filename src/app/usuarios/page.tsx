"use client";

import { useState, useEffect } from "react";
import {
  listarUsuarios,
  obtenerRolesActivos,
  registrarUsuario,
  actualizarUsuario,
  cambiarEstadoCuenta,
  UsuarioEntity,
  RolEntity,
} from "@/app/actions/usuarios";
import { PageHeaderBadge } from "@/components/page-header-badge";

export default function AdministrarUsuariosPage() {
  // Atributos Boundary (IU_AdministrarUsuarios)
  const [usuarios, setUsuarios] = useState<UsuarioEntity[]>([]);
  const [roles, setRoles] = useState<RolEntity[]>([]);
  const [cargando, setCargando] = useState(true);

  // Filtros de búsqueda
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroRol, setFiltroRol] = useState("TODOS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");

  // Modal State
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [usuarioEditandoId, setUsuarioEditandoId] = useState<number | null>(null);

  // Campos de formulario (txtNombre, txtCorreo, txtContraseña, txtTelefono, cboRol)
  const [txtNombre, setTxtNombre] = useState("");
  const [txtCorreo, setTxtCorreo] = useState("");
  const [txtPassword, setTxtPassword] = useState("");
  const [txtTelefono, setTxtTelefono] = useState("");
  const [cboRol, setCboRol] = useState<number>(3); // Por defecto TECNICO

  // lblMensajeError y notificaciones
  const [lblMensajeError, setLblMensajeError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // Métodos Boundary
  const mostrarMensajeExito = (msg: string) => {
    setMensajeExito(msg);
    setTimeout(() => setMensajeExito(null), 3500);
  };

  const mostrarError = (msg: string) => {
    setLblMensajeError(msg);
    setTimeout(() => setLblMensajeError(null), 4000);
  };

  // Mensaje 1, 2, 5 (Diagrama): ingresarModuloUsuarios() -> obtenerListaUsuarios() -> desplegarListaUsuarios()
  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [listaU, listaR] = await Promise.all([
        listarUsuarios(),
        obtenerRolesActivos(),
      ]);
      setUsuarios(listaU);
      setRoles(listaR);
    } catch (err) {
      mostrarError("Error al conectar con el servidor.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  // Mensaje 6 (Diagrama): seleccionarCrearOModificar()
  const solicitarCreacionUsuario = () => {
    setModoEdicion(false);
    setUsuarioEditandoId(null);
    setTxtNombre("");
    setTxtCorreo("");
    setTxtPassword("");
    setTxtTelefono("");
    setCboRol(roles[0]?.id || 3);
    setModalAbierto(true);
  };

  const solicitarModificacionUsuario = (u: UsuarioEntity) => {
    setModoEdicion(true);
    setUsuarioEditandoId(u.id);
    setTxtNombre(u.nombre);
    setTxtCorreo(u.correo);
    setTxtPassword(""); // Contraseña protegida
    setTxtTelefono(u.telefono || "");
    setCboRol(u.rol_id);
    setModalAbierto(true);
  };

  // Mensaje 7, 8, 10, 11 (Diagrama): enviarDatosUsuario() -> guardar -> confirmar -> mostrarMensajeExito()
  const handleGuardarFormulario = async (e: React.FormEvent) => {
    e.preventDefault();
    setLblMensajeError(null);

    if (modoEdicion && usuarioEditandoId) {
      const resp = await actualizarUsuario(usuarioEditandoId, {
        nombre: txtNombre,
        correo: txtCorreo,
        telefono: txtTelefono,
        rol_id: cboRol,
      });

      if (resp.ok) {
        mostrarMensajeExito(resp.mensaje);
        setModalAbierto(false);
        cargarDatos();
      } else {
        mostrarError(resp.mensaje);
      }
    } else {
      const resp = await registrarUsuario(
        txtNombre,
        txtCorreo,
        txtPassword,
        txtTelefono,
        cboRol
      );

      if (resp.ok) {
        mostrarMensajeExito(resp.mensaje);
        setModalAbierto(false);
        cargarDatos();
      } else {
        mostrarError(resp.mensaje);
      }
    }
  };

  const solicitarCambioEstado = async (id: number, estadoActual: boolean) => {
    const nuevoEstado = !estadoActual;
    const resp = await cambiarEstadoCuenta(id, nuevoEstado);
    if (resp.ok) {
      mostrarMensajeExito(resp.mensaje);
      cargarDatos();
    } else {
      mostrarError(resp.mensaje);
    }
  };

  // Filtrado de la tabla
  const usuariosFiltrados = usuarios.filter((u) => {
    const coincideTexto =
      u.nombre.toLowerCase().includes(filtroTexto.toLowerCase()) ||
      u.correo.toLowerCase().includes(filtroTexto.toLowerCase());

    const coincideRol =
      filtroRol === "TODOS" || u.rol?.nombre.toUpperCase() === filtroRol.toUpperCase();

    const coincideEstado =
      filtroEstado === "TODOS" ||
      (filtroEstado === "ACTIVO" && u.estado) ||
      (filtroEstado === "INACTIVO" && !u.estado);

    return coincideTexto && coincideRol && coincideEstado;
  });

  const getBadgeRol = (nombreRol?: string) => {
    switch (nombreRol?.toUpperCase()) {
      case "ADMINISTRADOR":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "ENCARGADO":
        return "bg-sky-100 text-sky-800 border-sky-200";
      case "TECNICO":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      default:
        return "bg-slate-100 text-slate-700 border-slate-200";
    }
  };

  const inputClase =
    "w-full px-3 py-2 text-sm border border-slate-200 bg-slate-50 text-slate-900 rounded-xl focus:ring-2 focus:ring-lime-300/50 focus:border-lime-400 focus:outline-none placeholder:text-slate-400";
  const etiquetaClase = "text-xs font-semibold text-slate-600 block mb-1";

  return (
    <div className="min-h-screen bg-slate-100/70 p-6 md:p-10 text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Cabecera Principal */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
          <div>
            <PageHeaderBadge paquete="P1" cu="CU03" titulo="ADMINISTRAR USUARIOS" />
            <h1 className="text-2xl font-bold mt-2 text-slate-900">Gestión de Usuarios</h1>
            <p className="text-sm text-slate-500">
              Administración de cuentas internas de personal y asignación de roles.
            </p>
          </div>
          <button
            onClick={solicitarCreacionUsuario}
            className="px-5 py-2.5 bg-lime-400 hover:bg-lime-300 text-slate-900 font-semibold text-sm rounded-xl shadow-sm shadow-lime-200/60 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="text-lg leading-none">+</span> Agregar Nuevo Usuario
          </button>
        </div>

        {/* Notificaciones */}
        {mensajeExito && (
          <div className="p-4 rounded-xl text-sm font-medium border border-emerald-200 bg-emerald-50 text-emerald-800">
            ✓ {mensajeExito}
          </div>
        )}
        {lblMensajeError && (
          <div className="p-4 rounded-xl text-sm font-medium border border-rose-200 bg-rose-50 text-rose-700">
            ⚠ {lblMensajeError}
          </div>
        )}

        {/* Barra de Filtros */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/60 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Filtrar por Búsqueda</label>
            <input
              type="text"
              placeholder="Buscar un nombre o correo..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              className={inputClase}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Roles</label>
            <select
              value={filtroRol}
              onChange={(e) => setFiltroRol(e.target.value)}
              className={inputClase}
            >
              <option value="TODOS">Todos los roles</option>
              {roles.map((r) => (
                <option key={r.id} value={r.nombre}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Estado</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className={inputClase}
            >
              <option value="TODOS">Activo/Inactivo</option>
              <option value="ACTIVO">Activo</option>
              <option value="INACTIVO">Inactivo</option>
            </select>
          </div>
        </div>

        {/* Tabla de Usuarios (tablaUsuarios) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">Avatar / Nombre</th>
                  <th className="p-4">Correo</th>
                  <th className="p-4">Teléfono</th>
                  <th className="p-4">Función (Rol)</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {cargando ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-slate-500">
                      Cargando listado de usuarios...
                    </td>
                  </tr>
                ) : usuariosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center p-8 text-slate-500">
                      No se encontraron usuarios coincidentes.
                    </td>
                  </tr>
                ) : (
                  usuariosFiltrados.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-all">
                      <td className="p-4 font-medium text-slate-900 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs">
                          {u.nombre.charAt(0)}
                        </div>
                        {u.nombre}
                      </td>
                      <td className="p-4 text-slate-600">{u.correo}</td>
                      <td className="p-4 text-slate-500">{u.telefono || "—"}</td>
                      <td className="p-4">
                        <span
                          className={`inline-block text-xs px-2.5 py-1 font-semibold rounded-lg border ${getBadgeRol(
                            u.rol?.nombre
                          )}`}
                        >
                          {u.rol?.nombre || "Sin Rol"}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${
                            u.estado
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              u.estado ? "bg-emerald-500" : "bg-rose-500"
                            }`}
                          />
                          {u.estado ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-3">
                          {/* Modificar */}
                          <button
                            onClick={() => solicitarModificacionUsuario(u)}
                            className="p-1.5 text-slate-400 hover:text-lime-700 rounded-lg hover:bg-lime-50 transition-all cursor-pointer"
                            title="Editar Usuario"
                          >
                            ✏️
                          </button>

                          {/* Switch Activar/Desactivar */}
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={u.estado}
                              onChange={() => solicitarCambioEstado(u.id, u.estado)}
                              className="sr-only peer"
                            />
                            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-400 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-lime-400" />
                          </label>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal: Formulario Nuevo / Modificar Usuario */}
        {modalAbierto && (
          <div className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-lg font-bold text-slate-900">
                  {modoEdicion ? "Modificar Usuario" : "Nuevo Usuario"}
                </h3>
                <button
                  onClick={() => setModalAbierto(false)}
                  className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleGuardarFormulario} className="space-y-4">
                <div>
                  <label className={etiquetaClase}>Nombre Completo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Roberto Salazar"
                    value={txtNombre}
                    onChange={(e) => setTxtNombre(e.target.value)}
                    className={inputClase}
                  />
                </div>

                <div>
                  <label className={etiquetaClase}>Correo Electrónico *</label>
                  <input
                    type="email"
                    required
                    placeholder="usuario@empresa.com"
                    value={txtCorreo}
                    onChange={(e) => setTxtCorreo(e.target.value)}
                    className={inputClase}
                  />
                </div>

                {!modoEdicion && (
                  <div>
                    <label className={etiquetaClase}>Contraseña *</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={txtPassword}
                      onChange={(e) => setTxtPassword(e.target.value)}
                      className={inputClase}
                    />
                  </div>
                )}

                <div>
                  <label className={etiquetaClase}>Teléfono</label>
                  <input
                    type="text"
                    placeholder="72010005"
                    value={txtTelefono}
                    onChange={(e) => setTxtTelefono(e.target.value)}
                    className={inputClase}
                  />
                </div>

                <div>
                  <label className={etiquetaClase}>Selección de Rol *</label>
                  <select
                    value={cboRol}
                    onChange={(e) => setCboRol(Number(e.target.value))}
                    className={inputClase}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setModalAbierto(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-sm font-semibold bg-lime-400 hover:bg-lime-300 text-slate-900 rounded-xl shadow-sm shadow-lime-200/60 transition-all cursor-pointer"
                  >
                    Guardar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}