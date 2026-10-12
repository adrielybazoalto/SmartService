/**
 * CU014 — Gestionar Proveedores y Catálogo de Mayoristas
 * 1° types.ts · Interfaces, DTOs y tipos estrictos
 *
 * Correspondencia diagrama → base de datos (diccionario de datos, Tablas 14 y 15):
 *   BD Proveedor          → tabla `proveedor`            (nit_ruc → `nit`)
 *   BD Producto           → tabla `producto`
 *   BD CatalogoMayorista  → tabla `producto_proveedor`
 *        precio_mayorista → columna `precio_compra`
 *        stock_disponible → columna `stock_disponible` (migración 20261011_cu14_stock_mayorista.sql)
 *   BD Bitacora           → tabla `bitacora`
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Cliente de Supabase que reciben los servicios */
export type Db = SupabaseClient<any, 'public', any>;

/** Respuesta estándar de las Server Actions */
export type ActionResult<T> =
  | { ok: true; data: T; mensaje: string }
  | { ok: false; error: string };

/** Entidad Proveedor (tabla proveedor) */
export interface Proveedor {
  id: number;
  razon_social: string;
  nit: string;
  contacto: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
  estado: boolean;
  /** Cantidad de productos en su catálogo (solo lectura) */
  total_productos: number;
}

/** Entidad CatalogoMayorista (tabla producto_proveedor) con datos del producto */
export interface CatalogoMayorista {
  id: number;
  proveedor_id: number;
  producto_id: number;
  producto_nombre: string;
  unidad_medida: string | null;
  /** precio_compra_actual del producto, como referencia */
  precio_compra_actual: number;
  codigo_item_proveedor: string | null;
  /** precio_mayorista del diagrama → columna precio_compra */
  precio_mayorista: number;
  /** stock_disponible del mayorista */
  stock_disponible: number;
  fecha_actualizacion: string | null;
}

/** Producto del catálogo interno disponible para vincular */
export interface ProductoOpcion {
  id: number;
  nombre: string;
  unidad_medida: string | null;
  precio_compra_actual: number;
}

/** Línea del historial de precios (guardarHistorialPrecios) */
export interface CambioPrecio {
  productoId: number;
  productoNombre: string;
  precioAnterior: number | null;
  precioNuevo: number;
}

/** confirmarResultadoCatalogo() / mostrarResumenCatalogo() */
export interface ResumenCatalogo {
  proveedorId: number;
  proveedorNombre: string;
  insertados: number;
  actualizados: number;
  sinCambios: number;
  cambiosPrecio: CambioPrecio[];
  catalogo: CatalogoMayorista[];
}

/** Acciones que registra el CU014 en la bitácora */
export type AccionProveedor =
  | 'CREAR_PROVEEDOR'
  | 'ACTUALIZAR_PROVEEDOR'
  | 'ACTIVAR_PROVEEDOR'
  | 'DESACTIVAR_PROVEEDOR'
  | 'ACTUALIZAR_CATALOGO_PROVEEDOR'
  | 'ACTUALIZAR_PRECIO_PROVEEDOR'
  | 'QUITAR_PRODUCTO_PROVEEDOR';

// ===========================================================================
// DTOs (entrada desde la IU y datos ya validados)
// ===========================================================================

/** proveedorDTO: lo que envía el formulario (registrarDatosProveedor) */
export interface ProveedorDTO {
  razon_social: string;
  nit: string;
  contacto?: string | null;
  telefono?: string | null;
  correo?: string | null;
  direccion?: string | null;
}

/** datosProveedor: proveedorDTO normalizado por el esquema (guardarProveedor) */
export interface DatosProveedor {
  razon_social: string;
  nit: string;
  contacto: string | null;
  telefono: string | null;
  correo: string | null;
  direccion: string | null;
}

/** Ítem de listaDTO (seleccionarProveedorYCatalogo). Acepta números o texto numérico. */
export interface ProductoCatalogoDTO {
  productoId: number | string;
  codigoItemProveedor?: string | null;
  precioMayorista: number | string;
  stockDisponible?: number | string;
}

/** Ítem validado por recorrerYValidarListaProductos */
export interface ProductoCatalogoValido {
  productoId: number;
  codigoItemProveedor: string | null;
  precioMayorista: number;
  stockDisponible: number;
}
