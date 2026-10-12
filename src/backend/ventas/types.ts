/**
 * CU09 — Gestionar Ventas y Arqueo de Caja · Tipos del dominio
 *
 * Las interfaces de entidad reflejan 1:1 las tablas del diccionario de datos
 * (Tablas 21 VENTA, 22 CAJA, 23 DETALLE_VENTA, 16 MOVIMIENTO_KARDEX,
 * BITACORA y PRODUCTO). Las columnas marcadas con `?` son las que agrega la
 * migración 20261010_cu09_cu14.sql y pueden no existir todavía en Supabase.
 *
 * Si generas los tipos con `supabase gen types typescript`, puedes reemplazar
 * `Db` por `SupabaseClient<Database>` y cada interfaz por
 * `Database['public']['Tables']['caja']['Row']`, etc.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Cliente de Supabase que reciben todas las funciones del servicio */
export type Db = SupabaseClient<any, 'public', any>;

// ===========================================================================
// Enumeraciones del caso de uso
// ===========================================================================
export const TIPOS_PAGO = ['EFECTIVO', 'QR', 'TARJETA', 'TRANSFERENCIA'] as const;
export type TipoPago = (typeof TIPOS_PAGO)[number];

export const TIPOS_COMPROBANTE = ['NOTA_VENTA', 'RECIBO', 'FACTURA'] as const;
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
  /** Efectivo esperado calculado por el sistema (monto_sistema en el diagrama) */
  monto_final_sistema: number | null;
  /** Efectivo contado físicamente (monto_real en el diagrama) */
  monto_final_real: number | null;
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
  tipo_comprobante: TipoComprobante | string | null;
  nro_comprobante: string | null;
  fecha_emision: string;
  subtotal: number;
  descuento: number;
  total: number;
  estado: EstadoVenta | string;
  tipo_pago?: TipoPago | null;
}

/** Tabla DETALLE_VENTA */
export interface DetalleVenta {
  id: number;
  venta_id: number;
  producto_id: number | null;
  servicio_id?: number | null;
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

/** Tabla BITACORA */
export interface Bitacora {
  id: number;
  usuario_id: number;
  fecha_hora: string;
  accion: string;
  descripcion: string | null;
  ip?: string | null;
}

/** Tabla PRODUCTO (columnas que usa el CU09) */
export interface Producto {
  id: number;
  categoria_producto_id: number;
  nombre: string;
  descripcion_tecnica: string | null;
  unidad_medida: string | null;
  margen_ganancia: number | null;
  precio_compra_actual: number;
  stock_disponible: number;
  stock_minimo: number;
}

// ===========================================================================
// DTOs del diagrama de secuencia
// ===========================================================================

/** cajaDTO → procesarAperturaOArqueo() */
export type CajaDTO =
  | { tipo: 'APERTURA'; usuarioId: number; montoInicial: number; ip: string }
  | { tipo: 'ARQUEO'; usuarioId: number; montoReal: number; observacion?: string; ip: string };

/** Ítem que llega desde la IU (seleccionarProductosYCliente) */
export interface ItemVentaDTO {
  productoId: number;
  cantidad: number;
}

/** datosVentaDTO → registrarVentaDirecta() */
export interface DatosVentaDTO {
  usuarioId: number;
  ip: string;
  clienteId?: number | null;
  tipoPago: TipoPago;
  tipoComprobante: TipoComprobante;
  descuento?: number;
  items: ItemVentaDTO[];
}

/** Línea ya valorizada (precio calculado en el servidor) */
export interface LineaVenta {
  productoId: number;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  stockAnterior: number;
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
}

/** Cliente asociado a la venta (venta.cliente_id). Solo lectura en el CU09. */
export interface ClienteVenta {
  id: number;
  razon_social: string;
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
  usuario: { id: number; nombre: string };
  caja: Caja | null;
  resumen: ResumenArqueo | null;
  ventas: VentaResumen[];
  productos: ProductoVenta[];
  clientes: ClienteVenta[];
  cliente_mostrador_id: number | null;
}

/** Respuesta uniforme de las Server Actions */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; mensaje?: string }
  | { ok: false; error: string };
