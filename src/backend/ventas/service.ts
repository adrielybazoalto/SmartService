/**
 * CU09 — Gestionar Ventas y Arqueo de Caja · Servicio (control "Gestión Ventas y Caja")
 *
 * Cada función recibe `db: Db` como primer parámetro, sin estado global, así
 * se puede usar desde Server Actions, Route Handlers o pruebas.
 *
 * Métodos del diagrama de secuencia / clases:
 *   2.2 verificarCajaAbierta(usuarioId)
 *   1.3 procesarAperturaOArqueo(cajaDTO)
 *   1.5 calcularDiferenciaArqueo(montoSistema, montoReal)
 *   2.1 registrarVentaDirecta(datosVentaDTO)
 *   2.3 calcularTotalesYDescuentos(items, descuento)
 *   2.4 crearVenta(cajaId, clienteId, total, comprobante)
 *   2.5 crearDetalles(ventaId, productoId, cantidad, precio)
 *   2.6 registrarSalidaKardex(productoId, cantidad, 'SALIDA')
 *   2.7 descontarStock(productoId, cantidad)
 *   1.6 guardarEventoCaja(usuarioId, accion, ip)
 *
 * Tablas: caja, venta, detalle_venta, movimiento_kardex, bitacora, producto
 * (y lectura de cliente, porque venta.cliente_id es obligatorio).
 */
import { ZodError, type ZodTypeAny, type z } from 'zod';
import {
  aperturaCajaSchema,
  anularVentaSchema,
  cierreCajaSchema,
  registrarVentaSchema,
} from './schema';
import {
  TIPOS_PAGO,
  type AccionCaja,
  type Caja,
  type CajaDTO,
  type ClienteVenta,
  type ComprobanteVenta,
  type DatosVentaDTO,
  type Db,
  type DetalleVenta,
  type LineaVenta,
  type MovimientoKardex,
  type ProductoVenta,
  type ResultadoCaja,
  type ResumenArqueo,
  type TipoPago,
  type TotalesVenta,
  type Venta,
  type VentaResumen,
} from './types';

// ===========================================================================
// Errores de negocio (mensajes listos para mostrar en la IU)
// ===========================================================================
export class VentaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VentaError';
  }
}

export const MENSAJES = {
  SIN_CAJA: 'Debe abrir un turno de caja antes de vender',
  CAJA_DUPLICADA: 'El usuario ya tiene una caja abierta',
  SIN_CAJA_CIERRE: 'No tiene una caja abierta para cerrar',
  DESCUENTO: 'El descuento no puede ser mayor al subtotal',
  OBS_DIFERENCIA: 'Hay diferencia en el arqueo: registre una observación que la justifique',
  ANULADA: 'La venta ya está anulada',
  TURNO_CERRADO: 'No se puede anular una venta de un turno cerrado',
  OTRO_USUARIO: 'Solo el titular del turno puede anular sus ventas',
} as const;

export const CLIENTE_MOSTRADOR = 'Cliente de mostrador';

// ===========================================================================
// Utilidades internas
// ===========================================================================
type TablaCU09 = 'caja' | 'venta' | 'detalle_venta' | 'movimiento_kardex' | 'bitacora' | 'producto';
type Fila = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** precio de venta = precio_compra_actual × (1 + margen_ganancia / 100) */
export const calcularPrecioVenta = (p: { precio_compra_actual: unknown; margen_ganancia?: unknown }) =>
  r2(num(p.precio_compra_actual) * (1 + num(p.margen_ganancia) / 100));

/** Valida con Zod y convierte el primer error en VentaError */
function validar<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  try {
    return schema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) throw new VentaError(e.issues[0]?.message ?? 'Datos inválidos');
    throw e;
  }
}

