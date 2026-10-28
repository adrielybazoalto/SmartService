// =====================================================================
//  CU13 - Reglas de negocio (funciones puras, sin base de datos)
// =====================================================================

import { ErrorNegocio, MENSAJES } from "./errores";
import { ESTADO_ORDEN_FINALIZADA, type OrdenPendienteLiquidar } from "./types";

type OrdenConNota = OrdenPendienteLiquidar & { tieneNota: boolean };

/** Excepción del CU13: solo órdenes FINALIZADAS y sin nota emitida. */
export function verificarOrdenLiquidable(orden: OrdenConNota | null): OrdenPendienteLiquidar {
  if (!orden) throw new ErrorNegocio(MENSAJES.ORDEN_NO_EXISTE);
  if (orden.estado.toUpperCase() !== ESTADO_ORDEN_FINALIZADA) {
    throw new ErrorNegocio(MENSAJES.ORDEN_NO_FINALIZADA);
  }
  if (orden.tieneNota) throw new ErrorNegocio(MENSAJES.ORDEN_CON_NOTA(orden.codigo_orden));
  return {
    id: orden.id,
    codigo_orden: orden.codigo_orden,
    tipo_trabajo: orden.tipo_trabajo,
    estado: orden.estado,
    fecha_inicio_real: orden.fecha_inicio_real,
    horas_fin_real: orden.horas_fin_real,
    cotizacion_id: orden.cotizacion_id,
    numero_cotizacion: orden.numero_cotizacion,
    cliente_nombre: orden.cliente_nombre,
  };
}

/** Orden correctiva (sin cotización): el Encargado debe elegir el servicio. */
export function requiereElegirServicio(orden: OrdenPendienteLiquidar): boolean {
  return orden.cotizacion_id === null;
}

/** El anticipo debe estar entre 0 y el monto total. */
export function validarAnticipo(anticipo: number, total: number): void {
  if (!Number.isFinite(anticipo) || anticipo < 0) throw new ErrorNegocio(MENSAJES.ANTICIPO_INVALIDO);
  if (anticipo > total) throw new ErrorNegocio(MENSAJES.ANTICIPO_MAYOR_TOTAL);
}

/** Paso 5 del flujo principal: saldo = total - anticipo. */
export function calcularSaldo(total: number, anticipo: number): number {
  return Math.round((total - anticipo) * 100) / 100;
}
