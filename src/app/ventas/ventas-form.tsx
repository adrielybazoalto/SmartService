'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { descargarNotaVenta, registrarVenta } from '@/app/actions/ventas';
import type {
  ClienteVenta,
  ComprobanteVenta,
  ProductoVenta,
  TipoComprobante,
  TipoPago,
} from '@/backend/ventas';

/**
 * Paso 8: obtiene la nota de venta (PDF en base64) y la abre en otra pestaña.
 * La pestaña se abre antes de esperar al servidor para que el navegador no
 * la bloquee; si aun así se bloquea, el PDF se descarga como archivo.
 */
export async function abrirNotaVentaPdf(ventaId: number): Promise<string | null> {
  const pestana = window.open('', '_blank');
  const res = await descargarNotaVenta(ventaId);
  if (!res.ok) {
    pestana?.close();
    return res.error;
  }
  const binario = atob(res.data.base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  if (pestana) {
    pestana.location.href = url;
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = res.data.nombreArchivo;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return null;
}

type Props = {
  productos: ProductoVenta[];
  clientes: ClienteVenta[];
  clienteMostradorId: number | null;
  cajaAbierta: boolean;
  notificar: (tipo: 'ok' | 'error', texto: string) => void;
  onVentaRegistrada: () => void;
};

/** Ítem vendible: producto del inventario (CU16) con su stock */
type Opcion = {
  id: number;
  nombre: string;
  precio: number;
  stock: number;
  stockMinimo: number;
  unidad: string;
  imagen: string | null;
};

type Linea = Opcion & { key: string; cantidad: number };

const bs = (n: number) =>
  `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtCant = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

/** Métodos de pago habilitados: efectivo y QR */
const PAGOS: { valor: TipoPago; etiqueta: string }[] = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'QR', etiqueta: 'QR' },
];

/**
 * Imagen opcional del QR de cobro del negocio (el que entrega el banco).
 * Si existe public/qr-cobro.png se muestra esa; si no, se genera un QR con el monto.
 */
const QR_COBRO_NEGOCIO = '/qr-cobro.png';

const COMPROBANTES: { valor: TipoComprobante; etiqueta: string }[] = [
  { valor: 'NOTA_VENTA', etiqueta: 'Nota de venta' },
  { valor: 'RECIBO', etiqueta: 'Recibo' },
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
  // Cliente por defecto: "Cliente de mostrador"; si no existe, el primero de la lista.
  // Así el cliente que se ve seleccionado es siempre el que se envía.
  const clientePorDefecto = clienteMostradorId ?? clientes[0]?.id ?? null;
  const [clienteId, setClienteId] = useState<number | null>(clientePorDefecto);
  // Si la lista de clientes llega después de montar el formulario
  useEffect(() => {
    if (clienteId === null && clientePorDefecto !== null) setClienteId(clientePorDefecto);
  }, [clienteId, clientePorDefecto]);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [tipoPago, setTipoPago] = useState<TipoPago>('EFECTIVO');
  const [pagoQrConfirmado, setPagoQrConfirmado] = useState(false);
  const [tipoComprobante, setTipoComprobante] = useState<TipoComprobante>('NOTA_VENTA');
  const [descuento, setDescuento] = useState('');
  const [efectivoRecibido, setEfectivoRecibido] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ultimaVenta, setUltimaVenta] = useState<ComprobanteVenta | null>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);

  // ---- Catálogo de productos (paso 3) -----------------------------------------
  const opciones = useMemo<Opcion[]>(
    () =>
      productos.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        precio: p.precio_venta,
        stock: p.stock_disponible,
        stockMinimo: p.stock_minimo,
        unidad: p.unidad_medida ?? 'UND',
        imagen: p.imagen_url,
      })),
    [productos]
  );

  // Sin texto: muestra el catálogo; con texto: busca por nombre o código
  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return opciones
      .filter((o) => !q || o.nombre.toLowerCase().includes(q) || String(o.id) === q)
      .slice(0, q ? 15 : 30);
  }, [busqueda, opciones]);

  const clientesFiltrados = useMemo(() => {
    const q = busquedaCliente.trim().toLowerCase();
    const base = q
      ? clientes.filter(
          (c) => c.razon_social.toLowerCase().includes(q) || (c.documento_identidad ?? '').toLowerCase().includes(q)
        )
      : clientes;
    return base.slice(0, 50);
  }, [busquedaCliente, clientes]);

  // ---- Totales (vista previa; el cálculo oficial lo hace la BD) -------------
  const subtotal = useMemo(() => r2(lineas.reduce((acc, l) => acc + r2(l.precio * l.cantidad), 0)), [lineas]);
  const descuentoNum = Math.max(0, Number(descuento) || 0);
  const total = r2(Math.max(0, subtotal - descuentoNum));
  const cambio = tipoPago === 'EFECTIVO' && efectivoRecibido ? r2(Number(efectivoRecibido) - total) : null;
  const descuentoInvalido = descuentoNum > subtotal;
  // Si cambia el monto, el pago por QR debe confirmarse de nuevo
  useEffect(() => {
    setPagoQrConfirmado(false);
  }, [total]);
  const hayExcesoStock = lineas.some((l) => l.cantidad > l.stock);

  // ---- Manejo del carrito ---------------------------------------------------
  const agregar = (o: Opcion) => {
    setError(null);
    if (o.stock <= 0) {
      setError(`"${o.nombre}" no tiene stock disponible`);
      return;
    }
    const key = `P-${o.id}`;
    setLineas((prev) => {
      const existe = prev.find((l) => l.key === key);
      if (existe) {
        return prev.map((l) =>
          l.key === key ? { ...l, cantidad: Math.min(l.cantidad + 1, o.stock) } : l
        );
      }
      return [...prev, { ...o, key, cantidad: 1 }];
    });
    setBusqueda('');
    setMostrarResultados(false);
    buscadorRef.current?.focus();
  };

  /** Cantidades con hasta 2 decimales (p. ej. metros de cable) */
  const cambiarCantidad = (key: string, valor: number) => {
    if (!Number.isFinite(valor)) return;
    setLineas((prev) => prev.map((l) => (l.key === key ? { ...l, cantidad: Math.max(0.01, r2(valor)) } : l)));
  };

  const quitar = (key: string) => setLineas((prev) => prev.filter((l) => l.key !== key));

  const limpiar = () => {
    setLineas([]);
    setDescuento('');
    setEfectivoRecibido('');
    setClienteId(clientePorDefecto);
    setBusquedaCliente('');
    setTipoPago('EFECTIVO');
    setPagoQrConfirmado(false);
    setTipoComprobante('NOTA_VENTA');
    setError(null);
  };

  // ---- Envío ----------------------------------------------------------------
  const confirmar = async () => {
    setError(null);
    if (!cajaAbierta) return setError('Debe abrir un turno de caja antes de vender');
    if (lineas.length === 0) return setError('Agregue al menos un producto');
    if (!clienteId) return setError('Seleccione un cliente');
    if (descuentoInvalido) return setError('El descuento no puede ser mayor al subtotal');
    if (hayExcesoStock) return setError('Hay productos con cantidad mayor al stock disponible');
    if (cambio !== null && cambio < 0) return setError('El efectivo recibido es menor al total');
    if (tipoPago === 'QR' && !pagoQrConfirmado) return setError('Confirme que recibió el pago por QR');

    setGuardando(true);
    const res = await registrarVenta({
      clienteId,
      tipoPago,
      tipoComprobante,
      descuento: descuentoNum,
      items: lineas.map((l) => ({ productoId: l.id, cantidad: l.cantidad })),
    });
    setGuardando(false);

    if (!res.ok) {
      setError(res.error);
      notificar('error', res.error);
      return;
    }
    setUltimaVenta(res.data);
    notificar('ok', res.mensaje);
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

      {/* Comprobante de la última venta + nota en PDF (paso 8) */}
      {ultimaVenta && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-[#8cd600]/40 bg-[#8cd600]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Venta registrada · <span className="font-mono">{ultimaVenta.nroComprobante}</span>
            </p>
            <p className="text-xs text-slate-600">
              Subtotal {bs(ultimaVenta.subtotal)} · Descuento {bs(ultimaVenta.descuento)} · Total{' '}
              <strong>{bs(ultimaVenta.total)}</strong>
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                const error = await abrirNotaVentaPdf(ultimaVenta.ventaId);
                if (error) notificar('error', error);
              }}
              className="rounded-lg bg-[#8cd600] px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-[#73b800]"
            >
              Nota de venta (PDF)
            </button>
            <button onClick={() => setUltimaVenta(null)} className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-white/60">
              Cerrar
            </button>
          </div>
        </div>
      )}

      <fieldset disabled={deshabilitado} className="space-y-5">
        {/* Buscador de productos */}
        <div className="relative">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label className="text-sm font-medium text-slate-700">Producto</label>
          </div>
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
            placeholder={cajaAbierta ? 'Haga clic para ver el catálogo o escriba para buscar…' : 'Abra la caja para vender'}
            className={inputCls}
          />
          {mostrarResultados && resultados.length > 0 && (
            <ul className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
              {resultados.map((o) => {
                const agotado = o.stock <= 0;
                const critico = o.stock <= o.stockMinimo;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => agregar(o)}
                      disabled={agotado}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Miniatura url={o.imagen} nombre={o.nombre} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{o.nombre}</p>
                        <p className={`text-xs ${agotado ? 'text-red-600' : critico ? 'text-amber-600' : 'text-slate-500'}`}>
                          Stock: {fmtCant(o.stock)} {o.unidad}
                          {agotado ? ' · Agotado' : critico ? ' · Crítico' : ''}
                        </p>
                      </div>
                      <span className="whitespace-nowrap text-sm font-semibold text-slate-900">
                        {bs(o.precio)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {opciones.length === 0 && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No se cargó ningún producto. Revise que existan en la base de datos y que el
              servidor use la clave service_role de Supabase.
            </p>
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
            <div className="hidden grid-cols-12 gap-3 bg-[#f8fafc] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:grid">
              <span className="col-span-5">Ítem</span>
              <span className="col-span-2 text-right">P. unit.</span>
              <span className="col-span-2 text-center">Cant.</span>
              <span className="col-span-2 text-right">Subtotal</span>
              <span className="col-span-1" />
            </div>
            <ul className="divide-y divide-gray-100">
              {lineas.map((l) => {
                const excede = l.cantidad > l.stock;
                const paso = 1;
                return (
                  <li key={l.key} className="grid grid-cols-12 items-center gap-3 px-4 py-3">
                    <div className="col-span-12 flex min-w-0 items-center gap-3 sm:col-span-5">
                      <Miniatura url={l.imagen} nombre={l.nombre} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{l.nombre}</p>
                        <p className={`text-xs ${excede ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                          Disponible: {fmtCant(l.stock)} {l.unidad}
                          {excede && ' · excede el stock'}
                        </p>
                      </div>
                    </div>
                    <span className="col-span-4 text-sm text-slate-600 sm:col-span-2 sm:text-right">{bs(l.precio)}</span>
                    <div className="col-span-4 flex items-center justify-center sm:col-span-2">
                      <div className="flex items-center rounded-lg border border-gray-200 bg-[#f8fafc]">
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(l.key, l.cantidad - paso)}
                          className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900"
                          aria-label="Disminuir"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0.01}
                          step="any"
                          inputMode="decimal"
                          value={l.cantidad}
                          onChange={(e) => cambiarCantidad(l.key, Number(e.target.value))}
                          className="w-14 bg-transparent text-center text-sm font-semibold text-slate-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                          aria-label={`Cantidad de ${l.nombre}`}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            cambiarCantidad(l.key, l.stock === null ? l.cantidad + paso : Math.min(l.cantidad + paso, l.stock))
                          }
                          className="px-2.5 py-1.5 text-slate-600 hover:text-slate-900"
                          aria-label="Aumentar"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <span className="col-span-3 text-right text-sm font-semibold text-slate-900 sm:col-span-2">
                      {bs(r2(l.precio * l.cantidad))}
                    </span>
                    <div className="col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => quitar(l.key)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        aria-label={`Quitar ${l.nombre}`}
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
              {clienteId === null && <option value="">Seleccione un cliente</option>}
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
            {clientes.length === 0 ? (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                No se cargó ningún cliente de la base de datos. Ejecute diagnostico_cu09.sql.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">{clientes.length} cliente(s) registrados</p>
            )}
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
          <div className="grid grid-cols-2 gap-2">
            {PAGOS.map((p) => (
              <button
                key={p.valor}
                type="button"
                onClick={() => {
                  setTipoPago(p.valor);
                  setPagoQrConfirmado(false);
                }}
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
        {/* Cobro por QR */}
        {tipoPago === 'QR' && lineas.length > 0 && !descuentoInvalido && (
          <PanelQr total={total} confirmado={pagoQrConfirmado} onConfirmar={setPagoQrConfirmado} />
        )}
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
        disabled={
          deshabilitado || lineas.length === 0 || descuentoInvalido || hayExcesoStock || (tipoPago === 'QR' && !pagoQrConfirmado)
        }
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#8cd600] px-5 py-3.5 text-base font-semibold text-gray-900 shadow-sm transition hover:bg-[#73b800] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {guardando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-900 border-t-transparent" />}
        {guardando ? 'Registrando…' : `Confirmar venta · ${bs(total)}`}
      </button>
    </div>
  );
}

/**
 * Cobro por QR: muestra el QR y el monto a pagar. El cajero confirma cuando
 * ve el pago acreditado en la app del banco; recién entonces se registra la venta.
 */
function PanelQr({
  total,
  confirmado,
  onConfirmar,
}: {
  total: number;
  confirmado: boolean;
  onConfirmar: (v: boolean) => void;
}) {
  const [usarImagenNegocio, setUsarImagenNegocio] = useState(true);
  const [qrGenerado, setQrGenerado] = useState<string | null>(null);
  const monto = total.toFixed(2);

  // QR con los datos del cobro (se usa si no existe public/qr-cobro.png)
  useEffect(() => {
    if (usarImagenNegocio) return;
    let vigente = true;
    const contenido = `SmartService | Cobro por QR | Monto: Bs ${monto} | ${new Date().toLocaleString('es-BO')}`;
    import('qrcode')
      .then((m) => ((m as any).default ?? m).toDataURL(contenido, { width: 260, margin: 1 }) as Promise<string>)
      .then((url) => vigente && setQrGenerado(url))
      .catch(() => vigente && setQrGenerado(null));
    return () => {
      vigente = false;
    };
  }, [usarImagenNegocio, monto]);

  return (
    <div className="rounded-xl border border-[#8cd600]/50 bg-[#8cd600]/5 p-4">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <div className="flex h-44 w-44 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white p-2">
          {usarImagenNegocio ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={QR_COBRO_NEGOCIO}
              alt="QR de cobro del negocio"
              className="h-full w-full object-contain"
              onError={() => setUsarImagenNegocio(false)}
            />
          ) : qrGenerado ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrGenerado} alt={`QR de cobro por Bs ${monto}`} className="h-full w-full object-contain" />
          ) : (
            <span className="text-center text-xs text-slate-400">Generando QR…</span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-sm font-medium text-slate-600">Monto a pagar por QR</p>
          <p className="text-3xl font-bold text-slate-900">{bs(total)}</p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-left text-xs text-slate-500">
            <li>El cliente escanea el QR con la app de su banco.</li>
            <li>Paga exactamente {bs(total)}.</li>
            <li>Verifique el pago acreditado en la app del negocio y confírmelo aquí.</li>
          </ol>
          <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={confirmado}
              onChange={(e) => onConfirmar(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#8cd600]"
            />
            <span>
              Confirmo que recibí el pago por QR de <strong>{bs(total)}</strong>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

/** Imagen principal del producto (o sus iniciales si no tiene) */
function Miniatura({ url, nombre }: { url: string | null; nombre: string }) {
  const [fallo, setFallo] = useState(false);
  if (!url || fallo) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
        {nombre.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={nombre}
      loading="lazy"
      onError={() => setFallo(true)}
      className="h-10 w-10 shrink-0 rounded-lg border border-gray-100 bg-white object-cover"
    />
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