/** Traduce errores de PostgreSQL/PostgREST a mensajes de negocio */
function errorBD(error: any, porDefecto: string): VentaError {
  const msg: string = error?.message ?? '';
  if (/ux_caja_usuario_abierta/.test(msg)) return new VentaError(MENSAJES.CAJA_DUPLICADA);
  if (/ux_venta_nro_comprobante/.test(msg)) return new VentaError('Conflicto de correlativo, intente nuevamente');
  return new VentaError(msg || porDefecto);
}

/**
 * Columna aún no migrada: PostgREST responde PGRST204
 * ("Could not find the 'ip' column of 'bitacora' in the schema cache").
 */
function columnaFaltante(error: any): string | null {
  if (!error) return null;
  const msg = String(error.message ?? '');
  if (error.code === 'PGRST204' || /column .* (does not exist|of .* in the schema cache)/i.test(msg)) {
    const m = msg.match(/'([^']+)' column/) ?? msg.match(/column "?([\w.]+)"? (of|does)/i);
    if (m) return m[1].split('.').pop() ?? null;
  }
  return null;
}

/** INSERT tolerante: si una columna nueva todavía no existe, la omite y reintenta */
async function insertar<T>(db: Db, tabla: TablaCU09, fila: Fila, select = '*'): Promise<T> {
  const payload: Fila = { ...fila };
  for (let i = 0; i < 6; i++) {
    const { data, error } = await db.from(tabla).insert(payload as any).select(select).single();
    const col = columnaFaltante(error);
    if (col && col in payload) {
      delete payload[col];
      continue;
    }
    if (error || !data) throw errorBD(error, `No se pudo registrar en ${tabla}`);
    return data as T;
  }
  throw new VentaError(`No se pudo registrar en ${tabla}`);
}

/** UPDATE tolerante con filtros de igualdad */
async function actualizar<T>(db: Db, tabla: TablaCU09, cambios: Fila, filtros: Fila): Promise<T | null> {
  const payload: Fila = { ...cambios };
  for (let i = 0; i < 6; i++) {
    let q = db.from(tabla).update(payload as any);
    for (const [col, val] of Object.entries(filtros)) q = q.eq(col, val as any);
    const { data, error } = await q.select('*').maybeSingle();
    const col = columnaFaltante(error);
    if (col && col in payload) {
      delete payload[col];
      continue;
    }
    if (error) throw errorBD(error, `No se pudo actualizar ${tabla}`);
    return (data as T) ?? null;
  }
  throw new VentaError(`No se pudo actualizar ${tabla}`);
}

/** La función SQL transaccional aún no está instalada */
const rpcNoExiste = (error: any) =>
  !!error &&
  (error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(error.message ?? ''));

function mapCaja(row: any): Caja {
  return {
    id: row.id,
    usuario_id: row.usuario_id,
    fecha_apertura: row.fecha_apertura,
    fecha_cierre: row.fecha_cierre ?? null,
    monto_inicial: num(row.monto_inicial),
    monto_final_sistema: row.monto_final_sistema == null ? null : num(row.monto_final_sistema),
    monto_final_real: row.monto_final_real == null ? null : num(row.monto_final_real),
    monto_diferencia: row.monto_diferencia == null ? null : num(row.monto_diferencia),
    observacion: row.observacion ?? null,
    estado: row.estado,
  };
}

// ===========================================================================
// CAJA
// ===========================================================================

/** 2.2 verificarCajaAbierta(usuarioId) — devuelve el turno abierto o null */
export async function verificarCajaAbierta(db: Db, usuarioId: number): Promise<Caja | null> {
  const { data, error } = await db
    .from('caja')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'ABIERTA')
    .order('fecha_apertura', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw errorBD(error, 'No se pudo verificar la caja');
  return data ? mapCaja(data) : null;
}

/** 1.5 calcularDiferenciaArqueo(montoSistema, montoReal) → + sobrante / − faltante */
export function calcularDiferenciaArqueo(montoSistema: number, montoReal: number): number {
  return r2(num(montoReal) - num(montoSistema));
}

