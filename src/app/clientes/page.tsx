"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cambiarEstadoClienteAction,
  cambiarEstadoEstablecimientoAction,
  listarClientesAction,
  obtenerHistorialClienteAction,
  procesarRegistroCliente,
  procesarActualizacionCliente,
  validarDocumentoUnico,
  ClienteEntity,
} from "@/app/actions/clientes";
import { PageHeaderBadge } from "@/components/page-header-badge";

/**
 * IU_GestionarClientes (CU07).
 * Flujo en dos pasos: datos del cliente → datos del establecimiento.
 * Métodos Boundary con la nomenclatura del diagrama de clases:
 *   solicitarModuloClientes, seleccionarNuevoCliente, ingresarDatosCliente,
 *   solicitarEstablecimiento, ingresarDatosEstablecimiento,
 *   mostrarFichaCliente, mostrarMensajeExito.
 */
export default function GestionarClientesPage() {
  // ── Atributos Boundary: listado y estado global ──────────────────────────
  const [clientes, setClientes] = useState<ClienteEntity[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [ficha, setFicha] = useState<ClienteEntity | null>(null);
  const [pasoRegistro, setPasoRegistro] = useState<"lista" | "cliente" | "establecimiento">("lista");
  const [validandoDocumento, setValidandoDocumento] = useState(false);

  // ── Campos de estado (Diagrama): datos del cliente ───────────────────────
  const [tipoCliente, setTipoCliente] = useState<"NATURAL" | "JURIDICO">("NATURAL");
  const [documento, setDocumento] = useState("");
  const [nombreRazonSocial, setNombreRazonSocial] = useState("");
  const [telefono, setTelefono] = useState("");
  const [telefonoAlternativo, setTelefonoAlternativo] = useState("");
  const [correo, setCorreo] = useState("");

  // ── Estado: Modificación de cliente existente (CU07) ─────────────────────
  const [clienteAEditar, setClienteAEditar] = useState<ClienteEntity | null>(null);
  const [editTipoCliente, setEditTipoCliente] = useState<"NATURAL" | "JURIDICO">("NATURAL");
  const [editDocumento, setEditDocumento] = useState("");
  const [editNombreRazonSocial, setEditNombreRazonSocial] = useState("");
  const [editTelefono, setEditTelefono] = useState("");
  const [editTelefonoAlternativo, setEditTelefonoAlternativo] = useState("");
  const [editCorreo, setEditCorreo] = useState("");
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [historial, setHistorial] = useState<{
    cliente: string;
    filas: Awaited<ReturnType<typeof obtenerHistorialClienteAction>>;
  } | null>(null);

  // ── Campos de estado (Diagrama): datos del establecimiento ───────────────
  const [nombreEstablecimiento, setNombreEstablecimiento] = useState("");
  const [tipoInmueble, setTipoInmueble] = useState("");
  const [direccion, setDireccion] = useState("");
  const [latitud, setLatitud] = useState("");
  const [longitud, setLongitud] = useState("");

  // ── Notificaciones ───────────────────────────────────────────────────────
  const [lblMensajeError, setLblMensajeError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // ── Métodos Boundary ─────────────────────────────────────────────────────
  /** Retroalimentación al usuario tras completar el registro. */
  const mostrarMensajeExito = (msg: string) => {
    setMensajeExito(msg);
    setTimeout(() => setMensajeExito(null), 4000);
  };

  const mostrarError = (msg: string) => {
    setLblMensajeError(msg);
    setTimeout(() => setLblMensajeError(null), 5000);
  };

  /** Carga inicial de la pantalla / lista de clientes (Mensaje 1 del diagrama). */
  const aplicarLista = useCallback((lista: ClienteEntity[]) => {
    setClientes(lista);
  }, []);

  const solicitarModuloClientes = async () => {
    setCargando(true);
    try {
      const lista = await listarClientesAction();
      aplicarLista(lista);
    } catch {
      mostrarError("Error al conectar con el servidor.");
    } finally {
      setCargando(false);
    }
  };

  // Carga inicial al montar la pantalla (setState solo en callbacks asíncronos).
  useEffect(() => {
    let activo = true;
    listarClientesAction()
      .then((lista) => {
        if (activo) aplicarLista(lista);
      })
      .catch(() => {
        if (activo) mostrarError("Error al conectar con el servidor.");
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [aplicarLista]);

  /** Abre el registro de un nuevo cliente (Mensaje 6 del diagrama). */
  const seleccionarNuevoCliente = () => {
    setTipoCliente("NATURAL");
    setDocumento("");
    setNombreRazonSocial("");
    setTelefono("");
    setTelefonoAlternativo("");
    setCorreo("");
    setNombreEstablecimiento("");
    setTipoInmueble("");
    setDireccion("");
    setLatitud("");
    setLongitud("");
    setFicha(null);
    setLblMensajeError(null);
    setPasoRegistro("cliente");
  };

  /** Captura los inputs del cliente (paso 1). */
  const ingresarDatosCliente = (
    campo: "tipoCliente" | "documento" | "nombreRazonSocial" | "telefono" | "telefonoAlternativo" | "correo",
    valor: string
  ) => {
    switch (campo) {
      case "tipoCliente":
        setTipoCliente(valor as "NATURAL" | "JURIDICO");
        break;
      case "documento":
        setDocumento(valor);
        break;
      case "nombreRazonSocial":
        setNombreRazonSocial(valor);
        break;
      case "telefono":
        setTelefono(valor);
        break;
      case "telefonoAlternativo":
        setTelefonoAlternativo(valor);
        break;
      case "correo":
        setCorreo(valor);
        break;
    }
  };

  /** Valida el documento único y habilita la sección del establecimiento. */
  const solicitarEstablecimiento = async () => {
    setLblMensajeError(null);

    if (!nombreRazonSocial.trim()) {
      mostrarError("Ingresa el nombre o razón social del cliente.");
      return;
    }

    if (documento.trim()) {
      setValidandoDocumento(true);
      try {
        const { existe } = await validarDocumentoUnico(documento.trim());
        if (existe) {
          mostrarError(`Ya existe un cliente con el documento ${documento.trim()}.`);
          return;
        }
      } catch {
        mostrarError("No se pudo validar el documento en este momento.");
        return;
      } finally {
        setValidandoDocumento(false);
      }
    }

    setPasoRegistro("establecimiento");
  };

  /** Captura dirección, tipo de inmueble, latitud y longitud (paso 2). */
  const ingresarDatosEstablecimiento = (
    campo: "nombreEstablecimiento" | "tipoInmueble" | "direccion" | "latitud" | "longitud",
    valor: string
  ) => {
    switch (campo) {
      case "nombreEstablecimiento":
        setNombreEstablecimiento(valor);
        break;
      case "tipoInmueble":
        setTipoInmueble(valor);
        break;
      case "direccion":
        setDireccion(valor);
        break;
      case "latitud":
        setLatitud(valor);
        break;
      case "longitud":
        setLongitud(valor);
        break;
    }
  };

  /** Muestra el detalle/resumen del cliente (ficha). */
  const mostrarFichaCliente = (cliente: ClienteEntity) => {
    setFicha(cliente);
  };

  const volverAlCliente = () => {
    setLblMensajeError(null);
    setPasoRegistro("cliente");
  };

  /** Envía el formulario completo → procesarRegistroCliente (Controlador). */
  const verHistorial = async (c: ClienteEntity) => {
    try {
      setHistorial({ cliente: c.nombre, filas: await obtenerHistorialClienteAction(c.id) });
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo cargar el historial.");
    }
  };

  const cambiarEstadoCliente = async (c: ClienteEntity) => {
    if (!confirm(`¿${c.estado ? "Desactivar" : "Activar"} al cliente ${c.nombre}?`)) return;
    const r = await cambiarEstadoClienteAction(c.id, !c.estado);
    alert(r.mensaje);
    if (r.ok) window.location.reload();
  };

  const cambiarEstadoEstablecimiento = async (id: number, nombre: string, activo: boolean) => {
    if (!confirm(`¿${activo ? "Desactivar" : "Activar"} el establecimiento ${nombre}?`)) return;
    const r = await cambiarEstadoEstablecimientoAction(id, !activo);
    alert(r.mensaje);
    if (r.ok) window.location.reload();
  };

  const handleRegistrarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    setLblMensajeError(null);

    const resp = await procesarRegistroCliente({
      tipoCliente,
      documento,
      nombreRazonSocial,
      telefono,
      telefonoAlternativo,
      correo,
      nombreEstablecimiento,
      tipoInmueble,
      direccion,
      latitud,
      longitud,
    });

    if (resp.ok && resp.data) {
      mostrarMensajeExito(resp.mensaje);
      mostrarFichaCliente(resp.data.cliente);
      solicitarModuloClientes();
      setPasoRegistro("lista");
    } else {
      mostrarError(resp.mensaje);
    }
  };

  /** Métodos para edición de cliente (CU07) */
  const abrirEdicionCliente = (c: ClienteEntity) => {
    setClienteAEditar(c);
    setEditTipoCliente(c.tipo_cliente === "JURIDICO" ? "JURIDICO" : "NATURAL");
    setEditDocumento(c.documento_identidad || "");
    setEditNombreRazonSocial(c.nombre);
    setEditTelefono(c.telefono || "");
    setEditTelefonoAlternativo(c.telefono_alternativo || "");
    setEditCorreo(c.correo || "");
    setLblMensajeError(null);
  };

  const cerrarEdicionCliente = () => {
    setClienteAEditar(null);
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteAEditar) return;

    if (!editNombreRazonSocial.trim()) {
      mostrarError("Ingresa el nombre o razón social del cliente.");
      return;
    }

    setGuardandoEdicion(true);
    setLblMensajeError(null);
    try {
      const resp = await procesarActualizacionCliente({
        id: clienteAEditar.id,
        tipoCliente: editTipoCliente,
        documento: editDocumento,
        nombreRazonSocial: editNombreRazonSocial,
        telefono: editTelefono,
        telefonoAlternativo: editTelefonoAlternativo,
        correo: editCorreo,
      });

      if (resp.ok && resp.data) {
        mostrarMensajeExito(resp.mensaje);
        const cliActualizado = resp.data.cliente;
        setClientes((prev) =>
          prev.map((c) => (c.id === cliActualizado.id ? cliActualizado : c))
        );
        setFicha((prev) => (prev?.id === cliActualizado.id ? cliActualizado : prev));
        cerrarEdicionCliente();
      } else {
        mostrarError(resp.mensaje);
      }
    } catch {
      mostrarError("Error al procesar la actualización del cliente.");
    } finally {
      setGuardandoEdicion(false);
    }
  };

  // ── Utilidades de presentación ───────────────────────────────────────────
  const inputClase =
    "w-full px-3 py-2 text-sm border border-slate-200 bg-slate-50 text-slate-900 rounded-xl focus:ring-2 focus:ring-lime-300/50 focus:border-lime-400 focus:outline-none placeholder:text-slate-400";
  const etiquetaClase = "text-xs font-semibold text-slate-600 block mb-1";

  const getBadgeTipo = (tipo?: string) =>
    tipo === "JURIDICO"
      ? "bg-indigo-100 text-indigo-800 border-indigo-200"
      : "bg-emerald-100 text-emerald-800 border-emerald-200";

  const formatearFechaRegistro = (fechaStr?: string | null) => {
    if (!fechaStr) return "—";
    try {
      const soloFecha = fechaStr.split("T")[0];
      const partes = soloFecha.split("-");
      if (partes.length === 3) {
        const [y, m, d] = partes;
        return `${d}/${m}/${y}`;
      }
      const d = new Date(fechaStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("es-BO");
      }
      return fechaStr;
    } catch {
      return fechaStr;
    }
  };

  const clientesFiltrados = clientes.filter((c) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase().trim();
    const coincideNombre = c.nombre.toLowerCase().includes(q);
    const coincideDoc = c.documento_identidad ? c.documento_identidad.toLowerCase().includes(q) : false;
    const coincideRazon = c.razon_social ? c.razon_social.toLowerCase().includes(q) : false;
    return coincideNombre || coincideDoc || coincideRazon;
  });

  const pasoIndice = pasoRegistro === "cliente" ? 1 : 2;

  return (
    <div className="min-h-screen bg-slate-100/70 p-4 sm:p-6 md:p-10 text-slate-900">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ── Cabecera Principal ─────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200/60">
          <div>
            <PageHeaderBadge
              paquete="P2"
              cu="CU07"
              titulo="GESTIONAR CLIENTES Y ESTABLECIMIENTOS"
            />
            <h1 className="text-2xl font-bold mt-2 text-slate-900">
              Gestión de Clientes y Establecimientos
            </h1>
            <p className="text-sm text-slate-500">
              Registro y consulta del directorio de clientes con sus sucursales.
            </p>
          </div>
          <button
            onClick={seleccionarNuevoCliente}
            className="w-full md:w-auto px-5 py-2.5 bg-lime-400 hover:bg-lime-300 text-slate-900 font-semibold text-sm rounded-xl shadow-sm shadow-lime-200/60 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span className="text-lg leading-none">+</span> Registrar Cliente
          </button>
        </div>

        {/* ── Notificaciones ─────────────────────────────────────────────── */}
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

        {/* ── Registro en dos pasos ──────────────────────────────────────── */}
        {pasoRegistro !== "lista" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
            {/* Stepper */}
            <div className="flex items-center gap-2 px-6 pt-5 text-xs font-semibold">
              <span
                className={`rounded-full px-2.5 py-1 ${
                  pasoIndice >= 1 ? "bg-lime-400 text-slate-900" : "bg-slate-100 text-slate-400"
                }`}
              >
                1 · Datos del cliente
              </span>
              <span className="text-slate-300">→</span>
              <span
                className={`rounded-full px-2.5 py-1 ${
                  pasoIndice >= 2 ? "bg-lime-400 text-slate-900" : "bg-slate-100 text-slate-400"
                }`}
              >
                2 · Establecimiento
              </span>
            </div>

            {pasoRegistro === "cliente" ? (
              /* ── Paso 1: ingresarDatosCliente ─────────────────────── */
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  solicitarEstablecimiento();
                }}
                className="p-6 space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={etiquetaClase}>Tipo de Cliente *</label>
                    <select
                      value={tipoCliente}
                      onChange={(e) => ingresarDatosCliente("tipoCliente", e.target.value)}
                      className={inputClase}
                    >
                      <option value="NATURAL">Persona Natural</option>
                      <option value="JURIDICO">Persona Jurídica (Empresa)</option>
                    </select>
                  </div>
                  <div>
                    <label className={etiquetaClase}>
                      Documento de Identidad / NIT
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. 4455667 / 1024567029"
                      value={documento}
                      onChange={(e) => ingresarDatosCliente("documento", e.target.value)}
                      className={inputClase}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={etiquetaClase}>
                      {tipoCliente === "JURIDICO" ? "Razón Social *" : "Nombre Completo *"}
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={
                        tipoCliente === "JURIDICO"
                          ? "Ej. Seguridad Garnet S.R.L."
                          : "Ej. Roberto Salazar Roca"
                      }
                      value={nombreRazonSocial}
                      onChange={(e) => ingresarDatosCliente("nombreRazonSocial", e.target.value)}
                      className={inputClase}
                    />
                  </div>
                  <div>
                    <label className={etiquetaClase}>Teléfono</label>
                    <input
                      type="text"
                      placeholder="Ej. 72010005"
                      value={telefono}
                      onChange={(e) => ingresarDatosCliente("telefono", e.target.value)}
                      className={inputClase}
                    />
                  </div>
                  <div>
                    <label className={etiquetaClase}>Teléfono Alternativo (opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. 71002233 / 33445566"
                      value={telefonoAlternativo}
                      onChange={(e) => ingresarDatosCliente("telefonoAlternativo", e.target.value)}
                      className={inputClase}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={etiquetaClase}>Correo Electrónico</label>
                    <input
                      type="email"
                      placeholder="cliente@empresa.com"
                      value={correo}
                      onChange={(e) => ingresarDatosCliente("correo", e.target.value)}
                      className={inputClase}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setPasoRegistro("lista")}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={validandoDocumento}
                    className="px-5 py-2 text-sm font-semibold bg-lime-400 hover:bg-lime-300 text-slate-900 rounded-xl shadow-sm shadow-lime-200/60 transition-all cursor-pointer disabled:opacity-60"
                  >
                    {validandoDocumento ? "Validando documento..." : "Continuar → Establecimiento"}
                  </button>
                </div>
              </form>
            ) : (
              /* ── Paso 2: ingresarDatosEstablecimiento ──────────────── */
              <form onSubmit={handleRegistrarCliente} className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={etiquetaClase}>Nombre del Establecimiento *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Sucursal Central — Av. Banzer"
                      value={nombreEstablecimiento}
                      onChange={(e) => ingresarDatosEstablecimiento("nombreEstablecimiento", e.target.value)}
                      className={inputClase}
                    />
                  </div>
                  <div>
                    <label className={etiquetaClase}>Tipo de Inmueble</label>
                    <select
                      value={tipoInmueble}
                      onChange={(e) => ingresarDatosEstablecimiento("tipoInmueble", e.target.value)}
                      className={inputClase}
                    >
                      <option value="">Seleccionar...</option>
                      <option value="CASA">Casa</option>
                      <option value="DEPARTAMENTO">Departamento</option>
                      <option value="LOCAL COMERCIAL">Local Comercial</option>
                      <option value="OFICINA">Oficina</option>
                      <option value="BODEGA">Bodega</option>
                      <option value="OTRO">Otro</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className={etiquetaClase}>Dirección *</label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Av. Cristo Redentor Nro. 1250, 3er anillo"
                      value={direccion}
                      onChange={(e) => ingresarDatosEstablecimiento("direccion", e.target.value)}
                      className={inputClase}
                    />
                  </div>
                  <div>
                    <label className={etiquetaClase}>Latitud (opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. -17.783333"
                      value={latitud}
                      onChange={(e) => ingresarDatosEstablecimiento("latitud", e.target.value)}
                      className={inputClase}
                    />
                  </div>
                  <div>
                    <label className={etiquetaClase}>Longitud (opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. -63.182222"
                      value={longitud}
                      onChange={(e) => ingresarDatosEstablecimiento("longitud", e.target.value)}
                      className={inputClase}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={volverAlCliente}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                  >
                    ← Volver al cliente
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-sm font-semibold bg-lime-400 hover:bg-lime-300 text-slate-900 rounded-xl shadow-sm shadow-lime-200/60 transition-all cursor-pointer"
                  >
                    Registrar Cliente y Establecimiento
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ── Ficha del Cliente (mostrarFichaCliente) ──────────────────── */}
        {ficha && pasoRegistro === "lista" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-bold text-slate-900">Ficha del Cliente</h2>
              <button
                onClick={() => setFicha(null)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">
                  {ficha.nombre.charAt(0)}
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900">{ficha.nombre}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <span
                      className={`inline-block text-xs px-2.5 py-1 font-semibold rounded-lg border ${getBadgeTipo(
                        ficha.tipo_cliente
                      )}`}
                    >
                      {ficha.tipo_cliente === "JURIDICO" ? "Jurídico" : "Natural"}
                    </span>
                    {ficha.documento_identidad && (
                      <span className="inline-block text-xs px-2.5 py-1 font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                        Doc: {ficha.documento_identidad}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">Correo</p>
                  <p className="font-medium text-slate-900 truncate">{ficha.correo || "—"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">Teléfono</p>
                  <p className="font-medium text-slate-900">{ficha.telefono || "—"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">Teléfono Alternativo</p>
                  <p className="font-medium text-slate-900">{ficha.telefono_alternativo || "—"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-semibold text-slate-500">Registrado</p>
                  <p className="font-medium text-slate-900">{ficha.fecha_registro}</p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-700 mb-2">
                  Establecimientos ({ficha.establecimientos.length})
                </h3>
                {ficha.establecimientos.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Este cliente aún no tiene establecimientos registrados.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {ficha.establecimientos.map((e) => (
                      <div
                        key={e.id}
                        className="rounded-xl border border-slate-200 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                      >
                        <div>
                          <p className="font-semibold text-slate-800">
                            {e.nombre_establecimiento}{" "}
                            {e.tipo_inmueble && (
                              <span className="text-xs font-medium text-slate-400">
                                · {e.tipo_inmueble}
                              </span>
                            )}
                          </p>
                          <p className="text-sm text-slate-500">{e.direccion}</p>
                          <button
                            type="button"
                            onClick={() => cambiarEstadoEstablecimiento(e.id, e.nombre_establecimiento, e.estado)}
                            className="mt-1 text-xs font-medium text-rose-700 hover:underline cursor-pointer"
                          >
                            {e.estado ? "Desactivar establecimiento" : "Activar establecimiento"}
                          </button>
                        </div>
                        <p className="text-xs text-slate-400">
                          Lat {e.latitud ?? "—"} · Lon {e.longitud ?? "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Listado de Clientes ─────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Directorio de Clientes</h2>
              <p className="text-xs text-slate-500">
                {clientesFiltrados.length} cliente{clientesFiltrados.length === 1 ? "" : "s"} disponible{clientesFiltrados.length === 1 ? "" : "s"}
                {busqueda.trim() && ` (filtrado de ${clientes.length})`}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-80">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400 text-sm">
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Buscar por nombre o documento..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-lime-400 focus:ring-2 focus:ring-lime-300/40 transition-all text-slate-900 placeholder:text-slate-400"
                />
                {busqueda && (
                  <button
                    type="button"
                    onClick={() => setBusqueda("")}
                    className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                    title="Limpiar búsqueda"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                onClick={solicitarModuloClientes}
                className="text-xs font-semibold text-lime-700 hover:text-lime-800 hover:underline cursor-pointer whitespace-nowrap px-3 py-2 rounded-xl hover:bg-lime-50 transition-colors text-center"
                title="Actualizar listado"
              >
                ↻ Actualizar
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-4 text-center w-16">ID</th>
                  <th className="p-4">Cliente</th>
                  <th className="p-4">Documento</th>
                  <th className="p-4">Contacto</th>
                  <th className="p-4">Establecimientos</th>
                  <th className="p-4 whitespace-nowrap">Fecha Registro</th>
                  <th className="p-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {cargando ? (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-slate-500">
                      Cargando directorio de clientes...
                    </td>
                  </tr>
                ) : clientes.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-slate-500">
                      Aún no hay clientes registrados. Usa “Registrar Cliente” para comenzar.
                    </td>
                  </tr>
                ) : clientesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center p-8 text-slate-500">
                      No se encontraron clientes que coincidan con &ldquo;{busqueda}&rdquo;.
                    </td>
                  </tr>
                ) : (
                  clientesFiltrados.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-all">
                      <td className="p-4 text-center font-mono text-xs text-slate-500 font-semibold">
                        #{c.id}
                      </td>
                      <td className="p-4 font-medium text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs">
                            {c.nombre.charAt(0)}
                          </div>
                          <div>
                            <p>{c.nombre}</p>
                            {c.razon_social && c.razon_social !== c.nombre && (
                              <p className="text-xs text-slate-400">{c.razon_social}</p>
                            )}
                            <span
                              className={`inline-block text-[10px] px-1.5 py-0.5 font-semibold rounded border ${getBadgeTipo(
                                c.tipo_cliente
                              )}`}
                            >
                              {c.tipo_cliente === "JURIDICO" ? "Jurídico" : "Natural"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-600 font-mono text-xs">
                        {c.documento_identidad || "—"}
                      </td>
                      <td className="p-4 text-slate-500">
                        <p>{c.correo || "—"}</p>
                        <p className="text-xs font-medium text-slate-700">{c.telefono || ""}</p>
                        {c.telefono_alternativo && (
                          <p className="text-[11px] text-slate-400">Alt: {c.telefono_alternativo}</p>
                        )}
                      </td>
                      <td className="p-4 text-slate-600">
                        {c.establecimientos.length > 0 ? (
                          <ul className="space-y-0.5">
                            {c.establecimientos.map((e) => (
                              <li key={e.id} className="text-sm">
                                {e.nombre_establecimiento}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-4 text-slate-600 text-xs whitespace-nowrap">
                        {formatearFechaRegistro(c.fecha_registro)}
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => mostrarFichaCliente(c)}
                            className="p-1.5 text-slate-400 hover:text-lime-700 rounded-lg hover:bg-lime-50 transition-all cursor-pointer"
                            title="Ver ficha del cliente"
                          >
                            👁
                          </button>
                          <button
                            onClick={() => verHistorial(c)}
                            className="p-1.5 text-slate-400 hover:text-sky-700 rounded-lg hover:bg-sky-50 transition-all cursor-pointer"
                            title="Ver historial del cliente"
                          >
                            🕘
                          </button>
                          <button
                            onClick={() => cambiarEstadoCliente(c)}
                            className="p-1.5 text-slate-400 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                            title={c.estado ? "Desactivar cliente" : "Activar cliente"}
                          >
                            {c.estado ? "⏸" : "▶"}
                          </button>
                          <button
                            onClick={() => abrirEdicionCliente(c)}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all cursor-pointer"
                            title="Editar datos del cliente"
                          >
                            ✏️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Historial del cliente (CU07) ──────────────────────────────── */}
      {historial && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
            <h3 className="text-base font-bold text-slate-900">Historial de {historial.cliente}</h3>
            {historial.filas.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">El cliente aún no tiene cotizaciones.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {historial.filas.map((c) => (
                  <li key={c.id} className="py-2">
                    <p className="font-medium text-slate-800">
                      {c.numero_cotizacion} · {c.estado} · Bs. {Number(c.total).toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500">Emitida el {c.fecha_emision}</p>
                    {c.orden_trabajo.map((o) => (
                      <p key={o.id} className="text-xs text-slate-600">
                        Orden {o.codigo_orden} ({o.estado})
                        {[o.nota_servicio].flat().map((n) => n && ` · Nota ${n.numero_nota} (${n.estado}, Bs. ${Number(n.monto_total).toFixed(2)})`)}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button onClick={() => setHistorial(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Edición de Cliente (CU07) ─────────────────────────── */}
      {clienteAEditar && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs"
        >
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 max-w-lg w-full max-h-[90dvh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900">Editar Datos del Cliente</h3>
                <p className="text-xs text-slate-500">ID #{clienteAEditar.id} · Modificación de datos y contacto</p>
              </div>
              <button
                type="button"
                onClick={cerrarEdicionCliente}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGuardarEdicion} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={etiquetaClase}>Tipo de Cliente *</label>
                  <select
                    value={editTipoCliente}
                    onChange={(e) => setEditTipoCliente(e.target.value as "NATURAL" | "JURIDICO")}
                    className={inputClase}
                  >
                    <option value="NATURAL">Persona Natural</option>
                    <option value="JURIDICO">Persona Jurídica (Empresa)</option>
                  </select>
                </div>
                <div>
                  <label className={etiquetaClase}>Documento de Identidad / NIT</label>
                  <input
                    type="text"
                    placeholder="Ej. 4455667 / 1024567029"
                    value={editDocumento}
                    onChange={(e) => setEditDocumento(e.target.value)}
                    className={inputClase}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={etiquetaClase}>
                    {editTipoCliente === "JURIDICO" ? "Razón Social *" : "Nombre Completo *"}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      editTipoCliente === "JURIDICO"
                        ? "Ej. Seguridad Garnet S.R.L."
                        : "Ej. Roberto Salazar Roca"
                    }
                    value={editNombreRazonSocial}
                    onChange={(e) => setEditNombreRazonSocial(e.target.value)}
                    className={inputClase}
                  />
                </div>
                <div>
                  <label className={etiquetaClase}>Teléfono</label>
                  <input
                    type="text"
                    placeholder="Ej. 72010005"
                    value={editTelefono}
                    onChange={(e) => setEditTelefono(e.target.value)}
                    className={inputClase}
                  />
                </div>
                <div>
                  <label className={etiquetaClase}>Teléfono Alternativo (opcional)</label>
                  <input
                    type="text"
                    placeholder="Ej. 71002233 / 33445566"
                    value={editTelefonoAlternativo}
                    onChange={(e) => setEditTelefonoAlternativo(e.target.value)}
                    className={inputClase}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={etiquetaClase}>Correo Electrónico</label>
                  <input
                    type="email"
                    placeholder="cliente@empresa.com"
                    value={editCorreo}
                    onChange={(e) => setEditCorreo(e.target.value)}
                    className={inputClase}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={cerrarEdicionCliente}
                  disabled={guardandoEdicion}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdicion}
                  className="px-5 py-2 text-sm font-semibold bg-lime-400 hover:bg-lime-300 text-slate-900 rounded-xl shadow-sm shadow-lime-200/60 transition-all cursor-pointer disabled:opacity-50"
                >
                  {guardandoEdicion ? "Guardando..." : "Guardar Cambios"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}