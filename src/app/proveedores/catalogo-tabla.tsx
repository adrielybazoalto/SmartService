'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  actualizarVinculo,
  compararPrecios,
  desvincularProducto,
  obtenerCatalogoProveedor,
  vincularProducto,
  type ComparativoPrecio,
  type ProductoCatalogo,
  type VinculoProducto,
} from '@/app/actions/proveedores';

type Props = {
  proveedorId: number;
  proveedorActivo: boolean;
  productos: ProductoCatalogo[];
  notificar: (tipo: 'ok' | 'error', texto: string) => void;
  onCambio?: (totalProductos: number) => void;
};

const bs = (n: number) =>
  `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return d.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const inputCls =
  'w-full bg-[#f8fafc] border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#8cd600] focus:outline-none';
const inputSm =
  'w-full bg-[#f8fafc] border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:ring-2 focus:ring-[#8cd600] focus:outline-none';

/** Variación del precio pactado frente al precio de compra actual del catálogo */
function Variacion({ pactado, actual }: { pactado: number; actual: number }) {
  if (!actual) return null;
  const pct = ((pactado - actual) / actual) * 100;
  if (Math.abs(pct) < 0.5) return <span className="text-[11px] font-medium text-slate-400">= precio actual</span>;
  const menor = pct < 0;
  return (
    <span className={`text-[11px] font-semibold ${menor ? 'text-[#3f6b00]' : 'text-amber-600'}`}>
      {menor ? '▼' : '▲'} {Math.abs(pct).toFixed(1)}% vs actual
    </span>
  );
}

export default function CatalogoTabla({ proveedorId, proveedorActivo, productos, notificar, onCambio }: Props) {
  const [vinculos, setVinculos] = useState<VinculoProducto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState('');

  // Alta
  const [productoId, setProductoId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [precio, setPrecio] = useState('');
  const [errorAlta, setErrorAlta] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Edición en línea
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edicion, setEdicion] = useState({ codigo: '', precio: '' });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  // Eliminación / comparación
  const [eliminandoId, setEliminandoId] = useState<number | null>(null);
  const [comparando, setComparando] = useState<{ nombre: string; productoId: number; lista: ComparativoPrecio[] | null } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const res = await obtenerCatalogoProveedor(proveedorId);
    if (res.ok) {
      setVinculos(res.data);
      setError(null);
    } else setError(res.error);
    setCargando(false);
  }, [proveedorId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const disponibles = useMemo(() => {
    const usados = new Set(vinculos.map((v) => v.producto_id));
    return productos.filter((p) => !usados.has(p.id));
  }, [productos, vinculos]);

  const productoElegido = productos.find((p) => p.id === Number(productoId));

  const visibles = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return vinculos;
    return vinculos.filter(
      (v) => v.producto_nombre.toLowerCase().includes(q) || (v.codigo_item_proveedor ?? '').toLowerCase().includes(q)
    );
  }, [vinculos, filtro]);

  const actualizarLista = (lista: VinculoProducto[]) => {
    const ordenada = [...lista].sort((a, b) => a.producto_nombre.localeCompare(b.producto_nombre));
    setVinculos(ordenada);
    onCambio?.(ordenada.length);
  };

  // ---- Alta ---------------------------------------------------------------
  const agregar = async (e: FormEvent) => {
    e.preventDefault();
    setErrorAlta(null);
    const precioNum = Number(precio);
    if (!productoId) return setErrorAlta('Seleccione un producto');
    if (precio.trim() === '' || !Number.isFinite(precioNum)) return setErrorAlta('Ingrese el precio pactado');
    if (precioNum < 0) return setErrorAlta('El precio no puede ser negativo');
    const cod = codigo.trim();
    if (cod && vinculos.some((v) => (v.codigo_item_proveedor ?? '').toLowerCase() === cod.toLowerCase())) {
      return setErrorAlta('Ese código de ítem ya está registrado para este proveedor');
    }

    setGuardando(true);
    const res = await vincularProducto({
      proveedor_id: proveedorId,
      producto_id: Number(productoId),
      codigo_item_proveedor: cod,
      precio_compra: precioNum,
    });
    setGuardando(false);
    if (!res.ok) return setErrorAlta(res.error);

    actualizarLista([...vinculos, res.data]);
    setProductoId('');
    setCodigo('');
    setPrecio('');
    notificar('ok', `"${res.data.producto_nombre}" agregado al catálogo`);
  };

  // ---- Edición --------------------------------------------------------------
  const iniciarEdicion = (v: VinculoProducto) => {
    setEditandoId(v.id);
    setEdicion({ codigo: v.codigo_item_proveedor ?? '', precio: String(v.precio_compra) });
  };

  const guardarEdicion = async (v: VinculoProducto) => {
    const precioNum = Number(edicion.precio);
    if (edicion.precio.trim() === '' || !Number.isFinite(precioNum) || precioNum < 0) {
      return notificar('error', 'Precio inválido: debe ser un número mayor o igual a 0');
    }
    setGuardandoEdicion(true);
    const res = await actualizarVinculo(v.id, { codigo_item_proveedor: edicion.codigo, precio_compra: precioNum });
    setGuardandoEdicion(false);
    if (!res.ok) return notificar('error', res.error);
    actualizarLista(vinculos.map((x) => (x.id === v.id ? res.data : x)));
    setEditandoId(null);
    notificar('ok', res.mensaje ?? 'Precio pactado actualizado');
  };

  // ---- Eliminación ----------------------------------------------------------
  const quitar = async (v: VinculoProducto) => {
    if (!confirm(`¿Quitar "${v.producto_nombre}" del catálogo de este proveedor?`)) return;
    setEliminandoId(v.id);
    const res = await desvincularProducto(v.id);
    setEliminandoId(null);
    if (!res.ok) return notificar('error', res.error);
    actualizarLista(vinculos.filter((x) => x.id !== v.id));
    notificar('ok', res.mensaje ?? 'Producto retirado');
  };

  // ---- Comparar precios -----------------------------------------------------
  const abrirComparativo = async (v: VinculoProducto) => {
    setComparando({ nombre: v.producto_nombre, productoId: v.producto_id, lista: null });
    const res = await compararPrecios(v.producto_id);
    if (!res.ok) {
      setComparando(null);
      return notificar('error', res.error);
    }
    setComparando({ nombre: v.producto_nombre, productoId: v.producto_id, lista: res.data });
  };

  return (
    <div className="space-y-5">
      {/* ---------------- Alta de vínculo ---------------- */}
      {proveedorActivo ? (
        <form onSubmit={agregar} className="rounded-xl border border-gray-100 bg-[#f8fafc]/60 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-900">Vincular producto</p>
          <div className="grid gap-3 md:grid-cols-12">
            <div className="md:col-span-5">
              <select
                value={productoId}
                onChange={(e) => setProductoId(e.target.value)}
                className={inputCls}
                aria-label="Producto"
              >
                <option value="">{disponibles.length ? 'Seleccione un producto…' : 'Todos los productos ya están vinculados'}</option>
                {disponibles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              {productoElegido && (
                <p className="mt-1 text-xs text-slate-500">
                  Precio de compra actual: <strong>{bs(productoElegido.precio_compra_actual)}</strong>
                  {productoElegido.unidad_medida ? ` / ${productoElegido.unidad_medida}` : ''}
                </p>
              )}
            </div>
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              maxLength={100}
              placeholder="Código del proveedor"
              className={`${inputCls} md:col-span-3`}
              aria-label="Código de ítem del proveedor"
            />
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={precio}
              onChange={(e) => setPrecio(e.target.value)}
              placeholder="Precio pactado"
              className={`${inputCls} md:col-span-2`}
              aria-label="Precio pactado"
            />
            <button
              type="submit"
              disabled={guardando || !disponibles.length}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8cd600] px-4 py-3 text-sm font-semibold text-gray-900 transition hover:bg-[#73b800] disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2"
            >
              {guardando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />}
              Agregar
            </button>
          </div>
          {errorAlta && <p className="mt-2 text-sm text-red-600">{errorAlta}</p>}
        </form>
      ) : (
        <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Proveedor desactivado: reactívelo para vincular nuevos productos.
        </div>
      )}

      {/* ---------------- Lista ---------------- */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-900">
          Productos que provee <span className="font-normal text-slate-400">({vinculos.length})</span>
        </p>
        {vinculos.length > 4 && (
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por producto o código"
            className={`${inputSm} sm:max-w-xs`}
          />
        )}
      </div>

      {cargando ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-[#f8fafc]" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error}{' '}
          <button onClick={cargar} className="font-semibold underline">
            Reintentar
          </button>
        </div>
      ) : vinculos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-slate-500">
          Este proveedor aún no tiene productos vinculados.
        </div>
      ) : (
        <>
          {/* Tabla (md+) */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-100 md:block">
            <table className="w-full text-sm">
              <thead className="bg-[#f8fafc] text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  <th className="px-4 py-3">Código proveedor</th>
                  <th className="px-4 py-3 text-right">Precio pactado</th>
                  <th className="px-4 py-3">Actualizado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibles.map((v) => {
                  const editando = editandoId === v.id;
                  return (
                    <tr key={v.id} className={editando ? 'bg-[#8cd600]/5' : 'hover:bg-[#f8fafc]/70'}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{v.producto_nombre}</p>
                        <p className="text-xs text-slate-400">
                          Actual {bs(v.precio_compra_actual)}
                          {v.unidad_medida ? ` / ${v.unidad_medida}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {editando ? (
                          <input
                            value={edicion.codigo}
                            onChange={(e) => setEdicion((s) => ({ ...s, codigo: e.target.value }))}
                            maxLength={100}
                            className={inputSm}
                          />
                        ) : v.codigo_item_proveedor ? (
                          <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{v.codigo_item_proveedor}</span>
                        ) : (
                          <span className="text-xs text-slate-400">Sin código</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editando ? (
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={edicion.precio}
                            onChange={(e) => setEdicion((s) => ({ ...s, precio: e.target.value }))}
                            onKeyDown={(e) => e.key === 'Enter' && guardarEdicion(v)}
                            className={`${inputSm} text-right`}
                          />
                        ) : (
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-slate-900">{bs(v.precio_compra)}</span>
                            <Variacion pactado={v.precio_compra} actual={v.precio_compra_actual} />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fecha(v.fecha_actualizacion)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {editando ? (
                            <>
                              <button
                                onClick={() => guardarEdicion(v)}
                                disabled={guardandoEdicion}
                                className="rounded-lg bg-[#8cd600] px-3 py-1.5 text-xs font-semibold text-gray-900 hover:bg-[#73b800] disabled:opacity-50"
                              >
                                {guardandoEdicion ? '…' : 'Guardar'}
                              </button>
                              <button onClick={() => setEditandoId(null)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => abrirComparativo(v)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                                Comparar
                              </button>
                              <button onClick={() => iniciarEdicion(v)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                                Editar
                              </button>
                              <button
                                onClick={() => quitar(v)}
                                disabled={eliminandoId === v.id}
                                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                {eliminandoId === v.id ? '…' : 'Quitar'}
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Tarjetas (móvil) */}
          <ul className="space-y-2 md:hidden">
            {visibles.map((v) => {
              const editando = editandoId === v.id;
              return (
                <li key={v.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{v.producto_nombre}</p>
                      <p className="text-xs text-slate-400">
                        {v.codigo_item_proveedor ? `Cód. ${v.codigo_item_proveedor}` : 'Sin código'} · {fecha(v.fecha_actualizacion)}
                      </p>
                    </div>
                    {!editando && (
                      <div className="flex flex-col items-end">
                        <span className="font-semibold text-slate-900">{bs(v.precio_compra)}</span>
                        <Variacion pactado={v.precio_compra} actual={v.precio_compra_actual} />
                      </div>
                    )}
                  </div>

                  {editando ? (
                    <div className="mt-3 space-y-2">
                      <input
                        value={edicion.codigo}
                        onChange={(e) => setEdicion((s) => ({ ...s, codigo: e.target.value }))}
                        placeholder="Código del proveedor"
                        className={inputSm}
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={edicion.precio}
                        onChange={(e) => setEdicion((s) => ({ ...s, precio: e.target.value }))}
                        placeholder="Precio pactado"
                        className={inputSm}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => guardarEdicion(v)}
                          disabled={guardandoEdicion}
                          className="flex-1 rounded-lg bg-[#8cd600] py-2 text-sm font-semibold text-gray-900 hover:bg-[#73b800] disabled:opacity-50"
                        >
                          {guardandoEdicion ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button onClick={() => setEditandoId(null)} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium text-slate-600">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button onClick={() => abrirComparativo(v)} className="rounded-lg bg-[#f8fafc] py-2 text-xs font-medium text-slate-600">
                        Comparar
                      </button>
                      <button onClick={() => iniciarEdicion(v)} className="rounded-lg bg-[#f8fafc] py-2 text-xs font-medium text-slate-600">
                        Editar
                      </button>
                      <button
                        onClick={() => quitar(v)}
                        disabled={eliminandoId === v.id}
                        className="rounded-lg bg-red-50 py-2 text-xs font-medium text-red-600 disabled:opacity-50"
                      >
                        Quitar
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {/* ---------------- Modal comparativo ---------------- */}
      {comparando && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 backdrop-blur-sm sm:items-center sm:p-4"
          onMouseDown={(e) => e.target === e.currentTarget && setComparando(null)}
        >
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl sm:max-w-md sm:rounded-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Comparativo de precios</p>
                <h3 className="text-lg font-bold text-slate-900">{comparando.nombre}</h3>
              </div>
              <button onClick={() => setComparando(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Cerrar">
                ✕
              </button>
            </div>
            {!comparando.lista ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-[#f8fafc]" />
                ))}
              </div>
            ) : (
              <ol className="space-y-2">
                {comparando.lista.map((c, i) => {
                  const mejor = i === 0 && comparando.lista!.length > 1;
                  const actual = c.proveedor_id === proveedorId;
                  return (
                    <li
                      key={c.proveedor_id}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                        mejor ? 'border-[#8cd600] bg-[#8cd600]/10' : 'border-gray-100'
                      } ${c.activo ? '' : 'opacity-60'}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {c.razon_social}
                          {actual && <span className="ml-1 text-xs font-normal text-slate-500">(este)</span>}
                        </p>
                        <p className="text-xs text-slate-500">
                          {c.codigo_item_proveedor ?? 'Sin código'} · {fecha(c.fecha_actualizacion)}
                          {!c.activo && ' · inactivo'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-900">{bs(c.precio_compra)}</p>
                        {mejor && <p className="text-[11px] font-semibold text-[#3f6b00]">Mejor precio</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