/** Ventas del turno con cliente y cantidad de ítems */
export async function listarVentasCaja(db: Db, cajaId: number): Promise<VentaResumen[]> {
  const { data, error } = await db
    .from('venta')
    .select('*, cliente:cliente_id(razon_social), detalle_venta(id)')
    .eq('caja_id', cajaId)
    .order('id', { ascending: false });
  if (error) throw errorBD(error, 'No se pudieron cargar las ventas');
  return ((data ?? []) as any[]).map((v) => ({
    id: v.id,
    nro_comprobante: v.nro_comprobante ?? null,
    fecha_emision: v.fecha_emision,
    cliente_nombre: v.cliente?.razon_social ?? '—',
    tipo_pago: (TIPOS_PAGO as readonly string[]).includes(v.tipo_pago) ? v.tipo_pago : 'EFECTIVO',
    tipo_comprobante: v.tipo_comprobante ?? null,
    subtotal: num(v.subtotal),
    descuento: num(v.descuento),
    total: num(v.total),
    estado: v.estado ?? 'EMITIDA',
    items: Array.isArray(v.detalle_venta) ? v.detalle_venta.length : 0,
  }));
}

/**
 * Totales del turno por método de pago. Solo el efectivo entra al arqueo
 * físico: efectivo esperado = fondo inicial + ventas en EFECTIVO no anuladas.
 */
export function resumirCaja(caja: Caja, ventas: VentaResumen[]): ResumenArqueo {
  const totales: Record<TipoPago, number> = { EFECTIVO: 0, QR: 0, TARJETA: 0, TRANSFERENCIA: 0 };
  let emitidas = 0;
  let anuladas = 0;
  for (const v of ventas) {
    if (v.estado === 'ANULADA') {
      anuladas++;
      continue;
    }
    emitidas++;
    totales[v.tipo_pago] = r2(totales[v.tipo_pago] + v.total);
  }
  return {
    caja,
    totales_por_pago: totales,
    cantidad_ventas: emitidas,
    cantidad_anuladas: anuladas,
    total_vendido: r2(Object.values(totales).reduce((a, b) => a + b, 0)),
    efectivo_esperado: r2(caja.monto_inicial + totales.EFECTIVO),
  };
}

/** 1.4 mostrarResumenArqueo — resumen del turno abierto del usuario */
export async function obtenerResumenCaja(db: Db, usuarioId: number): Promise<ResumenArqueo | null> {
  const caja = await verificarCajaAbierta(db, usuarioId);
  if (!caja) return null;
  return resumirCaja(caja, await listarVentasCaja(db, caja.id));
}

/**
 * 1.3 procesarAperturaOArqueo(cajaDTO)
 *  - APERTURA: valida el fondo inicial, verifica que no haya otro turno
 *    abierto, crea la caja y registra APERTURA_CAJA.
 *  - ARQUEO: calcula el efectivo esperado (monto sistema), la diferencia con
 *    el conteo físico (monto real), cierra la caja y registra ARQUEO_CAJA.
 */
