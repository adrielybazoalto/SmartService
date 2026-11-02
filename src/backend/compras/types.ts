/**
 * DTOs de CU15 — lo único que las Server Actions devuelven al cliente
 * (nunca filas crudas de la BD).
 */

/** Acciones de ROL_FUNCION (tabla ACCION) que usa CU15. */
export const ACCIONES_COMPRAS = ['LEER', 'CREAR'] as const
export type AccionCompras = (typeof ACCIONES_COMPRAS)[number]

/** FUNCION.nombre (acciones) y FUNCION.clave (acceso al módulo) de Compras. */
export const FUNCION_COMPRAS = 'Compras'
export const PERMISO_COMPRAS = 'COMPRAS'

/** Tipos de documento de respaldo (CHECK chk_compra_tipo_documento). */
export const TIPOS_DOCUMENTO_COMPRA = ['FACTURA', 'NOTA'] as const
export type TipoDocumentoCompra = (typeof TIPOS_DOCUMENTO_COMPRA)[number]

/** Límites que replican fn_registrar_compra. */
export const MAX_LINEAS_COMPRA = 100

export interface ProveedorCompraDTO {
  id: number
  razonSocial: string
  nit: string | null
  contacto: string | null
  telefono: string | null
}

/** Producto activo seleccionable en una compra. */
export interface ProductoCompraDTO {
  id: number
  codigo: string | null
  nombre: string
  unidadMedida: string
  categoria: string | null
  /** Último costo de compra (producto.precio_compra_actual). */
  precioCompraActual: number
  stockDisponible: number
  /** Precio pactado con el proveedor consultado (producto_proveedor), si existe. */
  precioPactado: number | null
}

/** Línea calculada para mostrar subtotal y total antes de confirmar (paso 4). */
export interface LineaCalculadaDTO {
  productoId: number
  cantidad: number
  costoUnitario: number
  subtotal: number
}

export interface ResumenCompraDTO {
  lineas: LineaCalculadaDTO[]
  total: number
}

export interface DisponibilidadDocumentoDTO {
  disponible: boolean
  /** Compra que ya usa el documento (si no está disponible). */
  compraId: number | null
}

/** Fila del listado de compras. */
export interface CompraResumenDTO {
  id: number
  proveedor: { id: number; razonSocial: string | null }
  tipoDocumento: string
  nroDocumento: string
  fechaCompra: string
  fechaRegistro: string
  total: number
  responsable: { id: number; nombre: string | null }
  cantidadLineas: number
}

export interface LineaComprobanteDTO {
  productoId: number
  codigo: string | null
  producto: string
  unidadMedida: string | null
  cantidad: number
  costoUnitario: number
  subtotal: number
  /** Movimiento de kárdex ENTRADA/COMPRA generado por la línea. */
  movimientoId: number | null
  stockAnterior: number | null
  stockResultante: number | null
}

/**
 * Comprobante de ingreso a almacén (paso 7): datos de la compra, sus líneas y
 * el efecto de cada una en el kárdex. También es el detalle de una compra.
 */
export interface ComprobanteIngresoDTO {
  compraId: number
  proveedor: { id: number; razonSocial: string; nit: string | null }
  tipoDocumento: string
  nroDocumento: string
  /** "FACTURA 001-2345": el documento tal como queda en el kárdex. */
  documento: string
  fechaCompra: string
  fechaRegistro: string
  responsable: { id: number; nombre: string | null }
  observacion: string | null
  total: number
  lineas: LineaComprobanteDTO[]
}

/** Respuesta estándar de las Server Actions de CU15. */
export type ResultadoCompras<T> =
  | { ok: true; mensaje: string; data: T }
  | { ok: false; mensaje: string }
