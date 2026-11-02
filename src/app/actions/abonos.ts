'use server';

/**
 * CU09 — Subflujo "Registrar abono a orden de trabajo" · Server Actions
 * Mismas reglas que app/actions/ventas.ts: el usuario sale de la sesión
 * (CU01), se exige el permiso del módulo VENTAS en ROL_FUNCION y la IP va a
 * la bitácora (CU06).
 */
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { obtenerIpOrigen } from '@/lib/ip';
import { tieneAccionModulo, type AccionPermiso } from '@/lib/permisos';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { ErrorPago, PasarelaPago, obtenerUrlBase } from '@/backend/pagos/pasarela-pago';
import {
  AbonoError,
  confirmarAbonoTarjeta,
  iniciarAbonoTarjeta,
  listarOrdenesParaAbono,
  registrarAbono,
  type OrdenParaAbono,
  type ReciboAbono,
} from '@/backend/ventas/abonos';
import { verificarCajaAbierta } from '@/backend/ventas/service';
import type { Db } from '@/backend/ventas/types';

type Respuesta<T> = { ok: true; data: T; mensaje: string } | { ok: false; error: string };

async function contexto(accion: AccionPermiso = 'LEER') {
  const u = (await getCurrentUser()) as any;
  const id = Number(u?.id ?? u?.uid);
  if (!u || !Number.isInteger(id) || id <= 0) throw new AbonoError('Sesión expirada. Vuelva a iniciar sesión.');
  if (!(await tieneAccionModulo('VENTAS', accion))) {
    throw new AbonoError('No autorizado: tu rol no tiene el permiso de este módulo.');
  }
  let ip: string | null = null;
  try {
    ip = await obtenerIpOrigen();
  } catch {
    ip = null;
  }
  return { db: getSupabaseServiceClient() as unknown as Db, usuarioId: id, ip };
}

function falla(e: unknown, porDefecto: string) {
  if (e instanceof AbonoError || e instanceof ErrorPago) return { ok: false as const, error: e.message };
  console.error('[CU09 abonos]', e);
  return { ok: false as const, error: porDefecto };
}

const mensajeRecibo = (r: ReciboAbono) =>
  r.ya_registrado
    ? `El pago ya estaba registrado: recibo ${r.nro_comprobante}.`
    : `Abono registrado: recibo ${r.nro_comprobante} para la orden ${r.orden}.`;

/** Órdenes de trabajo que pueden recibir abonos */
export async function listarOrdenesAbonoAction(): Promise<Respuesta<OrdenParaAbono[]>> {
  try {
    const { db } = await contexto('LEER');
    return { ok: true, data: await listarOrdenesParaAbono(db), mensaje: '' };
  } catch (e) {
    return falla(e, 'No se pudieron cargar las órdenes de trabajo');
  }
}

/** Abono en EFECTIVO / QR / TRANSFERENCIA: recibo en la caja abierta (entra al arqueo) */
export async function registrarAbonoAction(datos: {
  ordenId: number;
  monto: number;
  tipoPago: string;
  referencia?: string | null;
}): Promise<Respuesta<ReciboAbono>> {
  try {
    const { db, usuarioId, ip } = await contexto('CREAR');
    const recibo = await registrarAbono(db, {
      usuarioId,
      ordenId: Number(datos?.ordenId),
      monto: Number(datos?.monto),
      tipoPago: String(datos?.tipoPago ?? ''),
      referencia: datos?.referencia ?? null,
      ip,
    });
    revalidatePath('/ventas');
    return { ok: true, data: recibo, mensaje: mensajeRecibo(recibo) };
  } catch (e) {
    return falla(e, 'No se pudo registrar el abono');
  }
}

/** Abono con tarjeta: crea el cobro en Stripe y devuelve el enlace de pago */
export async function iniciarAbonoTarjetaAction(datos: {
  ordenId: number;
  monto: number;
  intento: string;
}): Promise<Respuesta<{ url: string }>> {
  try {
    const { db, usuarioId } = await contexto('CREAR');
    const caja = await verificarCajaAbierta(db, usuarioId);
    const r = await iniciarAbonoTarjeta(db, new PasarelaPago(), {
      usuarioId,
      ordenId: Number(datos?.ordenId),
      monto: Number(datos?.monto),
      intento: String(datos?.intento ?? ''),
      urlBase: await obtenerUrlBase(),
      cajaAbierta: !!caja,
    });
    return { ok: true, data: r, mensaje: '' };
  } catch (e) {
    return falla(e, 'No se pudo iniciar el pago con tarjeta');
  }
}

/** Al volver de Stripe: verifica el pago y registra el recibo (idempotente) */
export async function confirmarAbonoTarjetaAction(sessionId: string): Promise<Respuesta<ReciboAbono>> {
  try {
    const { db, usuarioId, ip } = await contexto('CREAR');
    const recibo = await confirmarAbonoTarjeta(db, new PasarelaPago(), { sessionId: String(sessionId), usuarioId, ip });
    revalidatePath('/ventas');
    return { ok: true, data: recibo, mensaje: mensajeRecibo(recibo) };
  } catch (e) {
    return falla(e, 'No se pudo confirmar el pago con tarjeta');
  }
}