export async function procesarAperturaOArqueo(db: Db, cajaDTO: CajaDTO): Promise<ResultadoCaja> {
  if (cajaDTO.tipo === 'APERTURA') {
    const { montoInicial } = validar(aperturaCajaSchema, cajaDTO);

    if (await verificarCajaAbierta(db, cajaDTO.usuarioId)) throw new VentaError(MENSAJES.CAJA_DUPLICADA);

    const caja = mapCaja(
      await insertar<any>(db, 'caja', {
        usuario_id: cajaDTO.usuarioId,
        monto_inicial: montoInicial,
        estado: 'ABIERTA',
      })
    );

    await guardarEventoCaja(
      db,
      cajaDTO.usuarioId,
      'APERTURA_CAJA',
      cajaDTO.ip,
      `Apertura de caja #${caja.id} con fondo inicial Bs ${montoInicial.toFixed(2)}`
    );
    return { caja };
  }

  // ---- ARQUEO Y CIERRE ------------------------------------------------------
  const { montoReal, observacion } = validar(cierreCajaSchema, cajaDTO);

  const caja = await verificarCajaAbierta(db, cajaDTO.usuarioId);
  if (!caja) throw new VentaError(MENSAJES.SIN_CAJA_CIERRE);

  const resumen = resumirCaja(caja, await listarVentasCaja(db, caja.id));
  const montoSistema = resumen.efectivo_esperado;
  const diferencia = calcularDiferenciaArqueo(montoSistema, montoReal);
  if (diferencia !== 0 && (observacion ?? '').length < 5) throw new VentaError(MENSAJES.OBS_DIFERENCIA);

  const fila = await actualizar<any>(
    db,
    'caja',
    {
      fecha_cierre: new Date().toISOString(),
      monto_final_sistema: montoSistema,
      monto_final_real: montoReal,
      monto_diferencia: diferencia,
      observacion: observacion ?? null,
      estado: 'CERRADA',
    },
    // Solo cierra si sigue ABIERTA y es del mismo usuario
    { id: caja.id, usuario_id: cajaDTO.usuarioId, estado: 'ABIERTA' }
  );
  if (!fila) throw new VentaError('La caja ya fue cerrada');

  const tipoDif = diferencia === 0 ? 'cuadrada' : diferencia > 0 ? 'sobrante' : 'faltante';
  await guardarEventoCaja(
    db,
    cajaDTO.usuarioId,
    'ARQUEO_CAJA',
    cajaDTO.ip,
    `Cierre de caja #${caja.id}: esperado Bs ${montoSistema.toFixed(2)}, contado Bs ${montoReal.toFixed(2)}, ` +
      `diferencia Bs ${diferencia.toFixed(2)} (${tipoDif}). Ventas: ${resumen.cantidad_ventas}, ` +
      `total Bs ${resumen.total_vendido.toFixed(2)}` +
      (observacion ? `. Obs: ${observacion}` : '')
  );

  return {
    // monto_diferencia/observacion se devuelven aunque la columna aún no exista
    caja: { ...mapCaja(fila), monto_diferencia: diferencia, observacion: observacion ?? null },
    resumen,
    diferencia,
  };
}

/** Subflujo "Consultar turnos": turnos cerrados con su diferencia */
export async function listarTurnosCerrados(db: Db, limite = 20): Promise<Caja[]> {
  const { data, error } = await db
    .from('caja')
    .select('*')
    .eq('estado', 'CERRADA')
    .order('fecha_cierre', { ascending: false })
    .limit(Math.min(Math.max(1, limite), 100));
  if (error) throw errorBD(error, 'No se pudieron cargar los turnos');
  return ((data ?? []) as any[]).map((row) => {
    const c = mapCaja(row);
    if (c.monto_diferencia == null && c.monto_final_real != null && c.monto_final_sistema != null) {
      c.monto_diferencia = calcularDiferenciaArqueo(c.monto_final_sistema, c.monto_final_real);
    }
    return c;
  });
}

// ===========================================================================
// VENTA
// ===========================================================================

/** Catálogo con precio de venta y stock (paso 4 del CU) */
export async function listarProductosVenta(db: Db): Promise<ProductoVenta[]> {
  const { data, error } = await db.from('producto').select('*').order('nombre');
  if (error) throw errorBD(error, 'No se pudieron cargar los productos');
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    unidad_medida: p.unidad_medida ?? null,
    stock_disponible: num(p.stock_disponible),
    stock_minimo: num(p.stock_minimo),
    precio_venta: calcularPrecioVenta(p),
  }));
}

