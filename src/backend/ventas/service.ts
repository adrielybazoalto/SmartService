/**
 * CU09 — Gestionar Ventas y Arqueo de Caja · Servicio (control "Gestión Ventas y Caja")
 *
 * Cada función recibe `db: Db` como primer parámetro (sin estado global).
 *
 * Las operaciones que modifican dinero o stock se ejecutan en PostgreSQL,
 * cada una en UNA transacción (migración 20261012_cu09_ventas_caja.sql):
 *   fn_registrar_venta  → venta + detalle + stock + SALIDA en kárdex (rollback ante cualquier error)
 *   fn_anular_venta     → ANULADA + devolución de stock + ENTRADA en kárdex
 *   fn_cerrar_caja      → efectivo esperado + diferencia + cierre, con la caja bloqueada
 *
 * La bitácora se escribe en BITACORA con usuario_id, accion, descripcion e
 * ip (columna oficial `ip`). La IP la obtiene la Server Action de la petición.
 *
 * Métodos del diagrama:
 *   verificarCajaAbierta · procesarAperturaOArqueo · calcularDiferenciaArqueo
 *   registrarVentaDirecta · calcularTotalesYDescuentos · guardarEventoCaja
 *   generarNotaVentaPdf (paso 8)
 *   (crearVenta, crearDetalles, descontarStock y registrarSalidaKardex se
 *   ejecutan dentro de fn_registrar_venta para garantizar la atomicidad)
 */
import { ZodError, type z } from 'zod';
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { obtenerIpOrigen } from '@/lib/ip';

import { anularVentaSchema, aperturaCajaSchema, cierreCajaSchema, registrarVentaSchema } from './schema';
import {
  TIPOS_PAGO,
  type AccionCaja,
  type Caja,
  type CajaDTO,
  type ClienteVenta,
  type ComprobanteVenta,
  type DatosVentaDTO,
  type Db,
  type NotaVenta,
  type ProductoVenta,
  type ResultadoCaja,
  type ResumenArqueo,
  type TipoComprobante,
  type TipoPago,
  type TotalesVenta,
  type VentaResumen,
} from './types';

// ===========================================================================
// Errores de negocio (mensajes exactos del CU09, listos para la IU)
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
  SIN_MIGRACION:
    'Falta instalar las funciones de ventas en la base de datos (ejecute 20261012_cu09_solo_lo_necesario.sql)',
} as const;

export const CLIENTE_MOSTRADOR = 'Cliente de mostrador';

// ===========================================================================
// Utilidades internas
// ===========================================================================
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** precio de venta = precio_compra_actual × (1 + margen_ganancia / 100) */
export const calcularPrecioVenta = (p: { precio_compra_actual: unknown; margen_ganancia?: unknown }) =>
  r2(num(p.precio_compra_actual) * (1 + num(p.margen_ganancia) / 100));

/** Valida con Zod y convierte el primer error en VentaError */
function validar<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  try {
    return schema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) throw new VentaError(e.issues[0]?.message ?? 'Datos inválidos');
    throw e;
  }
}

/** La función SQL no está instalada (PostgREST PGRST202 / Postgres 42883) */
const rpcNoExiste = (error: any) =>
  !!error &&
  (error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(error.message ?? ''));

/**
 * Traduce errores de PostgreSQL/PostgREST a VentaError.
 * Los RAISE EXCEPTION de las funciones (P0001) ya traen el mensaje de negocio.
 */
function errorBD(error: any, porDefecto: string): VentaError {
  if (rpcNoExiste(error)) {
    console.error('[CU09] Error al llamar la función SQL:', error);
    // PGRST202: la API de Supabase que usa la app no ve la función
    if (error?.code === 'PGRST202' || /Could not find the function/i.test(error?.message ?? '')) {
      return new VentaError(
        `${MENSAJES.SIN_MIGRACION}. Detalle: ${error?.message ?? 'función no encontrada'}. ` +
          'Si el script ya se ejecutó, revise que NEXT_PUBLIC_SUPABASE_URL de .env.local sea el mismo proyecto.'
      );
    }
    // 42883 desde dentro de la función: la función existe, falla una operación interna
    return new VentaError(`Error en la base de datos: ${error?.message ?? 'operación no soportada'}`);
  }
  const msg: string = error?.message ?? '';
  if (/ux_caja_usuario_abierta/.test(msg)) return new VentaError(MENSAJES.CAJA_DUPLICADA);
  if (/ux_venta_nro_comprobante/.test(msg)) return new VentaError('Conflicto de correlativo, intente nuevamente');
  if (error?.code === 'P0001' && msg) return new VentaError(msg);
  console.error('[CU09] Error de base de datos:', error);
  // Se muestra el motivo real para poder corregirlo (restricción, columna, etc.)
  const detalle = [error?.message, error?.details, error?.hint].filter(Boolean).join(' · ');
  return new VentaError(detalle ? `${porDefecto}: ${detalle}${error?.code ? ` (código ${error.code})` : ''}` : porDefecto);
}

