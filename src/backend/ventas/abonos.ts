/**
 * CU09 — Subflujo "Registrar abono a orden de trabajo"
 *
 * Un abono es un pago parcial del cliente sobre una orden de trabajo que
 * todavía no se liquidó. Se guarda como VENTA con tipo_comprobante
 * 'RECIBO_ABONO', ligada a la orden y a la caja abierta, SIN detalle de
 * productos (no mueve stock). Por eso entra solo al arqueo del turno.
 * La liquidación (CU13) los suma y los descuenta automáticamente.
 *
 * Con tarjeta (Stripe) el abono SOLO se registra después de verificar el
 * pago con Stripe, y fn_registrar_abono es idempotente por stripe_session_id:
 * el mismo pago no genera dos recibos. Al crear la sesión se usa una clave
 * de idempotencia para que un doble clic no abra dos cobros.
 *
 * No modifica tablas: usa las funciones de
 * db/migrations/migracion_cu09_cu13_abonos.sql
 *   fn_ordenes_para_abono()  ·  fn_registrar_abono(...)
 */
import type { Db } from './types';
import type { PasarelaPagoVenta } from './service';

export const METODOS_ABONO = ['EFECTIVO', 'QR', 'TRANSFERENCIA'] as const;
export type MetodoAbono = (typeof METODOS_ABONO)[number];

/** Orden que puede recibir abonos (no cancelada y sin nota de servicio) */
export interface OrdenParaAbono {
  orden_id: number;
  codigo_orden: string;
  tipo_trabajo: string;
  estado: string;
  cliente_nombre: string | null;
  numero_cotizacion: string | null;
  /** Total de la cotización (null si es correctiva sin cotización) */
  monto_pactado: number | null;
  /** Anticipo registrado al aprobar la cotización (CU08) */
  anticipo: number;
  total_abonado: number;
  /** Lo que todavía se puede abonar sin superar lo pactado (null = sin tope) */
  maximo_abono: number | null;
}

export interface RegistrarAbonoInput {
  usuarioId: number;
  ordenId: number;
  monto: number;
  tipoPago: string;
  referencia?: string | null;
  ip?: string | null;
}

export interface ReciboAbono {
  id: number;
  nro_comprobante: string;
  orden: string;
  monto: number;
  total_abonado: number;
  monto_pactado: number | null;
  /** true si el pago con tarjeta ya estaba registrado (confirmación repetida) */
  ya_registrado: boolean;
}

export class AbonoError extends Error {
  constructor(m: string) {
    super(m);
    this.name = 'AbonoError';
  }
}

const n = (v: unknown) => (v == null || v === '' ? 0 : Number(v));
const r2 = (x: number) => Math.round(x * 100) / 100;

function errorAbono(error: any, porDefecto: string): AbonoError {
  const msg: string = error?.message ?? '';
  if (error?.code === 'PGRST202' || /Could not find the function/i.test(msg)) {
    return new AbonoError(
      'Falta ejecutar db/migrations/migracion_cu09_cu13_abonos.sql en Supabase (SQL Editor).'
    );
  }
  if (/ux_venta_nro_comprobante/.test(msg)) return new AbonoError('Conflicto de correlativo, intente nuevamente');
  if (msg) return new AbonoError(msg);
  return new AbonoError(porDefecto);
}

/** Validación previa (la base vuelve a validar todo dentro de la transacción) */
export function validarAbono(input: RegistrarAbonoInput, orden?: OrdenParaAbono | null): void {
  if (!Number.isInteger(input.ordenId) || input.ordenId <= 0) throw new AbonoError('Seleccione una orden de trabajo.');
  if (!Number.isFinite(input.monto) || input.monto <= 0) throw new AbonoError('El monto del abono debe ser mayor a 0.');
  const metodo = String(input.tipoPago ?? '').toUpperCase();
  if (!(METODOS_ABONO as readonly string[]).includes(metodo)) {
    throw new AbonoError('Método de pago inválido: use Efectivo, QR o Transferencia.');
  }
  if (metodo === 'TRANSFERENCIA' && !String(input.referencia ?? '').trim()) {
    throw new AbonoError('Ingrese el número de referencia de la transferencia.');
  }
  if (orden?.maximo_abono != null && r2(input.monto) > orden.maximo_abono) {
    throw new AbonoError(`El abono supera el monto pactado: máximo ${orden.maximo_abono.toFixed(2)} Bs.`);
  }
}

/** Órdenes que pueden recibir abonos */
export async function listarOrdenesParaAbono(db: Db): Promise<OrdenParaAbono[]> {
  const { data, error } = await db.rpc('fn_ordenes_para_abono');
  if (error) throw errorAbono(error, 'No se pudieron cargar las órdenes de trabajo');
  return ((data ?? []) as any[]).map((o) => {
    const pactado = o.monto_pactado == null ? null : n(o.monto_pactado);
    const anticipo = n(o.anticipo);
    const abonado = n(o.total_abonado);
    return {
      orden_id: o.orden_id,
      codigo_orden: o.codigo_orden,
      tipo_trabajo: o.tipo_trabajo,
      estado: o.estado,
      cliente_nombre: o.cliente_nombre ?? null,
      numero_cotizacion: o.numero_cotizacion ?? null,
      monto_pactado: pactado,
      anticipo,
      total_abonado: abonado,
      maximo_abono: pactado == null ? null : Math.max(0, r2(pactado - anticipo - abonado)),
    };
  });
}