/** Clientes para la venta (solo lectura; venta.cliente_id es obligatorio) */
export async function listarClientesVenta(db: Db, limite = 500): Promise<ClienteVenta[]> {
  const { data, error } = await db
    .from('cliente')
    .select('id, razon_social, documento_identidad')
    .order('razon_social')
    .limit(limite);
  if (error) throw errorBD(error, 'No se pudieron cargar los clientes');
  return (data ?? []) as ClienteVenta[];
}

/** Cliente genérico "Cliente de mostrador" (lo crea la migración) */
export async function buscarClienteMostrador(db: Db): Promise<number | null> {
  const { data } = await db
    .from('cliente')
    .select('id')
    .ilike('razon_social', CLIENTE_MOSTRADOR)
    .limit(1)
    .maybeSingle();
  return (data as any)?.id ?? null;
}

/** 2.3 calcularTotalesYDescuentos(items, descuento) */
export function calcularTotalesYDescuentos(
  items: { precioUnitario: number; cantidad: number }[],
  descuento = 0
): TotalesVenta {
  const subtotal = r2(items.reduce((acc, it) => acc + r2(num(it.precioUnitario) * num(it.cantidad)), 0));
  const desc = r2(num(descuento));
  if (desc < 0) throw new VentaError('El descuento no puede ser negativo');
  if (desc > subtotal) throw new VentaError(MENSAJES.DESCUENTO);
  return { subtotal, descuento: desc, total: r2(subtotal - desc) };
}

/** Correlativo NV-AAAA-00001 */
export async function generarNroComprobante(db: Db, anio = new Date().getFullYear()): Promise<string> {
  const { data } = await db
    .from('venta')
    .select('nro_comprobante')
    .like('nro_comprobante', `NV-${anio}-%`)
    .order('nro_comprobante', { ascending: false })
    .limit(1)
    .maybeSingle();
  const seq = Number(String((data as any)?.nro_comprobante ?? '').split('-')[2] ?? 0) + 1;
  return `NV-${anio}-${String(seq).padStart(5, '0')}`;
}

/** 2.4 crearVenta(cajaId, clienteId, total, comprobante) */
export async function crearVenta(
  db: Db,
  datos: {
    cajaId: number;
    clienteId: number;
    usuarioId: number;
    totales: TotalesVenta;
    tipoPago: TipoPago;
    tipoComprobante: string;
    nroComprobante: string;
  }
): Promise<Venta> {
  return insertar<Venta>(db, 'venta', {
    caja_id: datos.cajaId,
    cliente_id: datos.clienteId,
    usuario_id: datos.usuarioId,
    tipo_comprobante: datos.tipoComprobante,
    nro_comprobante: datos.nroComprobante,
    subtotal: datos.totales.subtotal,
    descuento: datos.totales.descuento,
    total: datos.totales.total,
    estado: 'EMITIDA',
    tipo_pago: datos.tipoPago,
  });
}

/** 2.5 crearDetalles(ventaId, productoId, cantidad, precio) */
export async function crearDetalles(
  db: Db,
  ventaId: number,
  lineas: { productoId: number; cantidad: number; precioUnitario: number }[]
): Promise<DetalleVenta[]> {
  const { data, error } = await db
    .from('detalle_venta')
    .insert(
      lineas.map((l) => ({
        venta_id: ventaId,
        producto_id: l.productoId,
        cantidad: l.cantidad,
        precio_unitario: l.precioUnitario,
        subtotal: r2(l.precioUnitario * l.cantidad),
      })) as any
    )
    .select('*');
  if (error) throw errorBD(error, 'No se pudo registrar el detalle de la venta');
  return (data ?? []) as DetalleVenta[];
}

/**
 * 2.7 descontarStock(productoId, cantidad)
 * Control optimista: UPDATE ... WHERE stock_disponible = <valor leído>, con
 * reintentos, para no pisar otra venta concurrente.
 */