/** Nombre visible del cliente: razón social (empresas) o nombre (personas) */
const nombreCliente = (c: any): string => c?.razon_social || c?.nombre || '—';

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
// BITÁCORA (CU06) — columna oficial `ip`
// ===========================================================================

/**
 * guardarEventoCaja(usuarioId, accion, ip)
 * Registra el evento en BITACORA con la IP de origen. Nunca lanza: un fallo
 * de auditoría no debe deshacer una venta ya confirmada.
 */
export async function guardarEventoCaja(
  db: Db,
  usuarioId: number,
  accion: AccionCaja,
  descripcion: string,
  ip: string | null = null
): Promise<void> {
  try {
    const ipOrigen = (ip && ip.trim()) ? ip.trim() : (await obtenerIpOrigen());
    const { error } = await db
      .from('bitacora')
      .insert({ usuario_id: usuarioId, accion, descripcion, ip: ipOrigen } as any);
    if (error) console.error(`[CU09] No se pudo registrar ${accion} en la bitácora: ${error.message}`);
  } catch (e) {
    console.error('[CU09] No se pudo registrar en la bitácora:', (e as Error)?.message ?? e);
  }
}

// ===========================================================================
// CAJA
// ===========================================================================

/** verificarCajaAbierta(usuarioId) — devuelve el turno abierto o null */
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

/** calcularDiferenciaArqueo(montoSistema, montoReal) → + sobrante / − faltante */
export function calcularDiferenciaArqueo(montoSistema: number, montoReal: number): number {
  return r2(num(montoReal) - num(montoSistema));
}

