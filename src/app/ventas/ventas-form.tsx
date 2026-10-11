'use client';

import { useMemo, useRef, useState } from 'react';
import {
  registrarVenta,
  type ClienteVenta,
  type ProductoVenta,
  type TipoComprobante,
  type TipoPago,
  type VentaRegistrada,
} from '@/app/actions/ventas';

type Props = {
  productos: ProductoVenta[];
  clientes: ClienteVenta[];
  clienteMostradorId: number | null;
  cajaAbierta: boolean;
  notificar: (tipo: 'ok' | 'error', texto: string) => void;
  onVentaRegistrada: () => void;
};

type Linea = { producto: ProductoVenta; cantidad: number };

const bs = (n: number) =>
  `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;

const PAGOS: { valor: TipoPago; etiqueta: string }[] = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'QR', etiqueta: 'QR' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transf.' },
];

const COMPROBANTES: { valor: TipoComprobante; etiqueta: string }[] = [
  { valor: 'NOTA_VENTA', etiqueta: 'Nota de venta' },
  { valor: 'RECIBO', etiqueta: 'Recibo' },
  { valor: 'FACTURA', etiqueta: 'Factura' },
];

const inputCls =
  'w-full bg-[#f8fafc] border border-gray-200 rounded-xl px-4 py-3 text-gray-800 placeholder:text-slate-400 focus:ring-2 focus:ring-[#8cd600] focus:outline-none disabled:opacity-60';

export default function VentasForm({
  productos,
  clientes,
  clienteMostradorId,
  cajaAbierta,
  notificar,
  onVentaRegistrada,
}: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [mostrarResultados, setMostrarResultados] = useState(false);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(clienteMostradorId);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [tipoPago, setTipoPago] = useState<TipoPago>('EFECTIVO');
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>('NOTA_VENTA');
  const [descuento, setDescuento] = useState('');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<VentaRegistrada | null>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);

  // ---- Búsqueda de productos ----------------------------------------------
  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return productos.filter((p) => p.nombre.toLowerCase().includes(q) || String(p.id) === q).slice(0, 8);
  }, [busqueda, productos]);

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    const base = q
      ? clientes.filter(
          (c) => c.razon_social.toLowerCase().includes(q) || (c.documento_identidad ?? '').toLowerCase().includes(q)
        )
      : clientes;
    return base.slice(0, 50);
  }, [busquedaCliente, clientes]);

  // ---- Totales --------------------------------------------------------------
  const subtotal = useMemo(
    () => r2(lineas.reduce((acc, l) => acc + r2(l.producto.precio_venta * l.cantidad), 0)),
    [lineas]
  );
  const descuentoNum = Math.max(0, Number(descuento) || 0);
  const total = r2(Math.max(0, subtotal - descuentoNum));
  const cambio = tipoPago === 'EFECTIVO' && efectivoRecibido ? r2(Number(efectivoRecibido) - total) : null;
  const descuentoInvalido = descuentoNum > subtotal;
  const hayExcesoStock = lineas.some((l) => l.cantidad > l.producto.stock_disponible);

  // ---- Manejo del carrito ---------------------------------------------------
  const agregar = (p: ProductoVenta) => {
    setError(null);
    if (p.stock_disponible <= 0) {
      setError(`"${p.nombre}" no tiene stock disponible`);
      return;
    }
    setLineas((prev) => {
      const existe = prev.find((l) => l.producto.id === p.id);
      if (existe) {
        return prev.map((l) =>
          l.producto.id === p.id ? { ...l, cantidad: Math.min(l.cantidad + 1, p.stock_disponible) } : l
        );
      }
      return [...prev, { producto: p, cantidad: 1 }];
    });
    setBusqueda('');
    setMostrarResultados(false);
    buscadorRef.current?.focus();
  };

  const cambiarCantidad = (id: number, valor: number) => {
    setLineas((prev) =>
      prev.map((l) => (l.producto.id === id ? { ...l, cantidad: Math.max(1, Math.floor(valor) || 1) } : l))
    );
  };

  const quitar = (id: number) => setLineas((prev) => prev.filter((l) => l.producto.id !== id));

  const limpiar = () => {
    setLineas([]);
    setDescuento('');
    setEfectivoRecibido('');
    setClienteId(clienteMostradorId);
    setBusquedaCliente('');
    setTipoPago('EFECTIVO');
    setTipoComprobante('NOTA_VENTA');
    setError(null);
  };

  // ---- Envío ----------------------------------------------------------------
  const confirmar = async () => {
    setError(null);
    if (!cajaAbierta) return setError('Debe abrir un turno de caja antes de vender');
    if (lineas.length === 0) return setError('Agregue al menos un producto');
    if (descuentoInvalido) return setError('El descuento no puede ser mayor al subtotal');
    if (hayExcesoStock) return setError('Hay productos con cantidad mayor al stock disponible');
    if (cambio !== null && cambio < 0) return setError('El efectivo recibido es menor al total');

    setGuardando(true);
    const res = await registrarVenta({
      cliente_id: clienteId,
      tipo_pago: tipoPago,
      tipo_comprobante: tipoComprobante,
      descuento: descuentoNum,
      items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
    });
    setGuardando(false);

    if (!res.ok) {
      setError(res.error);
      notificar('error', res.error);
      return;
    }
    setUltimaVenta(res.data);
    notificar('ok', res.mensaje ?? `Venta ${res.data.nro_comprobante} registrada`);
    limpiar();
    onVentaRegistrada();
  };

  const deshabilitado = !cajaAbierta || guardando;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Nueva venta</h2>
        {lineas.length > 0 && (
          <button onClick={limpiar} disabled={guardando} className="text-sm font-medium text-slate-500 hover:text-slate-800">
            Vaciar
          </button>
        )}
      </div>

      {/* Comprobante de la última venta */}
      {ultimaVenta && (
        <div className="mb-5 flex flex-col gap-2 rounded-xl border border-[#8cd600]/40 bg-[#8cd600]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Venta registrada · <span className="font-mono">{ultimaVenta.nro_comprobante}</span>
            </p>
            <p className="text-xs text-slate-600">
              Subtotal {bs(ultimaVenta.subtotal)} · Descuento {bs(ultimaVenta.descuento)} · Total{' '}
              <strong>{bs(ultimaVenta.total)}</strong>
            </p>
          </div>
          <button onClick={() => setUltimaVenta(null)} className="self-start text-xs font-medium text-slate-600 hover:text-slate-900 sm:self-auto">
            Cerrar
          </button>
        </div>
      )}

      <fieldset disabled={deshabilitado} className="space-y-5">
        {/* Buscador de productos */}
        <div className="relative">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Producto</label>
          <input
            ref={buscadorRef}
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value);
              setMostrarResultados(true);
            }}
            onFocus={() => setMostrarResultados(true)}
            onBlur={() => setTimeout(() => setMostrarResultados(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && resultados[0]) {
                e.preventDefault();
                agregar(resultados[0]);
              }
            }}
            placeholder={cajaAbierta ? 'Buscar por nombre o código…' : 'Abra la caja para vender'}
            className={inputCls}
          />
          {mostrarResultados && resultados.length > 0 && (
            <ul className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
              {resultados.map((p) => {
                const critico = p.stock_disponible <= p.stock_minimo;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => agregar(p)}
                      disabled={p.stock_disponible <= 0}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{p.nombre}</p>
                        <p className={`text-xs ${p.stock_disponible <= 0 ? 'text-red-600' : critico ? 'text-amber-600' : 'text-slate-500'}`}>
                          Stock: {p.stock_disponible} {p.unidad_medida ?? ''}
                          {p.stock_disponible <= 0 ? ' · Agotado' : critico ? ' · Crítico' : ''}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-sm font-semibold text-slate-900">{bs(p.precio_venta)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {mostrarResultados && busqueda.trim() && resultados.length === 0 && (
            <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-100 bg-white p-4 text-sm text-slate-500 shadow-lg">
              Sin coincidencias para “{busqueda}”.
            </div>
          )}
        </div>

        {/* Carrito */}
        {lineas.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-[#f8fafc] p-8 text-center text-sm text-slate-500">
            Busque y agregue productos a la venta.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-100">
            {/* Cabecera solo en sm+ */}
            <div className="hidden grid-cols-12 gap-3 bg-[#f8fafc] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:grid">
              <span className="col-span-5">Producto</span>
              <span className="col-span-2 text-right">P. unit.</span>
              <span className="col-span-2 text-center">Cant.</span>
              <span className="col-span-2 text-right">Subtotal</span>
              <span className="col-span-1" />
            </div>
            <ul className="divide-y divide-gray-100">
              {lineas.map((l) => {
                const excede = l.cantidad > l.producto.stock_disponible;
                return (
                  <li key={l.producto.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                    <div className="col-span-12 min-w-0 sm:col-span-5">
                      <p className="truncate text-sm font-medium text-slate-900">{l.producto.nombre}</p>
                      <p className={`text-xs ${excede ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                        Disponible: {l.producto.stock_disponible}
                        {excede && ' · excede el stock'}
                      </p>
                    </div>
                    <span className="col-span-4 text-sm text-slate-600 sm:col-span-2 sm:text-right">
                      {bs(l.producto.precio_venta)}
                    </span>
                    <div className="col-span-4 flex items-center justify-center sm:col-span-2">
                      <div className="flex items-center rounded-lg border border-gray-200 bg-[#f8fafc]">
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(l.producto.id, l.cantidad - 1)}
                          className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900"
                          aria-label="Disminuir"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={l.producto.stock_disponible}
                          value={l.cantidad}
                          onChange={(e) => cambiarCantidad(l.producto.id, Number(e.target.value))}
                          className="w-12 bg-transparent text-center text-sm font-semibold text-slate-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        />
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(l.producto.id, Math.min(l.cantidad + 1, l.producto.stock_disponible))}
                          className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900"
                          aria-label="Aumentar"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <span className="col-span-3 text-right text-sm font-semibold text-slate-900 sm:col-span-2">
                      {bs(r2(l.producto.precio_venta * l.cantidad))}
                    </span>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => quitar(l.producto.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Quitar ${l.producto.nombre}`}
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

        {/* Cliente y comprobante */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Cliente</label>
            <input
              value={busquedaCliente}
              onChange={(e) => setBusquedaCliente(e.target.value)}
              placeholder="Filtrar por nombre o documento"
              className={`${inputCls} mb-2 py-2 text-sm`}
            />
            <select
              value={clienteId ?? ''}
              onChange={(e) => setClienteId(e.target.value ? Number(e.target.value) : null)}
              className={inputCls}
            >
              {clienteMostradorId && <option value={clienteMostradorId}>Cliente de mostrador</option>}
              {clientesFiltrados
                .filter((c) => c.id !== clienteMostradorId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.razon_social}
                    {c.documento_identidad ? ` — ${c.documento_identidad}` : ''}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Tipo de comprobante</label>
            <select
              value={tipoComprobante}
              onChange={(e) => setTipoComprobante(e.target.value as TipoComprobante)}
              className={inputCls}
            >
              {COMPROBANTES.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Método de pago */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Método de pago</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PAGOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                onClick={() => setTipoPago(p.valor)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  tipoPago === p.valor
                    ? 'border-[#8cd600] bg-[#8cd600] text-gray-900'
                    : 'border-gray-200 bg-[#f8fafc] text-slate-600 hover:border-[#8cd600]/60'
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {/* Descuento / efectivo recibido */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Descuento (Bs)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
              placeholder="0.00"
              className={`${inputCls} ${descuentoInvalido ? 'border-red-300 focus:ring-red-400' : ''}`}
            />
            {descuentoInvalido && <p className="mt-1 text-xs text-red-600">No puede ser mayor al subtotal.</p>}
          </div>
          {tipoPago === 'EFECTIVO' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Efectivo recibido (opcional)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={efectivoRecibido}
                onChange={(e) => setEfectivoRecibido(e.target.value)}
                placeholder="Para calcular el cambio"
                className={inputCls}
              />
            </div>
          )}
        </div>
      </fieldset>

      {/* Totales */}
      <div className="mt-6 space-y-2 rounded-xl bg-[#f8fafc] p-4">
        <Fila etiqueta="Subtotal" valor={bs(subtotal)} />
        <Fila etiqueta="Descuento" valor={`− ${bs(Math.min(descuentoNum, subtotal))}`} />
        <div className="flex items-center justify-between border-t border-gray-200 pt-2">
          <span className="text-base font-semibold text-slate-900">Total</span>
          <span className="text-2xl font-bold text-slate-900">{bs(total)}</span>
        </div>
        {cambio !== null && (
          <Fila
            etiqueta="Cambio"
            valor={cambio >= 0 ? bs(cambio) : `Faltan ${bs(Math.abs(cambio))}`}
            clase={cambio >= 0 ? 'text-[#3f6b00]' : 'text-red-600'}
          />
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={confirmar}
        disabled={deshabilitado || lineas.length === 0 || descuentoInvalido || hayExcesoStock}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#8cd600] px-5 py-3.5 text-base font-semibold text-gray-900 shadow-sm transition hover:bg-[#73b800] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {guardando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />}
        {guardando ? 'Registrando…' : `Confirmar venta · ${bs(total)}`}
      </button>
    </div>
  );
}

function Fila({ etiqueta, valor, clase = 'text-slate-700' }: { etiqueta: string; valor: string; clase?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{etiqueta}</span>
      <span className={`font-medium ${clase}`}>{valor}</span>
    </div>
  );
}