export async function descontarStock(
  db: Db,
  productoId: number,
  cantidad: number
): Promise<{ stockAnterior: number; stockNuevo: number }> {
  for (let intento = 0; intento < 3; intento++) {
    const { data: p, error } = await db
      .from('producto')
      .select('nombre, stock_disponible')
      .eq('id', productoId)
      .maybeSingle();
    if (error) throw errorBD(error, 'No se pudo leer el stock');
    if (!p) throw new VentaError(`Producto ${productoId} no existe`);
    const stockAnterior = num((p as any).stock_disponible);
    if (stockAnterior < cantidad) {
      throw new VentaError(
        `Stock insuficiente para "${(p as any).nombre}": disponible ${stockAnterior}, solicitado ${cantidad}`
      );
    }
    const stockNuevo = stockAnterior - cantidad;
    const { data: upd } = await db
      .from('producto')
      .update({ stock_disponible: stockNuevo } as any)
      .eq('id', productoId)
      .eq('stock_disponible', stockAnterior)
      .select('id');
    if (upd && upd.length) return { stockAnterior, stockNuevo };
  }
  throw new VentaError('El stock cambió durante la venta. Intente nuevamente.');
}

/** 2.6 registrarSalidaKardex(productoId, cantidad, 'SALIDA') */
export async function registrarSalidaKardex(
  db: Db,
  mov: { productoId: number; usuarioId: number; cantidad: number; stockAnterior: number; nroComprobante: string }
): Promise<MovimientoKardex> {
  return insertar<MovimientoKardex>(db, 'movimiento_kardex', {
    producto_id: mov.productoId,
    usuario_id: mov.usuarioId,
    tipo_movimiento: 'SALIDA',
    cantidad: mov.cantidad,
    stock_anterior: mov.stockAnterior,
    origen_movimiento: 'VENTA',
    observacion: `Venta ${mov.nroComprobante}`,
  });
}

/**
 * 2.1 registrarVentaDirecta(datosVentaDTO)
 *
 * Camino principal: función PostgreSQL `fn_registrar_venta` (migración
 * 20261010_cu09_cu14.sql), que ejecuta los pasos 2.2-2.7 en UNA transacción:
 * si un producto no tiene stock se revierte la venta completa.
 *
 * Respaldo (si la función aún no existe): los mismos métodos del diagrama
 * ejecutados en orden, con compensación manual ante cualquier fallo.
 */
