'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  actualizarProveedorAction,
  eliminarItemCatalogoAction,
  obtenerCatalogoAction,
  procesarActualizacionCatalogoAction,
  registrarProveedorAction,
  verificarRUCAction,
} from '@/app/actions/proveedores';
import type {
  CatalogoMayorista,
  ProductoCatalogoDTO,
  ProductoOpcion,
  Proveedor,
  ProveedorDTO,
  ResumenCatalogo,
} from '@/backend/proveedores';

// ---------------------------------------------------------------------------
// Tipos y utilidades
// ---------------------------------------------------------------------------
export type PestanaProveedor = 'datos' | 'catalogo';

type Props = {
  /** null = nuevo proveedor */
  proveedor: Proveedor | null;
  productos: ProductoOpcion[];
  pestanaInicial?: PestanaProveedor;
  onClose: () => void;
  onProveedorGuardado: (proveedor: Proveedor, esNuevo: boolean) => void;
  onCatalogoActualizado?: (resumen: ResumenCatalogo) => void;
  notificar: (tipo: 'ok' | 'error', texto: string) => void;
};

type FilaCatalogo = {
  key: string;
  catalogoId: number | null; // null = fila nueva
  productoId: string;
  codigo: string;
  precio: string;
  stock: string;
  original: { codigo: string; precio: string; stock: string } | null;
};

type ErroresProveedor = Partial<Record<keyof ProveedorDTO, string>>;

const inputCls =
  'w-full bg-[#f8fafc] border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#8cd600] focus:outline-none disabled:opacity-60';
