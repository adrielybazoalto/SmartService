'use client';

/**
 * CU14 — Gestionar Proveedores y Catálogo de Mayoristas
 * Formularios de la vista /proveedores:
 *   - default ProveedoresForm: registro y edición de proveedor (modal)
 *   - CatalogoProveedor: catálogo del mayorista (producto, código de ítem y precio de compra)
 *   - ComparadorPrecios: subflujo "Comparar precios" de un producto entre proveedores
 * Sin facturación ni impuestos.
 */
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  actualizarItemCatalogoAction,
  actualizarProveedorAction,
  compararPreciosAction,
  obtenerCatalogoAction,
  quitarProductoCatalogoAction,
  registrarProveedorAction,
  verificarNitAction,
  vincularProductoAction,
} from '@/app/actions/proveedores';
import { NIT_MAX, NIT_MIN, nitValido } from '@/backend/proveedores/schema';
import type {
  ComparativoPrecios,
  ItemCatalogo,
  ProductoInventario,
  Proveedor,
  ProveedorDTO,
} from '@/backend/proveedores/types';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export type Notificar = (tipo: 'ok' | 'error', texto: string) => void;

const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const bs = (n: number) =>
  `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fecha = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const inputCls =
  'w-full bg-[#f8fafc] border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#8cd600] focus:outline-none disabled:opacity-60';
const celdaCls =
  'w-full bg-[#f8fafc] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#8cd600] focus:outline-none';
const btnPrimario =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-[#8cd600] px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#73b800] disabled:cursor-not-allowed disabled:opacity-50';
const btnSecundario =
  'rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50';

// ===========================================================================
// Formulario de proveedor (registro y edición)
// ===========================================================================
type Errores = Partial<Record<keyof ProveedorDTO, string>>;

function validar(v: ProveedorDTO): Errores {
  const e: Errores = {};
  const nit = (v.nit ?? '').trim();
  if ((v.razon_social ?? '').trim().length < 3) e.razon_social = 'Mínimo 3 caracteres';
  if (!nit) e.nit = 'El NIT es obligatorio';
  else if (!nitValido(nit)) e.nit = `De ${NIT_MIN} a ${NIT_MAX} letras, números o guiones, sin espacios`;
  if (v.correo?.trim() && !CORREO_REGEX.test(v.correo.trim())) e.correo = 'Correo inválido';
  if (v.telefono?.trim() && !/^[0-9+\s()-]{6,30}$/.test(v.telefono.trim())) e.telefono = 'Teléfono inválido';
  return e;
}

export default function ProveedoresForm({
  proveedor,
  onClose,
  onGuardado,
}: {
  proveedor: Proveedor | null;
  onClose: () => void;
  onGuardado: (p: Proveedor, esNuevo: boolean) => void;
}) {
  const esNuevo = !proveedor;
  const [valores, setValores] = useState<ProveedorDTO>({
    razon_social: proveedor?.razon_social ?? '',
    nit: proveedor?.nit ?? '',
    contacto: proveedor?.contacto ?? '',
    telefono: proveedor?.telefono ?? '',
    correo: proveedor?.correo ?? '',
    direccion: proveedor?.direccion ?? '',
  });
  const [errores, setErrores] = useState<Errores>({});
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !guardando && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guardando, onClose]);

  const cambiar = (campo: keyof ProveedorDTO, valor: string) => {
    const nuevos = { ...valores, [campo]: valor };
    setValores(nuevos);
    if (intento) setErrores(validar(nuevos));
  };

  // Aviso inmediato de NIT repetido al salir del campo
  const comprobarNit = async () => {
    const nit = (valores.nit ?? '').trim();
    if (!nitValido(nit) || nit.toLowerCase() === proveedor?.nit?.toLowerCase()) return;
    setVerificando(true);
    const res = await verificarNitAction(nit, proveedor?.id);
    setVerificando(false);
    if (res.ok && res.data.existe) setErrores((e) => ({ ...e, nit: 'Ya existe un proveedor con ese NIT' }));
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntento(true);
    setErrorServidor(null);
    const errs = validar(valores);
    setErrores(errs);
    if (Object.keys(errs).length) return;

    setGuardando(true);
    const res = esNuevo ? await registrarProveedorAction(valores) : await actualizarProveedorAction(proveedor!.id, valores);
    setGuardando(false);
    if (!res.ok) {
      if (/NIT/i.test(res.error)) setErrores((x) => ({ ...x, nit: res.error }));
      else setErrorServidor(res.error);
      return;
    }
    onGuardado(res.data, esNuevo);
  };

  return (
    <Modal onClose={() => !guardando && onClose()}>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Proveedor</p>
          <h2 className="text-xl font-bold text-slate-900">{esNuevo ? 'Nuevo proveedor' : 'Editar proveedor'}</h2>
        </div>
        <button onClick={onClose} disabled={guardando} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
          ✕
        </button>
      </div>

      <form onSubmit={enviar} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo etiqueta="Razón social" requerido error={errores.razon_social} className="sm:col-span-2">
            <input
              autoFocus
              value={valores.razon_social}
              onChange={(e) => cambiar('razon_social', e.target.value)}
              maxLength={200}
              placeholder="Distribuidora Andina S.R.L."
              className={inputCls}
            />
          </Campo>
          <Campo etiqueta="NIT" requerido error={errores.nit} ayuda={verificando ? 'Verificando…' : 'Letras, números y guiones'}>
            <input
              value={valores.nit}
              onChange={(e) => {
                cambiar('nit', e.target.value.replace(/\s/g, ''));
                if (errores.nit) setErrores((x) => ({ ...x, nit: undefined }));
              }}
              onBlur={comprobarNit}
              maxLength={NIT_MAX}
              placeholder="NIT-PROV-001 o 1023456789"
              className={`${inputCls} font-mono`}
            />
          </Campo>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Persona de contacto">
            <input value={valores.contacto ?? ''} onChange={(e) => cambiar('contacto', e.target.value)} maxLength={150} placeholder="Nombre y apellido" className={inputCls} />
          </Campo>
          <Campo etiqueta="Teléfono" error={errores.telefono}>
            <input type="tel" value={valores.telefono ?? ''} onChange={(e) => cambiar('telefono', e.target.value)} maxLength={30} placeholder="+591 70000000" className={inputCls} />
          </Campo>
        </div>
        <Campo etiqueta="Correo electrónico" error={errores.correo}>
          <input type="email" value={valores.correo ?? ''} onChange={(e) => cambiar('correo', e.target.value)} maxLength={150} placeholder="ventas@proveedor.com" className={inputCls} />
        </Campo>
        <Campo etiqueta="Dirección">
          <textarea rows={2} value={valores.direccion ?? ''} onChange={(e) => cambiar('direccion', e.target.value)} maxLength={255} placeholder="Calle, número, zona, ciudad" className={`${inputCls} resize-none`} />
        </Campo>

        {errorServidor && <Alerta>{errorServidor}</Alerta>}

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={guardando} className={btnSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className={btnPrimario}>
            {guardando && <Spinner />}
            {esNuevo ? 'Registrar proveedor' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ===========================================================================
// Catálogo del mayorista
// ===========================================================================
export function CatalogoProveedor({
  proveedor,
  productos,
  notificar,
  onTotal,
}: {
  proveedor: Proveedor;
  productos: ProductoInventario[];
  notificar: Notificar;
  onTotal: (total: number) => void;
}) {
  const [items, setItems] = useState<ItemCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Alta
  const [productoId, setProductoId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [precio, setPrecio] = useState('');
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);

  // Edición en línea
  const [editando, setEditando] = useState<number | null>(null);
  const [edicion, setEdicion] = useState({ codigo: '', precio: '' });
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const res = await obtenerCatalogoAction(proveedor.id);
    setCargando(false);
    if (!res.ok) return setError(res.error);
    setError(null);
    setItems(res.data);
  }, [proveedor.id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const actualizarLista = (lista: ItemCatalogo[]) => {
    const ordenada = [...lista].sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre));
    setItems(ordenada);
    onTotal(ordenada.length);
  };

  const disponibles = useMemo(() => {
    const usados = new Set(items.map((i) => i.producto_id));
    return productos.filter((p) => !usados.has(p.id));
  }, [productos, items]);

  const elegido = productos.find((p) => p.id === Number(productoId));

  const agregar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorAlta(null);
    if (!productoId) return setErrorAlta('Seleccione un producto');
    if (precio.trim() === '' || !Number.isFinite(Number(precio))) return setErrorAlta('Ingrese el precio de compra');
    if (Number(precio) < 0) return setErrorAlta('El precio de compra no puede ser negativo');

    setAgregando(true);
    const res = await vincularProductoAction(proveedor.id, {
      productoId: Number(productoId),
      codigoItemProveedor: codigo.trim() || null,
      precioCompra: precio,
    });
    setAgregando(false);
    if (!res.ok) return setErrorAlta(res.error);
    actualizarLista([...items, res.data]);
    setProductoId('');
    setCodigo('');
    setPrecio('');
    notificar('ok', res.mensaje);
  };

  const guardarEdicion = async (item: ItemCatalogo) => {
    if (edicion.precio.trim() === '' || !Number.isFinite(Number(edicion.precio)) || Number(edicion.precio) < 0) {
      return notificar('error', 'El precio de compra debe ser un número mayor o igual a 0');
    }
    setGuardando(true);
    const res = await actualizarItemCatalogoAction(proveedor.id, item.producto_id, {
      codigoItemProveedor: edicion.codigo.trim() || null,
      precioCompra: edicion.precio,
    });
    setGuardando(false);
    if (!res.ok) return notificar('error', res.error);
    actualizarLista(items.map((i) => (i.producto_id === item.producto_id ? res.data : i)));
    setEditando(null);
    notificar('ok', res.mensaje);
  };

  const quitar = async (item: ItemCatalogo) => {
    if (!confirm(`¿Quitar "${item.producto_nombre}" del catálogo de ${proveedor.razon_social}?`)) return;
    setQuitando(item.producto_id);
    const res = await quitarProductoCatalogoAction(proveedor.id, item.producto_id);
    setQuitando(null);
    if (!res.ok) return notificar('error', res.error);
    actualizarLista(items.filter((i) => i.producto_id !== item.producto_id));
    notificar('ok', res.mensaje);
  };

  const editable = proveedor.estado;

  return (
    <div className="space-y-5">
      {/* Alta */}
      {editable ? (
        <form onSubmit={agregar} className="rounded-xl border border-gray-100 bg-[#f8fafc]/60 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">Agregar producto del inventario</p>
          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-5">
              <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className={inputCls} aria-label="Producto">
                <option value="">
                  {productos.length === 0
                    ? 'No hay productos en el inventario'
                    : disponibles.length
                      ? 'Seleccione un producto…'
                      : 'Todos los productos ya están en el catálogo'}
                </option>
                {disponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              {elegido && (
                <p className="mt-1 text-xs text-slate-500">
                  Precio de compra en inventario: <strong>{bs(elegido.precio_compra_actual)}</strong>
                  {elegido.unidad_medida ? ` / ${elegido.unidad_medida}` : ''}
                </p>
              )}
            </div>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              maxLength={100}
              placeholder="Código del proveedor"
              className={`${inputCls} font-mono md:col-span-3`}
              aria-label="Código de ítem del proveedor"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="Precio compra"
              className={`${inputCls} md:col-span-2`}
              aria-label="Precio de compra"
            />
            <button type="submit" disabled={agregando || !disponibles.length} className={`${btnPrimario} md:col-span-2`}>
              {agregando && <Spinner />}
              Agregar
            </button>
          </div>
          {errorAlta && <p className="mt-2 text-sm text-red-600">{errorAlta}</p>}
        </form>
      ) : (
        <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Proveedor inactivo: reactívelo para modificar su catálogo.
        </div>
      )}

      <p className="text-sm font-semibold text-slate-900">
        Productos que provee <span className="font-normal text-slate-400">({items.length})</span>
      </p>

      {cargando ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[#f8fafc]" />
          ))}
        </div>
      ) : error ? (
        <Alerta>
          {error}{' '}
          <button onClick={cargar} className="font-semibold underline">
            Reintentar
          </button>
        </Alerta>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-slate-500">
          Este proveedor aún no tiene productos en su catálogo.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100">
          <li className="hidden grid-cols-12 gap-3 bg-[#f8fafc] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 md:grid">
            <span className="col-span-4">Producto</span>
            <span className="col-span-3">Código proveedor</span>
            <span className="col-span-2 text-right">Precio compra</span>
            <span className="col-span-1">Actualizado</span>
            <span className="col-span-2 text-right">Acciones</span>
          </li>
          {items.map((item) => {
            const enEdicion = editando === item.producto_id;
            const variacion =
              item.precio_inventario > 0 ? ((item.precio_compra - item.precio_inventario) / item.precio_inventario) * 100 : null;
            return (
              <li key={item.producto_id} className={`grid grid-cols-12 items-center gap-3 px-4 py-3 ${enEdicion ? 'bg-[#8cd600]/5' : ''}`}>
                <div className="col-span-12 md:col-span-4">
                  <p className="font-medium text-slate-900">{item.producto_nombre}</p>
                  <p className="text-xs text-slate-400">
                    Inventario {bs(item.precio_inventario)}
                    {item.unidad_medida ? ` / ${item.unidad_medida}` : ''}
                  </p>
                </div>
                <div className="col-span-6 md:col-span-3">
                  {enEdicion ? (
                    <input
                      value={edicion.codigo}
                      onChange={(e) => setEdicion((s) => ({ ...s, codigo: e.target.value }))}
                      maxLength={100}
                      placeholder="Sin código"
                      className={`${celdaCls} font-mono`}
                    />
                  ) : item.codigo_item_proveedor ? (
                    <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{item.codigo_item_proveedor}</span>
                  ) : (
                    <span className="text-xs text-slate-400">Sin código</span>
                  )}
                </div>
                <div className="col-span-6 text-right md:col-span-2">
                  {enEdicion ? (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={edicion.precio}
                      onChange={(e) => setEdicion((s) => ({ ...s, precio: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && guardarEdicion(item)}
                      className={`${celdaCls} text-right`}
                    />
                  ) : (
                    <div className="flex flex-col items-end">
                      <span className="font-semibold text-slate-900">{bs(item.precio_compra)}</span>
                      {variacion !== null && Math.abs(variacion) >= 0.5 && (
                        <span className={`text-[11px] font-semibold ${variacion < 0 ? 'text-[#3f6b00]' : 'text-amber-600'}`}>
                          {variacion < 0 ? '▼' : '▲'} {Math.abs(variacion).toFixed(1)}% vs inventario
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <span className="col-span-6 text-xs text-slate-500 md:col-span-1">{fecha(item.fecha_actualizacion)}</span>
                <div className="col-span-6 flex justify-end gap-1 md:col-span-2">
                  {enEdicion ? (
                    <>
                      <button
                        onClick={() => guardarEdicion(item)}
                        disabled={guardando}
                        className="rounded-lg bg-[#8cd600] px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-[#73b800] disabled:opacity-50"
                      >
                        {guardando ? '…' : 'Guardar'}
                      </button>
                      <button onClick={() => setEditando(null)} className="rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100">
                        Cancelar
                      </button>
                    </>
                  ) : (
                    editable && (
                      <>
                        <button
                          onClick={() => {
                            setEditando(item.producto_id);
                            setEdicion({ codigo: item.codigo_item_proveedor ?? '', precio: String(item.precio_compra) });
                          }}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => quitar(item)}
                          disabled={quitando === item.producto_id}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          {quitando === item.producto_id ? '…' : 'Quitar'}
                        </button>
                      </>
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


// ===========================================================================
// Subflujo "Comparar precios"
// ===========================================================================
export function ComparadorPrecios({
  productos,
  version = 0,
}: {
  productos: ProductoInventario[];
  /** Cambia cuando se modifica un catálogo, para recargar el comparativo */
  version?: number;
}) {
  const [productoId, setProductoId] = useState<number | null>(null);
  const [filtro, setFiltro] = useState('');
  const [datos, setDatos] = useState<ComparativoPrecios | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const opciones = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return q ? productos.filter((p) => p.nombre.toLowerCase().includes(q)) : productos;
  }, [productos, filtro]);

  useEffect(() => {
    if (!productoId) {
      setDatos(null);
      return;
    }
    let vigente = true;
    setCargando(true);
    setError(null);
    compararPreciosAction(productoId).then((res) => {
      if (!vigente) return;
      setCargando(false);
      if (res.ok) setDatos(res.data);
      else {
        setDatos(null);
        setError(res.error);
      }
    });
    return () => {
      vigente = false;
    };
  }, [productoId, version]);

  const peor = datos?.ofertas.filter((o) => o.activo).reduce((m, o) => Math.max(m, o.precio_compra), 0) ?? 0;
  const ahorro = datos?.mejor_precio != null && peor > datos.mejor_precio ? peor - datos.mejor_precio : 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-slate-900">Comparar precios</h2>
        <p className="text-sm text-slate-500">
          Elija un producto para ver qué proveedor lo ofrece más barato.
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar productos"
          className={inputCls}
          aria-label="Filtrar productos"
        />
        <select
          value={productoId ?? ''}
          onChange={(e) => setProductoId(e.target.value ? Number(e.target.value) : null)}
          className={inputCls}
          aria-label="Producto a comparar"
        >
          <option value="">Seleccione un producto</option>
          {opciones.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5">
        {error ? (
          <Alerta>{error}</Alerta>
        ) : !productoId ? null : cargando && !datos ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> Cargando comparativo…
          </div>
        ) : datos && datos.ofertas.length === 0 ? (
          <div className="rounded-xl bg-[#f8fafc] p-6 text-center text-sm text-slate-500">
            Ningún proveedor tiene <strong>{datos.producto_nombre}</strong> en su catálogo.
          </div>
        ) : datos ? (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[#8cd600]/40 bg-[#8cd600]/10 p-3">
                <p className="text-xs font-medium text-slate-600">Mejor precio</p>
                <p className="text-lg font-bold text-slate-900">
                  {datos.mejor_precio != null ? bs(datos.mejor_precio) : '—'}
                </p>
              </div>
              <div className="rounded-xl bg-[#f8fafc] p-3">
                <p className="text-xs font-medium text-slate-500">Precio en inventario</p>
                <p className="text-lg font-bold text-slate-900">{bs(datos.precio_inventario)}</p>
              </div>
              <div className="col-span-2 rounded-xl bg-[#f8fafc] p-3 sm:col-span-1">
                <p className="text-xs font-medium text-slate-500">Ahorro vs. el más caro</p>
                <p className="text-lg font-bold text-slate-900">{bs(ahorro)}</p>
              </div>
            </div>

            <ul className="space-y-2">
              {datos.ofertas.map((o, i) => (
                <li
                  key={o.proveedor_id}
                  className={`flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center ${
                    o.es_mejor ? 'border-[#8cd600] bg-[#8cd600]/5' : 'border-gray-100'
                  } ${o.activo ? '' : 'opacity-60'}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      {o.razon_social}
                      {o.es_mejor && (
                        <span className="rounded-md bg-[#8cd600] px-1.5 py-0.5 text-[11px] font-bold text-gray-900">
                          Más barato
                        </span>
                      )}
                      {!o.activo && (
                        <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                          Inactivo
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      Código {o.codigo_item_proveedor ?? 'sin código'} · Actualizado {fecha(o.fecha_actualizacion)}
                    </p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-base font-bold text-slate-900">{bs(o.precio_compra)}</p>
                    {o.activo && o.diferencia > 0 && (
                      <p className="text-xs font-medium text-red-600">+{bs(o.diferencia)}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ===========================================================================
// Componentes pequeños
// ===========================================================================
function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-2xl sm:rounded-2xl">
        {children}
      </div>
    </div>
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
