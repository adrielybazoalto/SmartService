/**
 * CU14 — Gestionar Proveedores y Catálogo de Mayoristas · Tipos
 *
 * Tablas: proveedor, producto_proveedor, producto, bitacora (columna `ip`).
 * Alcance: sin facturación ni impuestos.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Cliente de Supabase (service_role) que reciben todas las funciones del servicio */
export type Db = SupabaseClient<any, 'public', any>;

// ---------------------------------------------------------------------------
// Modelos de lectura
// ---------------------------------------------------------------------------
export interface Proveedor {
  id: number;
  razon_social: string;
  nit: string;
  contacto: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  estado: boolean;
  total_productos: number;
}

/** Ítem del catálogo del mayorista (tabla producto_proveedor + datos del producto) */
export interface ItemCatalogo {
  proveedor_id: number;
  producto_id: number;
  producto_nombre: string;
  unidad_medida: string | null;
  /** precio_compra_actual del inventario, como referencia */
  precio_inventario: number;
  codigo_item_proveedor: string | null;
  precio_compra: number;
  fecha_actualizacion: string | null;
}

/** Producto del inventario general que se puede vincular al catálogo */
export interface ProductoInventario {
  id: number;
  nombre: string;
  unidad_medida: string | null;
  precio_compra_actual: number;
}

/** Oferta de un proveedor para un producto (subflujo "Comparar precios") */
export interface OfertaProveedor {
  proveedor_id: number;
  razon_social: string;
  nit: string;
  activo: boolean;
  codigo_item_proveedor: string | null;
  precio_compra: number;
  fecha_actualizacion: string | null;
  /** Cuánto más caro que la mejor oferta activa (0 = la más barata) */
  diferencia: number;
  es_mejor: boolean;
}

/** Comparativo de precios de compra de un producto entre proveedores */
export interface ComparativoPrecios {
  producto_id: number;
  producto_nombre: string;
  unidad_medida: string | null;
  /** precio_compra_actual del inventario, como referencia */
  precio_inventario: number;
  ofertas: OfertaProveedor[];
  mejor_precio: number | null;
}

// ---------------------------------------------------------------------------
// DTOs (datos que envían los formularios)
// ---------------------------------------------------------------------------
export interface ProveedorDTO {
  razon_social: string;
  nit: string;
  contacto?: string | null;
  telefono?: string | null;
  correo?: string | null;
  direccion?: string | null;
}

export interface ItemCatalogoDTO {
  productoId: number;
  codigoItemProveedor?: string | null;
  precioCompra: number | string;
}

/** Datos del proveedor ya validados y normalizados */
export type ProveedorValidado = {
  razon_social: string;
  nit: string;
  contacto: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
};

/** Ítem de catálogo ya validado */
export type ItemCatalogoValidado = {
  productoId: number;
  codigo: string | null;
  precio: number;
};

// ---------------------------------------------------------------------------
// Bitácora y errores
// ---------------------------------------------------------------------------
export type AccionProveedor =
  | 'CREAR_PROVEEDOR'
  | 'ACTUALIZAR_PROVEEDOR'
  | 'ACTIVAR_PROVEEDOR'
  | 'DESACTIVAR_PROVEEDOR'
  | 'VINCULAR_PRODUCTO_PROVEEDOR'
  | 'ACTUALIZAR_PRECIO_PROVEEDOR'
  | 'QUITAR_PRODUCTO_PROVEEDOR';

/** Quién ejecuta la operación (se guarda en bitacora.usuario_id y bitacora.ip) */
export interface Auditoria {
  usuarioId: number;
  ip: string | null;
}

/** Error de negocio: su mensaje se muestra tal cual en la pantalla */
export class ProveedorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProveedorError';
  }
}