export async function registrarVentaDirecta(db: Db, datosVentaDTO: DatosVentaDTO): Promise<ComprobanteVenta> {
  const datos = validar(registrarVentaSchema, datosVentaDTO);
  const { usuarioId, ip } = datosVentaDTO;

  // Agrupa líneas repetidas del mismo producto
  const agrupado = new Map<number, number>();
  for (const it of datos.items) agrupado.set(it.productoId, (agrupado.get(it.productoId) ?? 0) + it.cantidad);
  const items = [...agrupado.entries()].map(([productoId, cantidad]) => ({ productoId, cantidad }));

  const clienteId = datos.clienteId ?? (await buscarClienteMostrador(db));
  if (!clienteId) throw new VentaError(`No existe el cliente "${CLIENTE_MOSTRADOR}". Ejecute la migración.`);

  // ---- Camino transaccional ------------------------------------------------
  const { data: rpc, error: rpcError } = await db.rpc('fn_registrar_venta', {
    p_usuario_id: usuarioId,
    p_cliente_id: clienteId,
    p_tipo_pago: datos.tipoPago,
    p_tipo_comprobante: datos.tipoComprobante,
    p_descuento: datos.descuento,
    p_items: items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad })),
    p_ip: ip,
  } as any);

  if (!rpcError && rpc) {
    const r = rpc as any;
    return {
      ventaId: r.id,
      nroComprobante: r.nro_comprobante,
      subtotal: num(r.subtotal),
      descuento: num(r.descuento),
      total: num(r.total),
      tipoPago: datos.tipoPago,
      tipoComprobante: datos.tipoComprobante,
    };
  }
  if (rpcError && !rpcNoExiste(rpcError)) throw errorBD(rpcError, 'No se pudo registrar la venta');

  // ---- Respaldo paso a paso -------------------------------------------------
  // 2.2 verificarCajaAbierta
  const caja = await verificarCajaAbierta(db, usuarioId);
  if (!caja) throw new VentaError(MENSAJES.SIN_CAJA);

  // Valorizar líneas con precios del servidor
  const { data: prods, error: pErr } = await db
    .from('producto')
    .select('*')
    .in('id', items.map((i) => i.productoId));
  if (pErr) throw errorBD(pErr, 'No se pudieron leer los productos');
  const porId = new Map<number, any>(((prods ?? []) as any[]).map((p) => [p.id, p]));

  const lineas: LineaVenta[] = items.map((it) => {
    const p = porId.get(it.productoId);
    if (!p) throw new VentaError(`Producto ${it.productoId} no existe`);
    const stock = num(p.stock_disponible);
    if (stock < it.cantidad) {
      throw new VentaError(`Stock insuficiente para "${p.nombre}": disponible ${stock}, solicitado ${it.cantidad}`);
    }
    const precioUnitario = calcularPrecioVenta(p);
    return {
      productoId: it.productoId,
      nombre: p.nombre,
      cantidad: it.cantidad,
      precioUnitario,
      subtotal: r2(precioUnitario * it.cantidad),
      stockAnterior: stock,
    };
  });

  // 2.3 calcularTotalesYDescuentos
  const totales = calcularTotalesYDescuentos(lineas, datos.descuento);
  const nroComprobante = await generarNroComprobante(db);

  // 2.4 crearVenta
  const venta = await crearVenta(db, {
    cajaId: caja.id,
    clienteId,
    usuarioId,
    totales,
    tipoPago: datos.tipoPago,
    tipoComprobante: datos.tipoComprobante,
    nroComprobante,
  });

  const stocksAplicados: { productoId: number; stockAnterior: number }[] = [];
  const kardexCreados: number[] = [];
  const compensar = async () => {
    if (kardexCreados.length) await db.from('movimiento_kardex').delete().in('id', kardexCreados);
    for (const s of stocksAplicados) {
      await db.from('producto').update({ stock_disponible: s.stockAnterior } as any).eq('id', s.productoId);
    }
    await db.from('detalle_venta').delete().eq('venta_id', venta.id);
    await db.from('venta').delete().eq('id', venta.id);
  };

  try {
    // 2.5 crearDetalles
    await crearDetalles(db, venta.id, lineas);

    for (const l of lineas) {
      // 2.7 descontarStock
      const { stockAnterior } = await descontarStock(db, l.productoId, l.cantidad);
      stocksAplicados.push({ productoId: l.productoId, stockAnterior });

      // 2.6 registrarSalidaKardex
      const mov = await registrarSalidaKardex(db, {
        productoId: l.productoId,
        usuarioId,
        cantidad: l.cantidad,
        stockAnterior,
        nroComprobante,
      });
      kardexCreados.push(mov.id);
    }
  } catch (e) {
    await compensar();
    throw e instanceof VentaError ? e : errorBD(e, 'No se pudo registrar la venta');
  }

  // 1.6 guardarEventoCaja
  await guardarEventoCaja(
    db,
    usuarioId,
    'REGISTRO_VENTA',
    ip,
    `Venta ${nroComprobante} por Bs ${totales.total.toFixed(2)} (${datos.tipoPago})`
  );

  // 2.8 retornarComprobante(ventaId, nroComprobante)
  return {
    ventaId: venta.id,
    nroComprobante,
    ...totales,
    tipoPago: datos.tipoPago,
    tipoComprobante: datos.tipoComprobante,
  };
}

/**
 * Subflujo "Anular venta": solo ventas del turno abierto del mismo usuario.
 * Devuelve el stock con una ENTRADA en el kárdex.
 */