/** Ventas del turno con cliente y cantidad de ítems */
export async function listarVentasCaja(db: Db, cajaId: number): Promise<VentaResumen[]> {
  const { data, error } = await db
    .from('venta')
    .select('*, cliente:cliente_id(*), detalle_venta(id)')
    .eq('caja_id', cajaId)
    .order('id', { ascending: false });
  if (error) throw errorBD(error, 'No se pudieron cargar las ventas');
  return ((data ?? []) as any[]).map((v) => ({
    id: v.id,
    nro_comprobante: v.nro_comprobante ?? null,
    fecha_emision: v.fecha_emision,
    cliente_nombre: nombreCliente(v.cliente),
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
 * Totales del turno por método de pago (misma regla que fn_cerrar_caja):
 * efectivo esperado = fondo inicial + ventas EMITIDAS en EFECTIVO.
 */
export function resumirCaja(caja: Caja, ventas: VentaResumen[]): ResumenArqueo {
  const totales: Record<TipoPago, number> = { EFECTIVO: 0, QR: 0, TARJETA: 0, TRANSFERENCIA: 0 };
  let emitidas = 0;
  let anuladas = 0;
  let cobrosOrdenes = 0;
  for (const v of ventas) {
    if (v.estado === 'ANULADA') {
      anuladas++;
      continue;
    }
    emitidas++;
    totales[v.tipo_pago] = r2(totales[v.tipo_pago] + v.total);
    if (String(v.tipo_comprobante ?? '').startsWith('RECIBO_')) cobrosOrdenes = r2(cobrosOrdenes + v.total);
  }
  return {
    caja,
    totales_por_pago: totales,
    cantidad_ventas: emitidas,
    cantidad_anuladas: anuladas,
    total_vendido: r2(Object.values(totales).reduce((a, b) => a + b, 0)),
    efectivo_esperado: r2(caja.monto_inicial + totales.EFECTIVO),
    total_electronico: r2(totales.QR + totales.TARJETA + totales.TRANSFERENCIA),
    cobros_ordenes: cobrosOrdenes,
  };
}

/** mostrarResumenArqueo — resumen del turno abierto del usuario */
export async function obtenerResumenCaja(db: Db, usuarioId: number): Promise<ResumenArqueo | null> {
  const caja = await verificarCajaAbierta(db, usuarioId);
  if (!caja) return null;
  return resumirCaja(caja, await listarVentasCaja(db, caja.id));
}

/**
 * procesarAperturaOArqueo(cajaDTO)
 *  - APERTURA: fondo inicial válido, sin otro turno abierto (también lo
 *    garantiza el índice ux_caja_usuario_abierta), crea la caja y registra
 *    APERTURA_CAJA.
 *  - ARQUEO: fn_cerrar_caja calcula el efectivo esperado, la diferencia con
 *    el conteo físico y cierra la caja en una transacción; registra ARQUEO_CAJA.
 */
export async function procesarAperturaOArqueo(db: Db, cajaDTO: CajaDTO): Promise<ResultadoCaja> {
  if (cajaDTO.tipo === 'APERTURA') {
    const { montoInicial } = validar(aperturaCajaSchema, cajaDTO);

    if (await verificarCajaAbierta(db, cajaDTO.usuarioId)) throw new VentaError(MENSAJES.CAJA_DUPLICADA);

    const { data, error } = await db
      .from('caja')
      .insert({ usuario_id: cajaDTO.usuarioId, monto_inicial: montoInicial, estado: 'ABIERTA' } as any)
      .select('*')
      .single();
    if (error || !data) throw errorBD(error, 'No se pudo abrir la caja');
    const caja = mapCaja(data);

    await guardarEventoCaja(
      db,
      cajaDTO.usuarioId,
      'APERTURA_CAJA',
      `Apertura de caja #${caja.id} con fondo inicial Bs ${montoInicial.toFixed(2)}`,
      cajaDTO.ip ?? null
    );
    return { caja };
  }

  // ---- ARQUEO Y CIERRE ------------------------------------------------------
  const { montoReal, observacion, cajaId } = validar(cierreCajaSchema, cajaDTO);

  const { data: rpc, error: rpcError } = await db.rpc('fn_cerrar_caja', {
    p_usuario_id: cajaDTO.usuarioId,
    p_monto_real: montoReal,
    p_observacion: observacion ?? null,
    p_caja_id: cajaId ?? null,
  } as any);
  if (rpcError || !rpc) throw errorBD(rpcError, 'No se pudo cerrar la caja');
  const r = rpc as any;

  const { data: fila, error: filaError } = await db.from('caja').select('*').eq('id', r.caja_id).single();
  if (filaError || !fila) throw errorBD(filaError, 'No se pudo leer la caja cerrada');
  const caja = mapCaja(fila);
  const resumen = resumirCaja(caja, await listarVentasCaja(db, caja.id));
  const esperado = num(r.efectivo_esperado);
  const diferencia = num(r.diferencia);

  const tipoDif = diferencia === 0 ? 'cuadrada' : diferencia > 0 ? 'sobrante' : 'faltante';
  await guardarEventoCaja(
    db,
    cajaDTO.usuarioId,
    'ARQUEO_CAJA',
    `Cierre de caja #${caja.id}: esperado Bs ${esperado.toFixed(2)}, contado Bs ${montoReal.toFixed(2)}, ` +
      `diferencia Bs ${diferencia.toFixed(2)} (${tipoDif}). Ventas: ${resumen.cantidad_ventas}, ` +
      `total Bs ${resumen.total_vendido.toFixed(2)}` +
      (observacion ? `. Obs: ${observacion}` : ''),
    cajaDTO.ip ?? null
  );

  return { caja: { ...caja, monto_diferencia: diferencia }, resumen, diferencia };
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
// CATÁLOGOS PARA LA VENTA (solo lectura)
// ===========================================================================

/**
 * Imagen principal de cada producto (IMAGEN_PRODUCTO), solo para mostrarla.
 * Si la tabla no existe o falla, la venta funciona igual, sin imágenes.
 */
async function imagenesPrincipales(db: Db): Promise<Map<number, string>> {
  const mapa = new Map<number, string>();
  const { data, error } = await db
    .from('imagen_producto')
    .select('producto_id, url_imagen, es_principal, orden')
    .order('es_principal', { ascending: false })
    .order('orden', { ascending: true });
  if (error) return mapa;
  for (const img of (data ?? []) as any[]) {
    if (img.url_imagen && !mapa.has(img.producto_id)) mapa.set(img.producto_id, img.url_imagen);
  }
  return mapa;
}

/** Productos con stock disponible y precio de venta (paso 4) */
export async function listarProductosVenta(db: Db): Promise<ProductoVenta[]> {
  const [{ data, error }, imagenes] = await Promise.all([
    db.from('producto').select('*').order('nombre'),
    imagenesPrincipales(db),
  ]);
  if (error) throw errorBD(error, 'No se pudieron cargar los productos');
  return ((data ?? []) as any[]).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    unidad_medida: p.unidad_medida ?? null,
    stock_disponible: num(p.stock_disponible),
    stock_minimo: num(p.stock_minimo),
    precio_venta: calcularPrecioVenta(p),
    imagen_url: imagenes.get(p.id) ?? null,
  }));
}

/** Clientes para la venta (solo lectura; venta.cliente_id es obligatorio) */
export async function listarClientesVenta(db: Db, limite = 500): Promise<ClienteVenta[]> {
  const { data, error } = await db.from('cliente').select('*').eq('estado', true).limit(limite);
  if (error) throw errorBD(error, 'No se pudieron cargar los clientes');
  return ((data ?? []) as any[])
    .map((c) => ({
      id: c.id,
      razon_social: nombreCliente(c),
      nombre: c.nombre ?? null,
      documento_identidad: c.documento_identidad ?? null,
    }))
    .sort((a, b) => a.razon_social.localeCompare(b.razon_social));
}

/** Cliente genérico "Cliente de mostrador" (lo crea la migración) */
export async function buscarClienteMostrador(db: Db): Promise<number | null> {
  for (const columna of ['razon_social', 'nombre']) {
    const { data, error } = await db
      .from('cliente')
      .select('id')
      .ilike(columna, CLIENTE_MOSTRADOR)
      .limit(1)
      .maybeSingle();
    if (!error && data) return (data as any).id;
  }
  return null;
}

// ===========================================================================
// VENTA
// ===========================================================================

/**
 * calcularTotalesYDescuentos(items, descuento)
 * Vista previa del cálculo. El cálculo que vale es el de fn_registrar_venta,
 * con los precios vigentes leídos dentro de la transacción.
 */
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

/**
 * registrarVentaDirecta(datosVentaDTO)
 * Valida la entrada y ejecuta fn_registrar_venta: cabecera, detalle,
 * descuento de stock y SALIDA en kárdex en una sola transacción. Si algo
 * falla (sin caja, stock insuficiente, descuento > subtotal…) PostgreSQL
 * revierte todo y no queda nada a medias. Luego registra REGISTRO_VENTA.
 */
export async function registrarVentaDirecta(db: Db, datosVentaDTO: DatosVentaDTO): Promise<ComprobanteVenta> {
  const datos = validar(registrarVentaSchema, datosVentaDTO);
  const { usuarioId } = datosVentaDTO;
  // TARJETA solo se registra después de que Stripe confirma el pago
  if (datos.tipoPago === 'TARJETA') throw new VentaError('El pago con tarjeta se realiza con la pasarela de pago (Stripe)');

  const clienteId = datos.clienteId ?? (await buscarClienteMostrador(db));
  if (!clienteId) throw new VentaError('Seleccione un cliente para la venta');

  const { data: rpc, error } = await db.rpc('fn_registrar_venta', {
    p_usuario_id: usuarioId,
    p_cliente_id: clienteId,
    p_tipo_pago: datos.tipoPago,
    p_tipo_comprobante: datos.tipoComprobante,
    p_descuento: datos.descuento,
    p_items: datos.items.map((i) => ({ producto_id: i.productoId, cantidad: i.cantidad })),
  } as any);
  if (error || !rpc) throw errorBD(error, 'No se pudo registrar la venta');

  const r = rpc as any;
  const comprobante: ComprobanteVenta = {
    ventaId: r.id,
    nroComprobante: r.nro_comprobante,
    subtotal: num(r.subtotal),
    descuento: num(r.descuento),
    total: num(r.total),
    tipoPago: datos.tipoPago,
    tipoComprobante: datos.tipoComprobante,
  };

  // TRANSFERENCIA: se guarda el número de referencia del comprobante bancario
  let referencia = '';
  if (datos.tipoPago === 'TRANSFERENCIA' && datos.referenciaPago) {
    const { error: errRef } = await db.from('venta').update({ referencia_pago: datos.referenciaPago } as any).eq('id', comprobante.ventaId);
    if (errRef) console.warn('[CU09] No se pudo guardar la referencia de la transferencia:', errRef.message);
    referencia = ` · Ref. transferencia: ${datos.referenciaPago}`;
  }

  await guardarEventoCaja(db, usuarioId, 'REGISTRO_VENTA', `${await describirVenta(db, comprobante)}${referencia}`, datosVentaDTO.ip ?? null);
  return comprobante;
}

/**
 * Texto de la bitácora para una venta: número, cliente, qué se vendió y total.
 * Ej.: "Venta NV-2026-00003 · Cliente: Juan Pérez · Cámara IP 4MP x2, Instalación CCTV x1.5 h ·
 *       Subtotal Bs 810.00, descuento Bs 10.00, total Bs 800.00 · Pago: EFECTIVO"
 * El detalle completo queda en DETALLE_VENTA y MOVIMIENTO_KARDEX.
 */
async function describirVenta(db: Db, c: ComprobanteVenta): Promise<string> {
  const base =
    `Subtotal Bs ${c.subtotal.toFixed(2)}, descuento Bs ${c.descuento.toFixed(2)}, total Bs ${c.total.toFixed(2)}` +
    ` · Pago: ${c.tipoPago}`;
  try {
    const nota = await obtenerNotaVenta(db, c.ventaId);
    if (!nota) return `Venta ${c.nroComprobante} · ${base}`;
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
    let items = nota.items
      .map((i) => `${i.descripcion} x${fmt(i.cantidad)}`)
      .join(', ');
    if (items.length > 400) items = `${items.slice(0, 397)}...`;
    return `Venta ${c.nroComprobante} · Cliente: ${nota.cliente.nombre} · ${items} · ${base}`;
  } catch {
    return `Venta ${c.nroComprobante} · ${base}`;
  }
}

/**
 * Subflujo "Anular venta": solo ventas del turno ABIERTO y del mismo usuario.
 * fn_anular_venta devuelve el stock con una ENTRADA en el kárdex.
 */
export async function anularVenta(
  db: Db,
  params: { usuarioId: number; ventaId: number; ip?: string | null }
): Promise<{ ventaId: number; nroComprobante: string | null }> {
  const { ventaId } = validar(anularVentaSchema, params);
  const { data: rpc, error } = await db.rpc('fn_anular_venta', {
    p_usuario_id: params.usuarioId,
    p_venta_id: ventaId,
  } as any);
  if (error || !rpc) throw errorBD(error, 'No se pudo anular la venta');
  const nro: string | null = (rpc as any).nro_comprobante ?? null;

  await guardarEventoCaja(
    db,
    params.usuarioId,
    'ANULAR_VENTA',
    `Venta ${nro ?? ventaId} anulada; stock devuelto`,
    params.ip ?? null
  );
  return { ventaId, nroComprobante: nro };
}

/** Datos de la nota de venta (paso 8: PDF) */
export async function obtenerNotaVenta(db: Db, ventaId: number): Promise<NotaVenta | null> {
  const { data, error } = await db
    .from('venta')
    .select('*, cliente:cliente_id(*), usuario:usuario_id(nombre), orden:orden_trabajo_id(codigo_orden), detalle_venta(*, producto:producto_id(nombre, unidad_medida))')
    .eq('id', ventaId)
    .maybeSingle();
  if (error) throw errorBD(error, 'No se pudo leer la venta');
  if (!data) return null;
  const v = data as any;
  return {
    id: v.id,
    nro_comprobante: v.nro_comprobante ?? `#${v.id}`,
    tipo_comprobante: v.tipo_comprobante ?? null,
    fecha_emision: v.fecha_emision,
    estado: v.estado ?? 'EMITIDA',
    tipo_pago: (TIPOS_PAGO as readonly string[]).includes(v.tipo_pago) ? v.tipo_pago : 'EFECTIVO',
    caja_id: v.caja_id,
    usuario_id: v.usuario_id,
    cajero: v.usuario?.nombre ?? `Usuario #${v.usuario_id}`,
    cliente: { nombre: nombreCliente(v.cliente), documento: v.cliente?.documento_identidad ?? null },
    items: String(v.tipo_comprobante ?? '').startsWith('RECIBO_')
      ? // Recibo de abono / saldo de una orden de trabajo (sin productos)
        [{
          descripcion:
            (v.tipo_comprobante === 'RECIBO_SALDO' ? 'Cobro del saldo de la nota de servicio - orden ' : 'Abono a cuenta de la orden de trabajo ') +
            (v.orden?.codigo_orden ?? `#${v.orden_trabajo_id}`) +
            (v.referencia_pago ? ` (Ref. ${v.referencia_pago})` : ''),
          unidad: 'SERV',
          cantidad: 1,
          precio_unitario: num(v.total),
          subtotal: num(v.total),
        }]
      : ((v.detalle_venta ?? []) as any[])
          .sort((a, b) => a.id - b.id)
          .map((d) => ({
            descripcion: d.producto?.nombre ?? `Producto #${d.producto_id}`,
            unidad: d.producto?.unidad_medida ?? 'UND',
            cantidad: num(d.cantidad),
            precio_unitario: num(d.precio_unitario),
            subtotal: num(d.subtotal),
          })),
    subtotal: num(v.subtotal),
    descuento: num(v.descuento),
    total: num(v.total),
  };
}

// ===========================================================================
// NOTA DE VENTA EN PDF (paso 8) — requiere: npm i pdf-lib
// ===========================================================================

/** Datos del emisor que aparecen en la cabecera: ajústalos a tu empresa */
export const EMPRESA = {
  nombre: 'SmartService',
  detalle: 'Sistemas de seguridad electrónica',
  contacto: '',
};

const VERDE = rgb(0x8c / 255, 0xd6 / 255, 0);
const OSCURO = rgb(0.06, 0.09, 0.16);
const GRIS = rgb(0.39, 0.45, 0.55);
const LINEA = rgb(0.89, 0.91, 0.94);

const ETIQUETA_PAGO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  QR: 'QR',
  TARJETA: 'Tarjeta',
  TRANSFERENCIA: 'Transferencia',
};
const ETIQUETA_COMPROBANTE: Record<string, string> = {
  NOTA_VENTA: 'Nota de venta',
  RECIBO: 'Recibo',
  RECIBO_ABONO: 'Recibo de abono',
  RECIBO_SALDO: 'Recibo de saldo',
};

const bsPdf = (n: number) =>
  `Bs ${Number(n || 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const cant = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Las fuentes estándar usan WinAnsi: se reemplazan caracteres fuera de ese juego */
const texto = (s: string) =>
  String(s ?? '')
    .replace(/[−–]/g, '-')
    .replace(/[→]/g, '->')
    .replace(/[^\x20-\x7E -ÿ—•€]/g, '?');

/** Fecha TIMESTAMP (sin zona, guardada en UTC) → hora de Bolivia */
const fechaBolivia = (iso: string) => {
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`);
  return d.toLocaleString('es-BO', { timeZone: 'America/La_Paz', dateStyle: 'short', timeStyle: 'short' });
};