/** registrarAbono — recibo RECIBO_ABONO en la caja abierta + bitácora (una transacción) */
export async function registrarAbono(db: Db, input: RegistrarAbonoInput): Promise<ReciboAbono> {
  validarAbono(input);
  const { data, error } = await db.rpc('fn_registrar_abono', {
    p_usuario_id: input.usuarioId,
    p_orden_id: input.ordenId,
    p_monto: r2(input.monto),
    p_tipo_pago: String(input.tipoPago).toUpperCase(),
    p_referencia: input.referencia?.trim() || null,
    p_ip: input.ip ?? null,
  });
  if (error) throw errorAbono(error, 'No se pudo registrar el abono');
  return mapRecibo(data);
}

function mapRecibo(data: unknown): ReciboAbono {
  const d = data as any;
  return {
    id: d.id,
    nro_comprobante: d.nro_comprobante,
    orden: d.orden,
    monto: n(d.monto),
    total_abonado: n(d.total_abonado),
    monto_pactado: d.monto_pactado == null ? null : n(d.monto_pactado),
    ya_registrado: Boolean(d.ya_registrado),
  };
}

// ===========================================================================
// Abono con tarjeta (Stripe)
//   iniciarAbonoTarjeta  -> valida orden, tope y caja -> PasarelaPago.crearSesionPago
//   confirmarAbonoTarjeta -> PasarelaPago.verificarPago -> fn_registrar_abono(session)
// ===========================================================================

/** Crea el cobro en Stripe para un abono. Devuelve el enlace de la página de pago. */
export async function iniciarAbonoTarjeta(
  db: Db,
  pasarela: PasarelaPagoVenta,
  params: { usuarioId: number; ordenId: number; monto: number; intento: string; urlBase: string; cajaAbierta: boolean },
): Promise<{ url: string }> {
  if (!params.cajaAbierta) throw new AbonoError('Debe abrir un turno de caja antes de registrar el cobro.');
  const ordenes = await listarOrdenesParaAbono(db);
  const orden = ordenes.find((o) => o.orden_id === params.ordenId) ?? null;
  if (!orden) throw new AbonoError('La orden no admite abonos (no existe, está cancelada o ya fue liquidada).');
  validarAbono({ usuarioId: params.usuarioId, ordenId: params.ordenId, monto: params.monto, tipoPago: 'EFECTIVO' }, orden);
  const intento = String(params.intento ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40);
  if (intento.length < 8) throw new AbonoError('Intento de pago no válido. Vuelva a abrir el formulario.');

  const monto = r2(params.monto);
  const sesion = await pasarela.crearSesionPago({
    montoBs: monto,
    descripcion: `Abono a la orden ${orden.codigo_orden} - SgarNet`,
    urlRetorno: `${params.urlBase}/ventas?abono=exito`,
    urlCancelacion: `${params.urlBase}/ventas?abono=cancelado`,
    metadata: {
      tipo: 'ABONO_ORDEN',
      orden_id: String(orden.orden_id),
      codigo_orden: orden.codigo_orden,
      monto_bs: monto.toFixed(2),
      usuario_id: String(params.usuarioId),
    },
    // Mismo formulario + mismo monto = misma sesión (un doble clic no crea dos cobros)
    claveIdempotencia: `abono-${orden.orden_id}-${monto.toFixed(2)}-${intento}`,
  });
  return { url: sesion.url };
}

/** Al volver de Stripe: verifica el pago y registra el recibo (una sola vez). */
export async function confirmarAbonoTarjeta(
  db: Db,
  pasarela: PasarelaPagoVenta,
  params: { sessionId: string; usuarioId: number; ip?: string | null },
): Promise<ReciboAbono> {
  const pago = await pasarela.verificarPago(params.sessionId);
  if (!pago.pagado) throw new AbonoError('El pago con tarjeta no fue confirmado. El abono no se registró.');
  const m = pago.metadata;
  if (m.tipo !== 'ABONO_ORDEN') throw new AbonoError('El pago no corresponde a un abono de orden de trabajo.');
  if (Number(m.usuario_id) !== params.usuarioId) throw new AbonoError('El pago fue iniciado por otro usuario.');

  const { data, error } = await db.rpc('fn_registrar_abono', {
    p_usuario_id: params.usuarioId,
    p_orden_id: Number(m.orden_id),
    p_monto: Number(m.monto_bs),
    p_tipo_pago: 'TARJETA',
    p_referencia: null,
    p_ip: params.ip ?? null,
    p_session_id: pago.sessionId,
  });
  if (error) throw errorAbono(error, 'No se pudo registrar el abono pagado con tarjeta');
  return mapRecibo(data);
}