export async function anularVenta(
  db: Db,
  params: { usuarioId: number; ventaId: number; ip: string }
): Promise<{ ventaId: number; nroComprobante: string | null }> {
  const { ventaId } = validar(anularVentaSchema, params);

  const { data: rpc, error: rpcError } = await db.rpc('fn_anular_venta', {
    p_usuario_id: params.usuarioId,
    p_venta_id: ventaId,
    p_ip: params.ip,
  } as any);
  if (!rpcError && rpc) return { ventaId, nroComprobante: (rpc as any).nro_comprobante ?? null };
  if (rpcError && !rpcNoExiste(rpcError)) throw errorBD(rpcError, 'No se pudo anular la venta');

  // ---- Respaldo sin función SQL ----------------------------------------------
  const { data, error } = await db
    .from('venta')
    .select('*, caja:caja_id(id, estado, usuario_id), detalle_venta(producto_id, cantidad)')
    .eq('id', ventaId)
    .maybeSingle();
  if (error) throw errorBD(error, 'No se pudo leer la venta');
  if (!data) throw new VentaError('La venta no existe');
  const v = data as any;
  if (v.estado === 'ANULADA') throw new VentaError(MENSAJES.ANULADA);
  if (v.caja?.estado !== 'ABIERTA') throw new VentaError(MENSAJES.TURNO_CERRADO);
  if (v.caja?.usuario_id !== params.usuarioId) throw new VentaError(MENSAJES.OTRO_USUARIO);

  // Marca condicional: evita doble anulación concurrente
  const marcada = await actualizar<Venta>(db, 'venta', { estado: 'ANULADA' }, { id: ventaId, estado: 'EMITIDA' });
  if (!marcada) throw new VentaError(MENSAJES.ANULADA);

  for (const d of (v.detalle_venta ?? []) as any[]) {
    if (!d.producto_id) continue;
    for (let intento = 0; intento < 3; intento++) {
      const { data: p } = await db.from('producto').select('stock_disponible').eq('id', d.producto_id).single();
      const anterior = num((p as any)?.stock_disponible);
      const { data: upd } = await db
        .from('producto')
        .update({ stock_disponible: anterior + num(d.cantidad) } as any)
        .eq('id', d.producto_id)
        .eq('stock_disponible', anterior)
        .select('id');
      if (upd && upd.length) {
        await insertar(db, 'movimiento_kardex', {
          producto_id: d.producto_id,
          usuario_id: params.usuarioId,
          tipo_movimiento: 'ENTRADA',
          cantidad: num(d.cantidad),
          stock_anterior: anterior,
          origen_movimiento: 'ANULACION_VENTA',
          observacion: `Anulación ${v.nro_comprobante ?? ventaId}`,
        });
        break;
      }
    }
  }

  await guardarEventoCaja(db, params.usuarioId, 'ANULAR_VENTA', params.ip, `Venta ${v.nro_comprobante ?? ventaId} anulada`);
  return { ventaId, nroComprobante: v.nro_comprobante ?? null };
}

// ===========================================================================
// BITÁCORA
// ===========================================================================

/**
 * 1.6 guardarEventoCaja(usuarioId, accion, ip)
 * Nunca lanza: un fallo de auditoría no debe deshacer la operación de caja.
 * Si la columna `ip` aún no existe, se guarda el evento sin ella.
 */
export async function guardarEventoCaja(
  db: Db,
  usuarioId: number,
  accion: AccionCaja,
  ip: string,
  descripcion?: string
): Promise<void> {
  try {
    await insertar(
      db,
      'bitacora',
      {
        usuario_id: usuarioId,
        accion,
        descripcion: descripcion ?? accion,
        ip,
      },
      'id'
    );
  } catch (e) {
    console.error('[CU09] No se pudo registrar en la bitácora:', (e as Error).message);
  }
}