/** Corta un texto en líneas que entren en `ancho` */
function partir(t: string, fuente: PDFFont, tam: number, ancho: number): string[] {
  const palabras = texto(t).split(/\s+/);
  const lineas: string[] = [];
  let actual = '';
  for (const p of palabras) {
    const prueba = actual ? `${actual} ${p}` : p;
    if (fuente.widthOfTextAtSize(prueba, tam) <= ancho) actual = prueba;
    else {
      if (actual) lineas.push(actual);
      actual = p;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length ? lineas : [''];
}

export async function generarNotaVentaPdf(nota: NotaVenta): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${nota.nro_comprobante} - Nota de venta`);
  pdf.setAuthor(EMPRESA.nombre);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  const ANCHO = 595.28; // A4
  const ALTO = 841.89;
  const M = 40;
  const anulada = nota.estado === 'ANULADA';

  // Columnas de la tabla: Cant. | Unidad | Descripción | P. unit. | Subtotal
  const col = { cant: M, unidad: M + 50, desc: M + 110, punit: ANCHO - M - 170, sub: ANCHO - M };
  const anchoDesc = col.punit - col.desc - 60;

  let page: PDFPage = pdf.addPage([ANCHO, ALTO]);
  let y = ALTO - M;

  const escribir = (t: string, x: number, yy: number, o: { f?: PDFFont; s?: number; c?: any; der?: boolean } = {}) => {
    const f = o.f ?? normal;
    const s = o.s ?? 10;
    const limpio = texto(t);
    const xx = o.der ? x - f.widthOfTextAtSize(limpio, s) : x;
    page.drawText(limpio, { x: xx, y: yy, size: s, font: f, color: o.c ?? OSCURO });
  };

  const sello = () => {
    if (!anulada) return;
    page.drawText('ANULADA', {
      x: 150, y: 330, size: 90, font: negrita, color: rgb(0.86, 0.15, 0.15), opacity: 0.18, rotate: degrees(35),
    });
  };

  const encabezadoTabla = () => {
    page.drawRectangle({ x: M, y: y - 6, width: ANCHO - 2 * M, height: 22, color: rgb(0.97, 0.98, 0.99) });
    escribir('CANT.', col.cant + 4, y, { f: negrita, s: 8, c: GRIS });
    escribir('UNIDAD', col.unidad, y, { f: negrita, s: 8, c: GRIS });
    escribir('DESCRIPCIÓN', col.desc, y, { f: negrita, s: 8, c: GRIS });
    escribir('P. UNIT.', col.punit + 60, y, { f: negrita, s: 8, c: GRIS, der: true });
    escribir('SUBTOTAL', col.sub - 4, y, { f: negrita, s: 8, c: GRIS, der: true });
    y -= 24;
  };

  // ---------------- Cabecera ----------------
  page.drawRectangle({ x: 0, y: ALTO - 8, width: ANCHO, height: 8, color: VERDE });
  escribir(EMPRESA.nombre, M, y - 10, { f: negrita, s: 20 });
  escribir(EMPRESA.detalle, M, y - 26, { s: 9, c: GRIS });
  if (EMPRESA.contacto) escribir(EMPRESA.contacto, M, y - 38, { s: 9, c: GRIS });

  const titulo = (ETIQUETA_COMPROBANTE[nota.tipo_comprobante ?? ''] ?? 'Nota de venta').toUpperCase();
  escribir(titulo, ANCHO - M, y - 8, { f: negrita, s: 12, c: GRIS, der: true });
  escribir(nota.nro_comprobante, ANCHO - M, y - 28, { f: negrita, s: 18, der: true });
  escribir(fechaBolivia(nota.fecha_emision), ANCHO - M, y - 44, { s: 9, c: GRIS, der: true });
  y -= 70;

  // ---------------- Datos ----------------
  page.drawLine({ start: { x: M, y }, end: { x: ANCHO - M, y }, thickness: 1, color: LINEA });
  y -= 20;
  const fila = (etq: string, val: string, x: number) => {
    escribir(etq, x, y, { s: 8, c: GRIS });
    escribir(val, x, y - 13, { f: negrita, s: 10 });
  };
  fila('CLIENTE', nota.cliente.nombre, M);
  fila('DOCUMENTO', nota.cliente.documento ?? 'S/N', M + 260);
  fila('MÉTODO DE PAGO', ETIQUETA_PAGO[nota.tipo_pago] ?? nota.tipo_pago, M + 400);
  y -= 36;
  fila('ATENDIDO POR', nota.cajero, M);
  fila('CAJA', `#${nota.caja_id}`, M + 260);
  fila('ESTADO', anulada ? 'ANULADA' : 'EMITIDA', M + 400);
  y -= 40;

  // ---------------- Detalle ----------------
  sello();
  encabezadoTabla();
  for (const it of nota.items) {
    const lineas = partir(it.descripcion, normal, 9.5, anchoDesc);
    const alto = 13 * lineas.length + 14;
    if (y - alto < M + 140) {
      page = pdf.addPage([ANCHO, ALTO]);
      y = ALTO - M;
      sello();
      encabezadoTabla();
    }
    escribir(cant(it.cantidad), col.cant + 4, y, { s: 9.5 });
    escribir(it.unidad, col.unidad, y, { s: 9.5, c: GRIS });
    lineas.forEach((l, i) => escribir(l, col.desc, y - 13 * i, { s: 9.5 }));
    escribir(bsPdf(it.precio_unitario), col.punit + 60, y, { s: 9.5, der: true });
    escribir(bsPdf(it.subtotal), col.sub - 4, y, { f: negrita, s: 9.5, der: true });
    // separador 7 pt debajo de la última línea de la fila
    const base = y - 13 * (lineas.length - 1) - 7;
    page.drawLine({ start: { x: M, y: base }, end: { x: ANCHO - M, y: base }, thickness: 0.5, color: LINEA });
    y = base - 14;
  }

  // ---------------- Totales ----------------
  y -= 6;
  const total = (etq: string, val: string) => {
    escribir(etq, ANCHO - M - 150, y, { s: 9.5, c: GRIS });
    escribir(val, ANCHO - M - 4, y, { s: 9.5, der: true });
    y -= 16;
  };
  total('Subtotal', bsPdf(nota.subtotal));
  total('Descuento', nota.descuento > 0 ? `- ${bsPdf(nota.descuento)}` : bsPdf(0));
  y -= 10;
  page.drawRectangle({ x: ANCHO - M - 160, y: y - 9, width: 160, height: 28, color: VERDE });
  escribir('TOTAL', ANCHO - M - 150, y, { f: negrita, s: 11 });
  escribir(bsPdf(nota.total), ANCHO - M - 4, y, { f: negrita, s: 13, der: true });

  // ---------------- Pie ----------------
  escribir('Gracias por su compra.', M, M + 20, { s: 9, c: GRIS });
  escribir(
    'Documento generado por SmartService. Este comprobante no es una factura.',
    M,
    M + 6,
    { s: 7.5, c: GRIS }
  );

  return pdf.save();
}

// ===========================================================================
// PAGO CON TARJETA (Stripe) — flujo alternativo del CU09
//   iniciarPagoTarjeta(datosVentaDTO)  -> PasarelaPago.crearSesionPago
//   confirmarPagoTarjeta(sessionId)    -> PasarelaPago.verificarPago
//                                         -> fn_registrar_venta_tarjeta (venta,
//                                            detalle, stock y kárdex) + bitácora
// La venta SOLO se registra cuando Stripe confirma el pago.
// ===========================================================================

/** Lo que el CU09 usa de PasarelaPago (backend/pagos/pasarela-pago.ts) */
export interface PasarelaPagoVenta {
  crearSesionPago(p: {
    montoBs: number;
    descripcion: string;
    urlRetorno: string;
    urlCancelacion: string;
    metadata: Record<string, string>;
    /** Evita el cobro doble: misma clave = misma sesión de Stripe */
    claveIdempotencia?: string;
  }): Promise<{ sessionId: string; url: string; montoUsd: number }>;
  verificarPago(sessionId: string): Promise<{ pagado: boolean; sessionId: string; metadata: Record<string, string>; montoUsd: number }>;
}

// El carrito viaja en la metadata del pago (Stripe: máx. 500 caracteres por valor)
const TROZO_METADATA = 450;
function itemsAMetadata(items: { productoId: number; cantidad: number }[]): Record<string, string> {
  const json = JSON.stringify(items.map((i) => [i.productoId, i.cantidad]));
  const meta: Record<string, string> = {};
  for (let i = 0, k = 0; i < json.length; i += TROZO_METADATA, k++) meta[`items_${k}`] = json.slice(i, i + TROZO_METADATA);
  return meta;
}
function itemsDeMetadata(meta: Record<string, string>): { producto_id: number; cantidad: number }[] {
  let json = '';
  for (let k = 0; meta[`items_${k}`] !== undefined; k++) json += meta[`items_${k}`];
  const arr = JSON.parse(json) as [number, number][];
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('sin ítems');
  return arr.map(([p, c]) => ({ producto_id: Number(p), cantidad: Number(c) }));
}

/**
 * iniciarPagoTarjeta(datosVentaDTO): valida caja, cliente, stock y totales
 * con los precios vigentes, y crea el cobro en Stripe. Devuelve el enlace.
 */
export async function iniciarPagoTarjeta(
  db: Db,
  pasarela: PasarelaPagoVenta,
  datosVentaDTO: DatosVentaDTO,
  urlBase: string
): Promise<{ url: string }> {
  const datos = validar(registrarVentaSchema, datosVentaDTO);
  if (datos.tipoPago !== 'TARJETA') throw new VentaError('Este cobro es solo para pago con tarjeta');
  const { usuarioId } = datosVentaDTO;

  if (!(await verificarCajaAbierta(db, usuarioId))) throw new VentaError(MENSAJES.SIN_CAJA);
  const clienteId = datos.clienteId ?? (await buscarClienteMostrador(db));
  if (!clienteId) throw new VentaError('Seleccione un cliente para la venta');

  // Totales con precios y stock vigentes (la BD vuelve a calcular al registrar)
  const cantidades = new Map<number, number>();
  for (const it of datos.items) cantidades.set(it.productoId, r2((cantidades.get(it.productoId) ?? 0) + it.cantidad));
  const { data, error } = await db
    .from('producto')
    .select('id, nombre, stock_disponible, precio_compra_actual, margen_ganancia')
    .in('id', [...cantidades.keys()]);
  if (error) throw errorBD(error, 'No se pudieron leer los productos');
  const productos = new Map(((data ?? []) as any[]).map((p) => [p.id as number, p]));

  let subtotal = 0;
  for (const [id, cantidad] of cantidades) {
    const p = productos.get(id);
    if (!p) throw new VentaError(`El producto ${id} no existe`);
    if (num(p.stock_disponible) < cantidad) {
      throw new VentaError(`Stock insuficiente para "${p.nombre}": disponible ${num(p.stock_disponible)}, solicitado ${cantidad}`);
    }
    subtotal = r2(subtotal + r2(calcularPrecioVenta(p) * cantidad));
  }
  const { descuento, total } = calcularTotalesYDescuentos([{ precioUnitario: subtotal, cantidad: 1 }], datos.descuento);
  if (total <= 0) throw new VentaError('El total debe ser mayor a 0 para cobrar con tarjeta');

  const sesion = await pasarela.crearSesionPago({
    montoBs: total,
    descripcion: `Venta en mostrador SgarNet (${cantidades.size} producto(s))`,
    urlRetorno: `${urlBase}/ventas?pago=exito`,
    urlCancelacion: `${urlBase}/ventas?pago=cancelado`,
    metadata: {
      tipo: 'VENTA',
      usuario_id: String(usuarioId),
      cliente_id: String(clienteId),
      tipo_comprobante: datos.tipoComprobante,
      descuento: descuento.toFixed(2),
      total_bs: total.toFixed(2),
      ...itemsAMetadata(datos.items),
    },
  });
  return { url: sesion.url };
}

/**
 * confirmarPagoTarjeta(sessionId): al volver de Stripe verifica el pago y
 * registra la venta con tipo_pago TARJETA (una sola vez por pago).
 */
export async function confirmarPagoTarjeta(
  db: Db,
  pasarela: PasarelaPagoVenta,
  params: { sessionId: string; usuarioId: number; ip?: string | null }
): Promise<{ comprobante: ComprobanteVenta; yaRegistrada: boolean }> {
  const pago = await pasarela.verificarPago(params.sessionId);
  if (!pago.pagado) throw new VentaError('El pago con tarjeta no fue confirmado. La venta no se registró.');
  const m = pago.metadata;
  if (m.tipo !== 'VENTA') throw new VentaError('El pago no corresponde a una venta');
  if (Number(m.usuario_id) !== params.usuarioId) throw new VentaError('El pago fue iniciado por otro usuario');

  let items: { producto_id: number; cantidad: number }[];
  try {
    items = itemsDeMetadata(m);
  } catch {
    throw new VentaError('No se pudo leer el detalle de la venta pagada');
  }

  const { data: rpc, error } = await db.rpc('fn_registrar_venta_tarjeta', {
    p_session_id: pago.sessionId,
    p_monto_pagado: Number(m.total_bs),
    p_usuario_id: params.usuarioId,
    p_cliente_id: Number(m.cliente_id),
    p_tipo_comprobante: m.tipo_comprobante,
    p_descuento: Number(m.descuento),
    p_items: items,
  } as any);
  if (error || !rpc) throw errorBD(error, 'No se pudo registrar la venta pagada con tarjeta');

  const r = rpc as any;
  const comprobante: ComprobanteVenta = {
    ventaId: r.id,
    nroComprobante: r.nro_comprobante,
    subtotal: num(r.subtotal),
    descuento: num(r.descuento),
    total: num(r.total),
    tipoPago: 'TARJETA',
    tipoComprobante: m.tipo_comprobante as TipoComprobante,
  };
  if (!r.ya_registrada) {
    await guardarEventoCaja(
      db,
      params.usuarioId,
      'REGISTRO_VENTA',
      `${await describirVenta(db, comprobante)} · Stripe ${pago.sessionId}`,
      params.ip ?? null
    );
  }
  return { comprobante, yaRegistrada: !!r.ya_registrada };
}
