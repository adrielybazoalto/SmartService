/**
 * DTOs de CU16 — lo único que las Server Actions devuelven al cliente
 * (nunca filas crudas de la BD).
 */

/** Acciones de ROL_FUNCION (tabla ACCION) que usa CU16. */
export const ACCIONES_INVENTARIO = ['LEER', 'CREAR', 'ACTUALIZAR', 'ELIMINAR', 'PROCESAR'] as const
export type AccionInventario = (typeof ACCIONES_INVENTARIO)[number]

/** Nombre de la función en FUNCION y del permiso de ruta en PERMISO. */
export const FUNCION_INVENTARIO = 'Catálogo e Inventario'
export const PERMISO_INVENTARIO = 'INVENTARIO'

/** Motivos del kárdex (columna movimiento_kardex.motivo). */
export const MOTIVOS_ENTRADA = ['COMPRA', 'INVENTARIO_INICIAL', 'ANULACION_VENTA', 'ENTRADA_OTRA', 'AJUSTE_POSITIVO'] as const
export const MOTIVOS_SALIDA = ['VENTA', 'CONSUMO_OT', 'SALIDA_OTRA', 'AJUSTE_NEGATIVO'] as const

export interface CategoriaDTO {
  id: number
  nombre: string
  descripcion: string | null
}

/** Fotografía de IMAGEN_PRODUCTO (solo lectura en CU16). */
export interface ImagenProductoDTO {
  id: number
  url: string
  esPrincipal: boolean
  /** NULL = sin orden asignado (se muestra al final). */
  orden: number | null
}

export interface ProductoInventarioDTO {
  id: number
  codigo: string | null
  nombre: string
  descripcionTecnica: string | null
  unidadMedida: string
  categoria: { id: number; nombre: string } | null
  margenGanancia: number
  precioCompraActual: number
  stockDisponible: number
  stockMinimo: number
  activo: boolean
  /** stock disponible <= stock mínimo (RF16). */
  critico: boolean
  /** Foto del catálogo: la marcada como principal o, si no hay, la primera por orden. */
  imagenPrincipal: ImagenProductoDTO | null
  /** Las demás fotos, en orden, para el detalle del producto. */
  imagenesAdicionales: ImagenProductoDTO[]
}

export interface MovimientoKardexDTO {
  id: number
  fecha: string
  tipo: string
  /** NULL solo en movimientos anteriores a CU16 (histórico sin clasificar). */
  motivo: string | null
  /** +1 entrada, -1 salida, null si no se puede determinar (histórico). */
  sentido: 1 | -1 | null
  cantidad: number
  stockAnterior: number
  /** NULL solo en movimientos anteriores a CU16. */
  stockResultante: number | null
  documento: string | null
  origen: string | null
  observacion: string | null
  responsable: { id: number; nombre: string | null }
}

export interface KardexProductoDTO {
  producto: { id: number; codigo: string | null; nombre: string; stockDisponible: number; activo: boolean }
  movimientos: MovimientoKardexDTO[]
}

/** Resultado de fn_registrar_ajuste / fn_registrar_inventario_inicial. */
export interface ResultadoMovimientoDTO {
  movimientoId: number
  productoId: number
  producto: string
  motivo: string
  cantidad: number
  stockAnterior: number
  stockResultante: number
}

/** Respuesta estándar de las Server Actions de CU16. */
export type ResultadoInventario<T> =
  | { ok: true; mensaje: string; data: T }
  | { ok: false; mensaje: string }
