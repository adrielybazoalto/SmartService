/**
 * CU09 — Gestionar Ventas y Arqueo de Caja · Tipos del dominio
 *
 * Las entidades reflejan el DDL del documento (CAJA, VENTA, DETALLE_VENTA,
 * MOVIMIENTO_KARDEX, PRODUCTO, BITACORA). Los campos con `?` los agrega la
 * migración del CU09. Alcance acordado: la venta es SOLO de productos.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Cliente de Supabase que reciben todas las funciones del servicio */
export type Db = SupabaseClient<any, 'public', any>;

// ===========================================================================
// Enumeraciones del caso de uso
// ===========================================================================
export const TIPOS_PAGO = ['EFECTIVO', 'QR', 'TARJETA', 'TRANSFERENCIA'] as const;
export type TipoPago = (typeof TIPOS_PAGO)[number];

/** La empresa no emite factura: solo nota de venta o recibo */
export const TIPOS_COMPROBANTE = ['NOTA_VENTA', 'RECIBO'] as const;
export type TipoComprobante = (typeof TIPOS_COMPROBANTE)[number];

export type EstadoCaja = 'ABIERTA' | 'CERRADA';
export type EstadoVenta = 'EMITIDA' | 'ANULADA';
export type TipoMovimientoKardex = 'ENTRADA' | 'SALIDA' | 'AJUSTE';

/** Acciones que el CU09 registra en la bitácora */
export type AccionCaja = 'APERTURA_CAJA' | 'REGISTRO_VENTA' | 'ANULAR_VENTA' | 'ARQUEO_CAJA';

// ===========================================================================
// Entidades (filas de las tablas)
// ===========================================================================

/** Tabla CAJA */
export interface Caja {
  id: number;
  usuario_id: number;
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_inicial: number;
  /** Efectivo esperado calculado por el sistema */
  monto_final_sistema: number | null;
  /** Efectivo contado físicamente */
  monto_final_real: number | null;
  /** monto_final_real − monto_final_sistema (+ sobrante / − faltante) */
  monto_diferencia?: number | null;
  observacion?: string | null;
  estado: EstadoCaja | string;
}

/** Tabla VENTA */
export interface Venta {
  id: number;
  caja_id: number;
  cliente_id: number;
  usuario_id: number;
  cotizacion_id: number | null;
  orden_trabajo_id: number | null;
  tipo_comprobante: string | null;
  nro_comprobante: string | null;
  fecha_emision: string;
  subtotal: number;
  descuento: number;
  total: number;
  estado: EstadoVenta | string;
  tipo_pago?: TipoPago | null;
}

/** Tabla DETALLE_VENTA: cada línea es un producto */
export interface DetalleVenta {
  id: number;
  venta_id: number;
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

/** Tabla MOVIMIENTO_KARDEX */
export interface MovimientoKardex {
  id: number;
  producto_id: number;
  usuario_id: number;
  tipo_movimiento: TipoMovimientoKardex | string;
  cantidad: number;
  stock_anterior: number;
  origen_movimiento: string | null;
  fecha_movimiento: string;
  observacion: string | null;
}

/** Tabla BITACORA (la escribe la función común del CU06) */
export interface Bitacora {
  id: number;
  usuario_id: number;
  fecha_hora: string;
  accion: string;
  descripcion: string | null;
  ip_origen?: string | null;
}

// ===========================================================================
// DTOs
// ===========================================================================

/** cajaDTO → procesarAperturaOArqueo(). La IP no viaja: la toma la bitácora común. */
export type CajaDTO =
  | { tipo: 'APERTURA'; usuarioId: number; montoInicial: number }
  | {
      tipo: 'ARQUEO';
      usuarioId: number;
      montoReal: number;
      observacion?: string;
      /** Caja a cerrar; si se indica y es de otro usuario, se rechaza */
      cajaId?: number;
    };

/** Ítem que llega desde la IU: un producto con su cantidad */
export interface ItemVentaDTO {
  productoId: number;
  /** Unidades del producto (hasta 2 decimales, p. ej. metros de cable) */
  cantidad: number;
}

/** datosVentaDTO → registrarVentaDirecta() */
export interface DatosVentaDTO {
  usuarioId: number;
  clienteId?: number | null;
  tipoPago: TipoPago;
  tipoComprobante: TipoComprobante;
  descuento?: number;
  items: ItemVentaDTO[];
}

/** Resultado de calcularTotalesYDescuentos() */
export interface TotalesVenta {
  subtotal: number;
  descuento: number;
  total: number;
}

/** retornarComprobante(ventaId, nroComprobante) */
export interface ComprobanteVenta extends TotalesVenta {
  ventaId: number;
  nroComprobante: string;
  tipoPago: TipoPago;
  tipoComprobante: TipoComprobante;
}

// ===========================================================================
// Modelos de lectura para la vista
// ===========================================================================
export interface ProductoVenta {
  id: number;
  nombre: string;
  unidad_medida: string | null;
  stock_disponible: number;
  stock_minimo: number;
  precio_venta: number;
  /** Imagen principal (IMAGEN_PRODUCTO), solo lectura; se administra en el catálogo */
  imagen_url: string | null;
}

/** Cliente asociado a la venta (venta.cliente_id). Solo lectura en el CU09. */
export interface ClienteVenta {
  id: number;
  /** Nombre visible: razon_social o, si no tiene, nombre */
  razon_social: string;
  nombre: string | null;
  documento_identidad: string | null;
}

export interface VentaResumen {
  id: number;
  nro_comprobante: string | null;
  fecha_emision: string;
  cliente_nombre: string;
  tipo_pago: TipoPago;
  tipo_comprobante: string | null;
  subtotal: number;
  descuento: number;
  total: number;
  estado: string;
  items: number;
}

/** mostrarResumenArqueo(diferencia) */
export interface ResumenArqueo {
  caja: Caja;
  totales_por_pago: Record<TipoPago, number>;
  cantidad_ventas: number;
  cantidad_anuladas: number;
  total_vendido: number;
  /** fondo inicial + ventas EMITIDAS en EFECTIVO */
  efectivo_esperado: number;
}

/** Resultado de procesarAperturaOArqueo() */
export interface ResultadoCaja {
  caja: Caja;
  /** Solo en el arqueo/cierre */
  resumen?: ResumenArqueo;
  diferencia?: number;
}

export interface DatosVentas {
  usuario: { id: number; nombre: string; esAdmin: boolean };
  caja: Caja | null;
  resumen: ResumenArqueo | null;
  ventas: VentaResumen[];
  productos: ProductoVenta[];
  clientes: ClienteVenta[];
  cliente_mostrador_id: number | null;
}

/** Datos de la nota de venta en PDF (paso 8) */
export interface NotaVenta {
  id: number;
  nro_comprobante: string;
  tipo_comprobante: string | null;
  fecha_emision: string;
  estado: string;
  tipo_pago: TipoPago;
  caja_id: number;
  usuario_id: number;
  cajero: string;
  cliente: { nombre: string; documento: string | null };
  items: {
    descripcion: string;
    unidad: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
  }[];
  subtotal: number;
  descuento: number;
  total: number;
}

/** Respuesta uniforme de las Server Actions */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; mensaje: string }
  | { ok: false; error: string };
