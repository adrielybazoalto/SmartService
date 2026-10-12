'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cambiarEstadoProveedorAction,
  obtenerProductosAction,
  obtenerListaProveedores,
} from '@/app/actions/proveedores';
import type { ProductoOpcion, Proveedor, ResumenCatalogo } from '@/backend/proveedores';
import ProveedoresForm, { type PestanaProveedor } from '@/app/proveedores/proveedores-form';
type Toast = { tipo: 'ok' | 'error'; texto: string } | null;
type Modal = { proveedor: Proveedor | null; pestana: PestanaProveedor } | null;

const iniciales = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<ProductoOpcion[]>([]);
  const [criterio, setCriterio] = useState('');
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [cambiandoId, setCambiandoId] = useState<number | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const peticion = useRef(0);

  const notificar = useCallback((tipo: 'ok' | 'error', texto: string) => setToast({ tipo, texto }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const cargarProveedores = useCallback(async (texto: string, inactivos: boolean) => {
    const id = ++peticion.current;
    setBuscando(true);
    const res = await obtenerListaProveedores(texto, inactivos);
    if (id !== peticion.current) return;
    setBuscando(false);
    setCargando(false);
    if (res.ok) {
      setProveedores(res.data);
      setErrorCarga(null);
    } else {
      setErrorCarga(res.error);
    }
  }, []);

  useEffect(() => {
    obtenerProductosAction().then((res) => {
      if (res.ok) setProductos(res.data);
      else notificar('error', res.error);
    });
  }, [notificar]);

  useEffect(() => {
    const t = setTimeout(() => cargarProveedores(criterio, incluirInactivos), criterio ? 300 : 0);
    return () => clearTimeout(t);
  }, [criterio, incluirInactivos, cargarProveedores]);

  const recargar = () => cargarProveedores(criterio, incluirInactivos);

  const alternarEstado = async (p: Proveedor) => {
    const activar = !p.estado;
    if (!activar && !confirm(`¿Desactivar a "${p.razon_social}"? No estará disponible para nuevas compras.`)) return;
    setCambiandoId(p.id);
    const res = await cambiarEstadoProveedorAction(p.id, activar);
    setCambiandoId(null);
    if (!res.ok) return notificar('error', res.error);
    notificar('ok', res.mensaje);
    recargar();
  };

  const activos = proveedores.filter((p) => p.estado).length;
  const totalCatalogo = proveedores.reduce((acc, p) => acc + p.total_productos, 0);

  return (
    <main className="min-h-screen bg-[#f4f7f6] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">CU014 · Abastecimiento</p>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Proveedores y catálogo de mayoristas</h1>
            <p className="mt-1 text-sm text-slate-500">
              Registra distribuidores y mantén sus códigos de ítem, precios mayoristas y stock.
            </p>
          </div>
          <button
            onClick={() => setModal({ proveedor: null, pestana: 'datos' })}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8cd600] px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#73b800]"
          >
            <span className="text-lg leading-none">+</span> Nuevo proveedor
          </button>
        </header>

        <section className="grid grid-cols-3 gap-3 sm:gap-4">
          <Kpi titulo={incluirInactivos ? 'Proveedores' : 'Activos'} valor={cargando ? '—' : String(incluirInactivos ? proveedores.length : activos)} />
          <Kpi titulo="Productos internos" valor={productos.length ? String(productos.length) : '—'} />
          <Kpi titulo="Ítems en catálogos" valor={cargando ? '—' : String(totalCatalogo)} acento />
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <input
                value={criterio}
                onChange={(e) => setCriterio(e.target.value)}
                placeholder="Buscar por razón social, NIT o persona de contacto"
                className="w-full rounded-xl border border-gray-200 bg-[#f8fafc] px-4 py-3 pr-10 text-gray-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8cd600]"
                aria-label="Buscar proveedor"
              />
              {buscando && !cargando && (
                <span className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={incluirInactivos}
                onChange={(e) => setIncluirInactivos(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-[#8cd600]"
              />
              Incluir inactivos
            </label>
          </div>

          <div className="mt-5">
            {cargando ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-[#f8fafc]" />
                ))}
              </div>
            ) : errorCarga ? (
              <div className="rounded-xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
                <p className="font-semibold">No se pudieron cargar los proveedores</p>
                <p className="mt-1">{errorCarga}</p>
                <button onClick={recargar} className="mt-3 rounded-lg bg-white px-3 py-1.5 font-medium shadow-sm hover:bg-red-100">
                  Reintentar
                </button>
              </div>
            ) : proveedores.length === 0 ? (
              <div className="rounded-xl bg-[#f8fafc] p-10 text-center">
                <p className="font-semibold text-slate-900">{criterio ? 'Sin resultados' : 'Aún no hay proveedores'}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {criterio ? `Ningún proveedor coincide con “${criterio}”.` : 'Registre el primer distribuidor para armar su catálogo.'}
                </p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-slate-400">
                        <th className="py-3 pr-4">Proveedor</th>
                        <th className="py-3 pr-4">Contacto</th>
                        <th className="py-3 pr-4 text-center">Catálogo</th>
                        <th className="py-3 pr-4">Estado</th>
                        <th className="py-3 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {proveedores.map((p) => (
                        <tr key={p.id} className={`transition hover:bg-[#f8fafc]/70 ${p.estado ? '' : 'opacity-60'}`}>
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                                {iniciales(p.razon_social)}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900">{p.razon_social}</p>
                                <p className="text-xs text-slate-500">NIT {p.nit}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-slate-600">
                            <p>{p.contacto ?? '—'}</p>
                            <p className="text-xs text-slate-400">{[p.telefono, p.correo].filter(Boolean).join(' · ') || 'Sin datos'}</p>
                          </td>
                          <td className="py-3 pr-4 text-center">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                              {p.total_productos}
                            </span>
                          </td>
                          <td className="py-3 pr-4">
                            <EstadoBadge activo={p.estado} />
                          </td>
                          <td className="py-3">
                            <div className="flex justify-end gap-1">
                              <BotonFila onClick={() => setModal({ proveedor: p, pestana: 'catalogo' })} principal>
                                Catálogo
                              </BotonFila>
                              <BotonFila onClick={() => setModal({ proveedor: p, pestana: 'datos' })}>Editar</BotonFila>
                              <BotonFila onClick={() => alternarEstado(p)} peligro={p.estado} cargando={cambiandoId === p.id}>
                                {p.estado ? 'Desactivar' : 'Reactivar'}
                              </BotonFila>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <ul className="space-y-3 md:hidden">
                  {proveedores.map((p) => (
                    <li key={p.id} className={`rounded-xl border border-gray-100 p-4 ${p.estado ? '' : 'opacity-60'}`}>
                      <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-600">
                          {iniciales(p.razon_social)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">{p.razon_social}</p>
                          <p className="text-xs text-slate-500">
                            NIT {p.nit} · {p.total_productos} producto(s)
                          </p>
                          {p.contacto && <p className="mt-1 text-xs text-slate-500">{p.contacto}</p>}
                        </div>
                        <EstadoBadge activo={p.estado} />
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <BotonFila onClick={() => setModal({ proveedor: p, pestana: 'catalogo' })} principal>
                          Catálogo
                        </BotonFila>
                        <BotonFila onClick={() => setModal({ proveedor: p, pestana: 'datos' })}>Editar</BotonFila>
                        <BotonFila onClick={() => alternarEstado(p)} peligro={p.estado} cargando={cambiandoId === p.id}>
                          {p.estado ? 'Desactivar' : 'Reactivar'}
                        </BotonFila>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      </div>

      {modal && (
        <ProveedoresForm
          key={modal.proveedor?.id ?? 'nuevo'}
          proveedor={modal.proveedor}
          pestanaInicial={modal.pestana}
          productos={productos}
          notificar={notificar}
          onClose={() => setModal(null)}
          onProveedorGuardado={() => recargar()}
          onCatalogoActualizado={(resumen: ResumenCatalogo) =>
            setProveedores((prev) =>
              prev.map((p) => (p.id === resumen.proveedorId ? { ...p, total_productos: resumen.catalogo.length } : p))
            )
          }
        />
      )}

      {toast && (
        <div
          role="status"
          className={`fixed bottom-4 left-4 right-4 z-[60] rounded-xl px-4 py-3 text-sm font-medium shadow-lg sm:left-auto sm:max-w-sm ${
            toast.tipo === 'ok' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${toast.tipo === 'ok' ? 'bg-[#8cd600]' : 'bg-white'}`} />
            <span className="flex-1">{toast.texto}</span>
            <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100" aria-label="Cerrar">
              ×
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Kpi({ titulo, valor, acento }: { titulo: string; valor: string; acento?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm sm:p-5 ${acento ? 'border-[#8cd600]/40 bg-[#8cd600]/10' : 'border-gray-100 bg-white'}`}>
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{titulo}</p>
      <p className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{valor}</p>
    </div>
  );
}

function EstadoBadge({ activo }: { activo: boolean }) {
  return activo ? (
    <span className="rounded-full bg-[#8cd600]/20 px-2.5 py-1 text-xs font-semibold text-[#3f6b00]">Activo</span>
  ) : (
    <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">Inactivo</span>
  );
}

function BotonFila({
  onClick,
  principal,
  peligro,
  cargando,
  children,
}: {
  onClick: () => void;
  principal?: boolean;
  peligro?: boolean;
  cargando?: boolean;
  children: string;
}) {
  const estilo = principal
    ? 'bg-[#8cd600] text-gray-900 hover:bg-[#73b800]'
    : peligro
      ? 'text-red-600 hover:bg-red-50'
      : 'text-slate-600 hover:bg-slate-100';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={cargando}
      className={`rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${estilo}`}
    >
      {cargando ? '…' : children}
    </button>
  );
}