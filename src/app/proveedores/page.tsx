'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cambiarEstadoProveedor,
  listarProductosCatalogo,
  listarProveedores,
  type ProductoCatalogo,
  type Proveedor,
} from '@/app/actions/proveedores';
import ProveedorForm from './proveedor-form';
import CatalogoTabla from './catalogo-tabla';

type Toast = { tipo: 'ok' | 'error'; texto: string } | null;
type Pestana = 'productos' | 'datos';

const iniciales = (s: string) =>
  s
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [productos, setProductos] = useState<ProductoCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [seleccionadoId, setSeleccionadoId] = useState<number | null>(null);
  const [pestana, setPestana] = useState<Pestana>('productos');
  const [formulario, setFormulario] = useState<{ abierto: boolean; proveedor: Proveedor | null }>({
    abierto: false,
    proveedor: null,
  });
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const detalleRef = useRef<HTMLDivElement>(null);

  const notificar = useCallback((tipo: 'ok' | 'error', texto: string) => setToast({ tipo, texto }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const cargar = useCallback(async () => {
    const [prov, prods] = await Promise.all([
      listarProveedores({ incluirInactivos: true }),
      listarProductosCatalogo(),
    ]);
    if (!prov.ok) setErrorCarga(prov.error);
    else {
      setProveedores(prov.data);
      setErrorCarga(null);
    }
    if (prods.ok) setProductos(prods.data);
    setCargando(false);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Filtrado local (instantáneo); el servidor también admite búsqueda
  const visibles = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    return proveedores
      .filter((p) => incluirInactivos || p.estado !== false)
      .filter(
        (p) =>
          !b ||
          p.razon_social.toLowerCase().includes(b) ||
          p.nit.toLowerCase().includes(b) ||
          (p.contacto ?? '').toLowerCase().includes(b)
      );
  }, [proveedores, busqueda, incluirInactivos]);

  const seleccionado = proveedores.find((p) => p.id === seleccionadoId) ?? null;
  const activos = proveedores.filter((p) => p.estado !== false).length;

  const seleccionar = (id: number) => {
    setSeleccionadoId(id);
    setPestana('productos');
    // En móvil el detalle queda debajo de la lista: lo llevamos a la vista
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setTimeout(() => detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  };

  const alternarEstado = async () => {
    if (!seleccionado) return;
    const activar = seleccionado.estado === false;
    if (!activar && !confirm(`¿Desactivar a "${seleccionado.razon_social}"? No aparecerá en nuevas compras.`)) return;
    setCambiandoEstado(true);
    const res = await cambiarEstadoProveedor(seleccionado.id, activar);
    setCambiandoEstado(false);
    if (!res.ok) return notificar('error', res.error);
    notificar('ok', res.mensaje ?? 'Estado actualizado');
    setProveedores((prev) => prev.map((p) => (p.id === res.data.id ? { ...p, ...res.data, total_productos: p.total_productos } : p)));
  };

  return (
    <main className="min-h-screen bg-[#f4f7f6] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Encabezado */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">CU14 · Abastecimiento</p>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Proveedores y catálogo de mayoristas</h1>
            <p className="mt-1 text-sm text-slate-500">
              Distribuidores, productos que suministran, códigos de ítem y precios pactados.
            </p>
          </div>
          <button
            onClick={() => setFormulario({ abierto: true, proveedor: null })}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#8cd600] px-5 py-3 text-sm font-semibold text-gray-900 shadow-sm transition hover:bg-[#73b800]"
          >
            <span className="text-lg leading-none">+</span> Nuevo proveedor
          </button>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-3 gap-3 sm:gap-4">
          <Kpi titulo="Proveedores activos" valor={cargando ? '—' : String(activos)} />
          <Kpi titulo="Inactivos" valor={cargando ? '—' : String(proveedores.length - activos)} />
          <Kpi titulo="Productos en catálogo" valor={cargando ? '—' : String(productos.length)} />
        </section>

        {errorCarga && !cargando && (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-red-700">
            <p className="font-semibold">No se pudieron cargar los proveedores</p>
            <p className="mt-1 text-sm">{errorCarga}</p>
            <button
              onClick={() => {
                setCargando(true);
                cargar();
              }}
              className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-100"
            >
              Reintentar
            </button>
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-5">
          {/* ------------------------- Lista ------------------------- */}
          <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6 lg:col-span-2">
            <div className="space-y-3">
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por razón social, NIT o contacto"
                className="w-full rounded-xl border border-gray-200 bg-[#f8fafc] px-4 py-3 text-gray-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#8cd600]"
              />
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={incluirInactivos}
                  onChange={(e) => setIncluirInactivos(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 accent-[#8cd600]"
                />
                Mostrar inactivos
              </label>
            </div>

            <div className="mt-4">
              {cargando ? (
                <ul className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <li key={i} className="h-16 animate-pulse rounded-xl bg-[#f8fafc]" />
                  ))}
                </ul>
              ) : visibles.length === 0 ? (
                <div className="rounded-xl bg-[#f8fafc] p-8 text-center text-sm text-slate-500">
                  {busqueda ? 'Sin resultados para la búsqueda.' : 'Aún no hay proveedores registrados.'}
                </div>
              ) : (
                <ul className="max-h-[620px] space-y-2 overflow-y-auto pr-1">
                  {visibles.map((p) => {
                    const activo = p.id === seleccionadoId;
                    const inactivo = p.estado === false;
                    return (
                      <li key={p.id}>
                        <button
                          onClick={() => seleccionar(p.id)}
                          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
                            activo
                              ? 'border-[#8cd600] bg-[#8cd600]/10'
                              : 'border-gray-100 hover:border-[#8cd600]/50 hover:bg-[#f8fafc]'
                          } ${inactivo ? 'opacity-60' : ''}`}
                        >
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${
                              activo ? 'bg-[#8cd600] text-gray-900' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {iniciales(p.razon_social)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-900">{p.razon_social}</span>
                            <span className="block truncate text-xs text-slate-500">
                              NIT {p.nit}
                              {p.contacto ? ` · ${p.contacto}` : ''}
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            {inactivo ? (
                              <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                                Inactivo
                              </span>
                            ) : (
                              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                                {p.total_productos ?? 0} prod.
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* ------------------------- Detalle ------------------------- */}
          <div ref={detalleRef} className="scroll-mt-4 lg:col-span-3">
            {!seleccionado ? (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center shadow-sm">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#8cd600]/15 text-xl">📦</div>
                <p className="font-semibold text-slate-900">Seleccione un proveedor</p>
                <p className="mt-1 max-w-xs text-sm text-slate-500">
                  Verá sus datos y los productos que provee con su código de ítem y precio pactado.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
                {/* Cabecera del proveedor */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-xl font-bold text-slate-900">{seleccionado.razon_social}</h2>
                      {seleccionado.estado === false ? (
                        <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Inactivo</span>
                      ) : (
                        <span className="rounded-full bg-[#8cd600]/20 px-2.5 py-0.5 text-xs font-semibold text-[#3f6b00]">Activo</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">NIT {seleccionado.nit}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFormulario({ abierto: true, proveedor: seleccionado })}
                      className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:flex-none"
                    >
                      Editar
                    </button>
                    <button
                      onClick={alternarEstado}
                      disabled={cambiandoEstado}
                      className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 sm:flex-none ${
                        seleccionado.estado === false
                          ? 'bg-[#8cd600] text-gray-900 hover:bg-[#73b800]'
                          : 'border border-red-200 text-red-600 hover:bg-red-50'
                      }`}
                    >
                      {cambiandoEstado ? '…' : seleccionado.estado === false ? 'Reactivar' : 'Desactivar'}
                    </button>
                  </div>
                </div>

                {/* Pestañas */}
                <div className="mt-5 flex gap-1 rounded-xl bg-[#f8fafc] p-1">
                  {(
                    [
                      ['productos', 'Productos que provee'],
                      ['datos', 'Datos de contacto'],
                    ] as [Pestana, string][]
                  ).map(([k, etiqueta]) => (
                    <button
                      key={k}
                      onClick={() => setPestana(k)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                        pestana === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {etiqueta}
                    </button>
                  ))}
                </div>

                <div className="mt-5">
                  {pestana === 'datos' ? (
                    <dl className="grid gap-4 sm:grid-cols-2">
                      <Dato etiqueta="Persona de contacto" valor={seleccionado.contacto} />
                      <Dato etiqueta="Teléfono" valor={seleccionado.telefono} href={seleccionado.telefono ? `tel:${seleccionado.telefono}` : undefined} />
                      <Dato etiqueta="Correo" valor={seleccionado.correo} href={seleccionado.correo ? `mailto:${seleccionado.correo}` : undefined} />
                      <Dato etiqueta="Dirección" valor={seleccionado.direccion ?? null} />
                    </dl>
                  ) : (
                    <CatalogoTabla
                      key={seleccionado.id}
                      proveedorId={seleccionado.id}
                      proveedorActivo={seleccionado.estado !== false}
                      productos={productos}
                      notificar={notificar}
                      onCambio={(total) =>
                        setProveedores((prev) =>
                          prev.map((p) => (p.id === seleccionado.id ? { ...p, total_productos: total } : p))
                        )
                      }
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Formulario crear/editar */}
      {formulario.abierto && (
        <ProveedorForm
          proveedor={formulario.proveedor}
          onClose={() => setFormulario({ abierto: false, proveedor: null })}
          onGuardado={(prov, esNuevo) => {
            notificar('ok', esNuevo ? 'Proveedor registrado correctamente' : 'Proveedor actualizado');
            setProveedores((prev) => {
              const existe = prev.some((p) => p.id === prov.id);
              const lista = existe
                ? prev.map((p) => (p.id === prov.id ? { ...p, ...prov, total_productos: p.total_productos } : p))
                : [...prev, { ...prov, total_productos: 0 }];
              return lista.sort((a, b) => a.razon_social.localeCompare(b.razon_social));
            });
            setFormulario({ abierto: false, proveedor: null });
            seleccionar(prov.id);
          }}
        />
      )}

      {/* Notificación */}
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

function Kpi({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-medium text-slate-500 sm:text-sm">{titulo}</p>
      <p className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{valor}</p>
    </div>
  );
}

function Dato({ etiqueta, valor, href }: { etiqueta: string; valor: string | null; href?: string }) {
  return (
    <div className="rounded-xl bg-[#f8fafc] p-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{etiqueta}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-900">
        {valor ? (
          href ? (
            <a href={href} className="text-[#3f6b00] underline-offset-2 hover:underline">
              {valor}
            </a>
          ) : (
            valor
          )
        ) : (
          <span className="text-slate-400">No registrado</span>
        )}
      </dd>
    </div>
  );
}