const celdaCls =
  'w-full bg-[#f8fafc] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#8cd600] focus:outline-none';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const bs = (n: number) =>
  `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let secuencia = 0;
const nuevaKey = () => `n${Date.now()}-${secuencia++}`;

function aFila(c: CatalogoMayorista): FilaCatalogo {
  const base = {
    codigo: c.codigo_item_proveedor ?? '',
    precio: String(c.precio_mayorista),
    stock: String(c.stock_disponible),
  };
  return { key: `c${c.id}`, catalogoId: c.id, productoId: String(c.producto_id), ...base, original: base };
}

const filaModificada = (f: FilaCatalogo) =>
  !f.original ||
  f.codigo.trim() !== f.original.codigo ||
  Number(f.precio) !== Number(f.original.precio) ||
  Number(f.stock || 0) !== Number(f.original.stock);

function validarProveedor(v: ProveedorDTO): ErroresProveedor {
  const e: ErroresProveedor = {};
  if ((v.razon_social ?? '').trim().length < 3) e.razon_social = 'Mínimo 3 caracteres';
  if (!/^[0-9A-Za-z-]{5,50}$/.test((v.nit ?? '').trim())) e.nit = 'NIT inválido (5 a 50 caracteres, sin espacios)';
  if (v.correo?.trim() && !EMAIL_RE.test(v.correo.trim())) e.correo = 'Correo inválido';
  if (v.telefono?.trim() && !/^[0-9+\s()-]{6,30}$/.test(v.telefono.trim())) e.telefono = 'Teléfono inválido';
  return e;
}

// ===========================================================================
// Componente
// ===========================================================================
export default function ProveedoresForm({
  proveedor: proveedorInicial,
  productos,
  pestanaInicial = 'datos',
  onClose,
  onProveedorGuardado,
  onCatalogoActualizado,
  notificar,
}: Props) {
  const [proveedor, setProveedor] = useState<Proveedor | null>(proveedorInicial);
  const [pestana, setPestana] = useState<PestanaProveedor>(proveedorInicial ? pestanaInicial : 'datos');
  const ocupadoRef = useRef<boolean>(false);

  // ---------------- Datos del proveedor ----------------
  const [valores, setValores] = useState<ProveedorDTO>({
    razon_social: proveedorInicial?.razon_social ?? '',
    nit: proveedorInicial?.nit ?? '',
    contacto: proveedorInicial?.contacto ?? '',
    telefono: proveedorInicial?.telefono ?? '',
    correo: proveedorInicial?.correo ?? '',
    direccion: proveedorInicial?.direccion ?? '',
  });
  const [errores, setErrores] = useState<ErroresProveedor>({});
  const [intentoEnvio, setIntentoEnvio] = useState(false);
  const [guardandoDatos, setGuardandoDatos] = useState(false);
  const [errorDatos, setErrorDatos] = useState<string | null>(null);
  const [verificandoNit, setVerificandoNit] = useState(false);

  // ---------------- Catálogo ----------------
  const [filas, setFilas] = useState<FilaCatalogo[]>([]);
  const [cargandoCatalogo, setCargandoCatalogo] = useState(false);
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null);
  const [guardandoCatalogo, setGuardandoCatalogo] = useState(false);
  const [quitandoId, setQuitandoId] = useState<number | null>(null);
  const [resumen, setResumen] = useState<ResumenCatalogo | null>(null);

  const productosPorId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  // Escape para cerrar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !ocupadoRef.current && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, ocupadoRef]);
  ocupadoRef.current = guardandoDatos || guardandoCatalogo;

  // ======================= DATOS =======================
  const cambiar = (campo: keyof ProveedorDTO, valor: string) => {
    const nuevos = { ...valores, [campo]: valor };
    setValores(nuevos);
    if (intentoEnvio) setErrores(validarProveedor(nuevos));
  };

  /** verificarRUCExistente al salir del campo NIT */
  const verificarNit = async () => {
    const nit = (valores.nit ?? '').trim();
    if (!/^[0-9A-Za-z-]{5,50}$/.test(nit) || nit === proveedor?.nit) return;
    setVerificandoNit(true);
    const res = await verificarRUCAction(nit, proveedor?.id);
    setVerificandoNit(false);
    if (res.ok && res.data.existe) setErrores((e) => ({ ...e, nit: 'Ya existe un proveedor con ese NIT' }));
  };

  /** registrarDatosProveedor(proveedorDTO) */
  const guardarDatos = async (e: FormEvent) => {
    e.preventDefault();
    setIntentoEnvio(true);
    setErrorDatos(null);
    const errs = validarProveedor(valores);
    setErrores(errs);
    if (Object.keys(errs).length) return;

    setGuardandoDatos(true);
    const esNuevo = !proveedor;
    const res = esNuevo ? await registrarProveedorAction(valores) : await actualizarProveedorAction(proveedor!.id, valores);
    setGuardandoDatos(false);

    if (!res.ok) {
      if (/NIT/i.test(res.error)) setErrores((x) => ({ ...x, nit: res.error }));
      else setErrorDatos(res.error);
      return;
    }
    notificar('ok', res.mensaje);
    setProveedor(res.data);
    onProveedorGuardado(res.data, esNuevo);
    // Tras registrar, el flujo continúa con el catálogo del mayorista
    if (esNuevo) setPestana('catalogo');
  };

  // ======================= CATÁLOGO =======================
  const cargarCatalogo = useCallback(async (proveedorId: number) => {
    setCargandoCatalogo(true);
    setErrorCatalogo(null);
    const res = await obtenerCatalogoAction(proveedorId);
    setCargandoCatalogo(false);
    if (!res.ok) return setErrorCatalogo(res.error);
    setFilas(res.data.map(aFila));
  }, []);

  useEffect(() => {
    if (pestana === 'catalogo' && proveedor) cargarCatalogo(proveedor.id);
  }, [pestana, proveedor?.id, cargarCatalogo]); // eslint-disable-line react-hooks/exhaustive-deps

  const usados = useMemo(() => new Set(filas.map((f) => f.productoId).filter(Boolean)), [filas]);
  const modificadas = filas.filter(filaModificada);
  const pendientes = modificadas.length;

  const agregarFila = () =>
    setFilas((prev) => [
      ...prev,
      { key: nuevaKey(), catalogoId: null, productoId: '', codigo: '', precio: '', stock: '0', original: null },
    ]);

  const editarFila = (key: string, campo: 'productoId' | 'codigo' | 'precio' | 'stock', valor: string) => {
    setResumen(null);
    setFilas((prev) =>
      prev.map((f) => {
        if (f.key !== key) return f;
        const nueva = { ...f, [campo]: valor };
        // Sugerir el precio de compra actual al elegir un producto nuevo
        if (campo === 'productoId' && !f.precio) {
          const p = productosPorId.get(Number(valor));
          if (p) nueva.precio = String(p.precio_compra_actual);
        }
        return nueva;
      })
    );
  };

  const quitarFila = async (f: FilaCatalogo) => {
    if (f.catalogoId === null) {
      setFilas((prev) => prev.filter((x) => x.key !== f.key));
      return;
    }
    const nombre = productosPorId.get(Number(f.productoId))?.nombre ?? 'este producto';
    if (!confirm(`¿Quitar "${nombre}" del catálogo del proveedor?`)) return;
    setQuitandoId(f.catalogoId);
    const res = await eliminarItemCatalogoAction(f.catalogoId);
    setQuitandoId(null);
    if (!res.ok) return notificar('error', res.error);
    setFilas((prev) => prev.filter((x) => x.key !== f.key));
    notificar('ok', res.mensaje);
  };

  /** recorrerYValidarListaProductos (versión cliente, para feedback inmediato) */
  const validarFilas = (lista: FilaCatalogo[]): string | null => {
    const productosVistos = new Set<string>();
    const codigos = new Map<string, number>();
    for (let i = 0; i < lista.length; i++) {
      const f = lista[i];
      const n = filas.indexOf(f) + 1;
      if (!f.productoId) return `Fila ${n}: seleccione un producto`;
      if (productosVistos.has(f.productoId)) return `Fila ${n}: producto repetido`;
      productosVistos.add(f.productoId);
      if (f.precio.trim() === '' || !Number.isFinite(Number(f.precio))) return `Fila ${n}: ingrese el precio mayorista`;
      if (Number(f.precio) < 0) return `Fila ${n}: el precio no puede ser negativo`;
      if (!Number.isInteger(Number(f.stock || 0)) || Number(f.stock || 0) < 0) return `Fila ${n}: stock inválido`;
    }
    for (let i = 0; i < filas.length; i++) {
      const c = filas[i].codigo.trim().toLowerCase();
      if (!c) continue;
      if (codigos.has(c)) return `Fila ${i + 1}: código de ítem repetido (fila ${codigos.get(c)! + 1})`;
      codigos.set(c, i);
    }
    return null;
  };

  /** seleccionarProveedorYCatalogo → procesarActualizacionCatalogo(proveedorId, listaDTO) */
  const guardarCatalogo = async () => {
    if (!proveedor) return;
    setErrorCatalogo(null);
    const invalido = validarFilas(modificadas);
    if (invalido) return setErrorCatalogo(invalido);

    const listaDTO: ProductoCatalogoDTO[] = modificadas.map((f) => ({
      productoId: Number(f.productoId),
      codigoItemProveedor: f.codigo.trim() || null,
      precioMayorista: Number(f.precio),
      stockDisponible: Number(f.stock || 0),
    }));

    setGuardandoCatalogo(true);
    const res = await procesarActualizacionCatalogoAction(proveedor.id, listaDTO);
    setGuardandoCatalogo(false);
    if (!res.ok) {
      setErrorCatalogo(res.error);
      notificar('error', res.error);
      return;
    }
    setFilas(res.data.catalogo.map(aFila));
    setResumen(res.data);
    notificar('ok', res.mensaje);
    onCatalogoActualizado?.(res.data);
  };

  const ocupado = guardandoDatos || guardandoCatalogo;
  const cerrar = () => {
    if (ocupado) return;
    if (pendientes > 0 && !confirm('Hay cambios del catálogo sin guardar. ¿Cerrar de todos modos?')) return;
    onClose();
  };

  // =========================================================================
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && cerrar()}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-4xl sm:rounded-2xl"
      >
        {/* Cabecera */}
        <div className="border-b border-gray-100 px-5 pb-4 pt-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">CU014 · Proveedor</p>
              <h2 className="truncate text-xl font-bold text-slate-900">
                {proveedor ? proveedor.razon_social : 'Nuevo proveedor'}
              </h2>
              {proveedor && <p className="text-sm text-slate-500">NIT {proveedor.nit}</p>}
            </div>
            <button
              onClick={cerrar}
              disabled={ocupado}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 flex gap-1 rounded-xl bg-[#f8fafc] p-1">
            <Pestana activa={pestana === 'datos'} onClick={() => setPestana('datos')}>
              Datos del proveedor
            </Pestana>
            <Pestana
              activa={pestana === 'catalogo'}
              onClick={() => proveedor && setPestana('catalogo')}
              deshabilitada={!proveedor}
              titulo={!proveedor ? 'Registre primero al proveedor' : undefined}
            >
              Catálogo mayorista {proveedor ? `(${filas.length || proveedor.total_productos})` : ''}
            </Pestana>
          </div>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {pestana === 'datos' ? (
            <form id="form-proveedor" onSubmit={guardarDatos} noValidate className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo etiqueta="Razón social" requerido error={errores.razon_social} className="sm:col-span-2">
                  <input
                    autoFocus
                    value={valores.razon_social ?? ''}
                    onChange={(e) => cambiar('razon_social', e.target.value)}
                    maxLength={200}
                    placeholder="Distribuidora Andina S.R.L."
                    className={inputCls}
                  />
                </Campo>
                <Campo
                  etiqueta="NIT"
                  requerido
                  error={errores.nit}
                  ayuda={verificandoNit ? 'Verificando NIT…' : undefined}
                >
                  <input
                    value={valores.nit ?? ''}
                    onChange={(e) => {
                      cambiar('nit', e.target.value.replace(/\s/g, ''));
                      if (errores.nit) setErrores((x) => ({ ...x, nit: undefined }));
                    }}
                    onBlur={verificarNit}
                    maxLength={50}
                    inputMode="numeric"
                    placeholder="1023456789"
                    className={inputCls}
                  />
                </Campo>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo etiqueta="Persona de contacto" error={errores.contacto}>
                  <input
                    value={valores.contacto ?? ''}
                    onChange={(e) => cambiar('contacto', e.target.value)}
                    maxLength={150}
                    placeholder="Nombre y apellido"
                    className={inputCls}
                  />
                </Campo>
                <Campo etiqueta="Teléfono" error={errores.telefono}>
                  <input
                    type="tel"
                    value={valores.telefono ?? ''}
                    onChange={(e) => cambiar('telefono', e.target.value)}
                    maxLength={30}
                    placeholder="+591 70000000"
                    className={inputCls}
                  />
                </Campo>
              </div>
              <Campo etiqueta="Correo electrónico" error={errores.correo}>
                <input
                  type="email"
                  value={valores.correo ?? ''}
                  onChange={(e) => cambiar('correo', e.target.value)}
                  maxLength={150}
                  placeholder="ventas@proveedor.com"
                  className={inputCls}
                />
              </Campo>
              <Campo etiqueta="Dirección" error={errores.direccion}>
                <textarea
                  rows={2}
                  value={valores.direccion ?? ''}
                  onChange={(e) => cambiar('direccion', e.target.value)}
                  maxLength={255}
                  placeholder="Av. / Calle, número, zona, ciudad"
                  className={`${inputCls} resize-none`}
                />
              </Campo>
              {errorDatos && <Alerta>{errorDatos}</Alerta>}
            </form>
          ) : (
            <div className="space-y-4">
              {!proveedor?.estado && (
                <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
                  Proveedor desactivado: reactívelo para actualizar su catálogo.
                </div>
              )}

              {/* mostrarResumenCatalogo */}
              {resumen && (
                <div className="rounded-xl border border-[#8cd600]/40 bg-[#8cd600]/10 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">Resumen de la actualización</p>
                    <button onClick={() => setResumen(null)} className="text-xs font-medium text-slate-500 hover:text-slate-800">
                      Ocultar
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <Indicador etiqueta="Nuevos" valor={resumen.insertados} />
                    <Indicador etiqueta="Actualizados" valor={resumen.actualizados} />
                    <Indicador etiqueta="Sin cambios" valor={resumen.sinCambios} />
                  </div>
                  {resumen.cambiosPrecio.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-slate-700">
                      {resumen.cambiosPrecio.map((c) => (
                        <li key={c.productoId} className="flex justify-between gap-2">
                          <span className="truncate">{c.productoNombre}</span>
                          <span className="whitespace-nowrap font-medium">
                            {c.precioAnterior === null ? 'nuevo' : bs(c.precioAnterior)} → {bs(c.precioNuevo)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {cargandoCatalogo ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-xl bg-[#f8fafc]" />
                  ))}
                </div>
              ) : (
                <>
                  {filas.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-slate-500">
                      Este proveedor aún no tiene productos en su catálogo.
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-xl border border-gray-100">
                      <div className="hidden grid-cols-12 gap-3 bg-[#f8fafc] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid">
                        <span className="col-span-4">Producto</span>
                        <span className="col-span-3">Código proveedor</span>
                        <span className="col-span-2 text-right">Precio mayorista</span>
                        <span className="col-span-2 text-right">Stock mayorista</span>
                        <span className="col-span-1" />
                      </div>
                      <ul className="divide-y divide-gray-100">
                        {filas.map((f, i) => {
                          const prod = productosPorId.get(Number(f.productoId));
                          const cambiada = filaModificada(f);
                          const ref = prod?.precio_compra_actual ?? 0;
                          const precioNum = Number(f.precio);
                          const variacion = ref && f.precio !== '' ? ((precioNum - ref) / ref) * 100 : null;
                          return (
                            <li
                              key={f.key}
                              className={`grid grid-cols-12 items-start gap-3 px-4 py-3 ${cambiada ? 'bg-[#8cd600]/5' : ''}`}
                            >
                              <div className="col-span-12 md:col-span-4">
                                <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400 md:hidden">
                                  Producto
                                </span>
                                {f.catalogoId === null ? (
                                  <select
                                    value={f.productoId}
                                    onChange={(e) => editarFila(f.key, 'productoId', e.target.value)}
                                    className={celdaCls}
                                    aria-label={`Producto fila ${i + 1}`}
                                  >
                                    <option value="">Seleccione…</option>
                                    {productos
                                      .filter((p) => String(p.id) === f.productoId || !usados.has(String(p.id)))
                                      .map((p) => (
                                        <option key={p.id} value={p.id}>
                                          {p.nombre}
                                        </option>
                                      ))}
                                  </select>
                                ) : (
                                  <p className="py-2 text-sm font-medium text-slate-900">{prod?.nombre ?? `Producto #${f.productoId}`}</p>
                                )}
                                {prod && (
                                  <p className="mt-0.5 text-xs text-slate-400">
                                    Compra actual {bs(ref)}
                                    {prod.unidad_medida ? ` / ${prod.unidad_medida}` : ''}
                                  </p>
                                )}
                              </div>
                              <div className="col-span-12 md:col-span-3">
                                <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400 md:hidden">
                                  Código proveedor
                                </span>
                                <input
                                  value={f.codigo}
                                  onChange={(e) => editarFila(f.key, 'codigo', e.target.value)}
                                  maxLength={100}
                                  placeholder="Ej. HK-DS2CD"
                                  className={`${celdaCls} font-mono`}
                                />
                              </div>
                              <div className="col-span-6 md:col-span-2">
                                <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400 md:hidden">
                                  Precio
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  inputMode="decimal"
                                  value={f.precio}
                                  onChange={(e) => editarFila(f.key, 'precio', e.target.value)}
                                  placeholder="0.00"
                                  className={`${celdaCls} text-right`}
                                />
                                {variacion !== null && Math.abs(variacion) >= 0.5 && (
                                  <p className={`mt-0.5 text-right text-[11px] font-semibold ${variacion < 0 ? 'text-[#3f6b00]' : 'text-amber-600'}`}>
                                    {variacion < 0 ? '▼' : '▲'} {Math.abs(variacion).toFixed(1)}%
                                  </p>
                                )}
                              </div>
                              <div className="col-span-4 md:col-span-2">
                                <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-400 md:hidden">
                                  Stock
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  inputMode="numeric"
                                  value={f.stock}
                                  onChange={(e) => editarFila(f.key, 'stock', e.target.value)}
                                  className={`${celdaCls} text-right`}
                                />
                              </div>
                              <div className="col-span-2 flex justify-end pt-5 md:col-span-1 md:pt-0">
                                <button
                                  type="button"
                                  onClick={() => quitarFila(f)}
                                  disabled={quitandoId === f.catalogoId && f.catalogoId !== null}
                                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                  aria-label="Quitar producto"
                                >
                                  ✕
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={agregarFila}
                    disabled={!proveedor?.estado || usados.size >= productos.length}
                    className="w-full rounded-xl border border-dashed border-[#8cd600] px-4 py-3 text-sm font-semibold text-[#3f6b00] transition hover:bg-[#8cd600]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    + Agregar producto al catálogo
                  </button>
                </>
              )}

              {errorCatalogo && <Alerta>{errorCatalogo}</Alerta>}
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-slate-400">
            {pestana === 'catalogo'
              ? pendientes
                ? `${pendientes} cambio(s) sin guardar`
                : 'Sin cambios pendientes'
              : 'Los campos con * son obligatorios'}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <button
              type="button"
              onClick={cerrar}
              disabled={ocupado}
              className="rounded-xl border border-gray-200 px-5 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cerrar
            </button>
            {pestana === 'datos' ? (
              <button
                type="submit"
                form="form-proveedor"
                disabled={guardandoDatos}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8cd600] px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#73b800] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {guardandoDatos && <Spinner />}
                {proveedor ? 'Guardar cambios' : 'Registrar proveedor'}
              </button>
            ) : (
              <button
                type="button"
                onClick={guardarCatalogo}
                disabled={guardandoCatalogo || pendientes === 0 || !proveedor?.estado}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8cd600] px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#73b800] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {guardandoCatalogo && <Spinner />}
                Guardar catálogo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponentes
// ---------------------------------------------------------------------------
function Pestana({
  activa,
  deshabilitada,
  titulo,
  onClick,
  children,
}: {
  activa: boolean;
  deshabilitada?: boolean;
  titulo?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitada}
      title={titulo}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${
        activa ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function Campo({
  etiqueta,
  requerido,
  error,
  ayuda,
  className = '',
  children,
}: {
  etiqueta: string;
  requerido?: boolean;
  error?: string;
  ayuda?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {etiqueta} {requerido && <span className="text-red-500">*</span>}
      </span>
      <span className={`block ${error ? '[&_input]:border-red-300 [&_textarea]:border-red-300' : ''}`}>{children}</span>
      {error ? (
        <span className="mt-1 block text-xs text-red-600">{error}</span>
      ) : ayuda ? (
        <span className="mt-1 block text-xs text-slate-400">{ayuda}</span>
      ) : null}
    </label>
  );
}

function Indicador({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <div className="rounded-lg bg-white px-2 py-2">
      <p className="text-lg font-bold text-slate-900">{valor}</p>
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{etiqueta}</p>
    </div>
  );
}

function Alerta({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
      {children}
    </div>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}
