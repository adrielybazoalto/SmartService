// =====================================================================
//  CU13 - Reglas de negocio (funciones puras, sin base de datos)
// =====================================================================

import { ErrorNegocio, MENSAJES } from "./errores";
import {
  ESTADOS_ORDEN_TERMINADA,
  METODOS_PAGO_MANUAL,
  type MetodoPagoManual,
  type NotaServicio,
  type OrdenPendienteLiquidar,
} from "./types";

type OrdenConNota = OrdenPendienteLiquidar & { tieneNota: boolean };

/** Excepción del CU13: solo órdenes terminadas (FINALIZADA) y sin nota emitida. */
export function verificarOrdenLiquidable(orden: OrdenConNota | null): OrdenPendienteLiquidar {
  if (!orden) throw new ErrorNegocio(MENSAJES.ORDEN_NO_EXISTE);
  if (!ESTADOS_ORDEN_TERMINADA.includes(orden.estado.toUpperCase())) {
    throw new ErrorNegocio(MENSAJES.ORDEN_NO_FINALIZADA);
  }
  if (orden.tieneNota) throw new ErrorNegocio(MENSAJES.ORDEN_CON_NOTA(orden.codigo_orden));
  return {
    id: orden.id,
    codigo_orden: orden.codigo_orden,
    tipo_trabajo: orden.tipo_trabajo,
    estado: orden.estado,
    fecha_inicio_real: orden.fecha_inicio_real,
    fecha_fin_real: orden.fecha_fin_real,
    horas_trabajadas: orden.horas_trabajadas,
    cotizacion_id: orden.cotizacion_id,
    numero_cotizacion: orden.numero_cotizacion,
    cliente_nombre: orden.cliente_nombre,
    anticipo_cotizacion: orden.anticipo_cotizacion,
    total_cotizacion: orden.total_cotizacion,
  };
}

/** Orden correctiva (sin cotización): el Encargado debe elegir el servicio. */
export function requiereElegirServicio(orden: OrdenPendienteLiquidar): boolean {
  return orden.cotizacion_id === null;
}

/**
 * Orden sin cotización: el anticipo manual debe ser >= 0 y, sumado a los
 * abonos registrados en caja, no puede superar el monto total.
 */
export function validarAnticipo(anticipo: number, total: number, abonos = 0): void {
  if (!Number.isFinite(anticipo) || anticipo < 0) throw new ErrorNegocio(MENSAJES.ANTICIPO_INVALIDO);
  if (Math.round((anticipo + abonos) * 100) > Math.round(total * 100)) {
    throw new ErrorNegocio(MENSAJES.ANTICIPO_MAYOR_TOTAL);
  }
}

/**
 * Pagos a cuenta aplicados a la nota (mismo cálculo que sp_emitir_nota_servicio):
 * anticipo + abonos, hasta el total. El excedente es saldo a favor del cliente.
 */
export function calcularPagosACuenta(
  anticipo: number,
  abonos: number,
  total: number,
): { aplicado: number; excedente: number; saldo: number } {
  const pagado = Math.round((anticipo + abonos) * 100) / 100;
  const aplicado = Math.min(pagado, total);
  return {
    aplicado,
    excedente: Math.round((pagado - aplicado) * 100) / 100,
    saldo: Math.round((total - aplicado) * 100) / 100,
  };
}

/** Cobro con tarjeta: la nota debe estar PENDIENTE y tener saldo. Devuelve el saldo. */
export function verificarNotaCobrable(nota: NotaServicio | null): number {
  if (!nota) throw new ErrorNegocio(MENSAJES.NOTA_NO_EXISTE);
  if (nota.estado.toUpperCase() !== "PENDIENTE") throw new ErrorNegocio(MENSAJES.NOTA_NO_PENDIENTE(nota.numero_nota));
  const saldo = calcularSaldo(nota.monto_total, nota.anticipo_pagado);
  if (saldo <= 0) throw new ErrorNegocio(MENSAJES.SIN_SALDO);
  return saldo;
}

/** Pago manual del saldo: método válido y referencia en TRANSFERENCIA. */
export function validarPagoManual(metodo: string, referencia: string | null): { metodo: MetodoPagoManual; referencia: string | null } {
  const m = String(metodo ?? "").toUpperCase() as MetodoPagoManual;
  if (!METODOS_PAGO_MANUAL.includes(m)) throw new ErrorNegocio(MENSAJES.METODO_INVALIDO);
  const ref = (referencia ?? "").trim().slice(0, 60) || null;
  if (m === "TRANSFERENCIA" && !ref) throw new ErrorNegocio(MENSAJES.FALTA_REFERENCIA);
  return { metodo: m, referencia: m === "TRANSFERENCIA" ? ref : null };
}

/** Paso 5 del flujo principal: saldo = total - anticipo. */
export function calcularSaldo(total: number, anticipo: number): number {
  return Math.round((total - anticipo) * 100) / 100;
}
