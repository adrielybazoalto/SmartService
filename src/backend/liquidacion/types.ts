// =====================================================================
//  CU13 - Emitir Notas de Servicio y Liquidación Operativa
//  MODELO: tipos de las entidades que participan en el caso de uso
//  (mismos nombres y atributos del diagrama de análisis y de Supabase)
// =====================================================================

/**
 * Estados con los que el CU12 deja una orden terminada.
 * El CU12 del proyecto usa "COMPLETADA"; se acepta también "FINALIZADA".
 */
export const ESTADOS_ORDEN_TERMINADA = ["COMPLETADA", "FINALIZADA"];

/** Tabla orden_trabajo (solo los atributos que usa el CU13). */
export interface OrdenTrabajo {
  id: number;
  codigo_orden: string;
  tipo_trabajo: string;
  estado: string;
  fecha_inicio_real: string | null;
  fecha_fin_real: string | null;
  /** Calculado: fecha_fin_real - fecha_inicio_real, en horas. */
  horas_trabajadas: number;
  cotizacion_id: number | null;
}

/** Orden finalizada sin nota, con datos del cliente para el listado. */
export interface OrdenPendienteLiquidar extends OrdenTrabajo {
  numero_cotizacion: string | null;
  cliente_nombre: string | null;
}

/** Tabla detalle_consumo_material + producto (materiales usados en campo). */
export interface MaterialConsumido {
  id: number;
  producto_id: number;
  producto_nombre: string;
  cantidad_utilizada: number;
  precio_venta: number; // precio_compra_actual * (1 + margen_ganancia / 100)
  subtotal: number;
}

/** Tabla servicio (para elegir tarifa en órdenes correctivas). */
export interface Servicio {
  id: number;
  nombre: string;
  precio_hora_base: number;
}

/** Resultado de fn_calcular_liquidacion. */
export interface CalculoLiquidacion {
  costo_materiales: number;
  horas_trabajadas: number;
  tarifa_hora: number;
  costo_mano_obra: number;
  total_liquidacion: number;
}

/** Todo lo que muestra UI_Liquidacion. */
export interface DetalleLiquidacion {
  orden: OrdenPendienteLiquidar;
  materiales: MaterialConsumido[];
  calculo: CalculoLiquidacion;
  requiereServicio: boolean; // orden correctiva sin cotización
  servicios: Servicio[];
}

/** Tabla nota_servicio. */
export interface NotaServicio {
  id: number;
  orden_trabajo_id: number;
  numero_nota: string;
  anticipo_pagado: number;
  fecha_emision: string;
  estado: string;
  monto_total: number;
}

/** Datos que envía UI_Liquidacion al confirmar la emisión. */
export interface EmitirNotaInput {
  ordenTrabajoId: number;
  anticipo: number;
  servicioId?: number | null;
}

/** Usuario de la sesión actual (tabla usuario + rol). */
export interface UsuarioSesion {
  id: number;
  nombre: string;
  rol: string | null;
  activo: boolean;
}

/** Respuesta estándar de las Server Actions. */
export type ResultadoAccion<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };
