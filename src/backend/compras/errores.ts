/**
 * Errores de CU15. `ErrorCompras` lleva un mensaje APTO para el usuario;
 * cualquier otro error se considera interno y no se muestra tal cual.
 */
export class ErrorCompras extends Error {
  readonly codigo: string

  constructor(mensaje: string, codigo = 'COMPRAS') {
    super(mensaje)
    this.name = 'ErrorCompras'
    this.codigo = codigo
  }
}

/** Forma mínima de un error de PostgREST / supabase-js. */
export interface ErrorBD {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

/**
 * SQLSTATE que fn_registrar_compra (y el núcleo de CU16 que invoca) lanzan con
 * mensajes ya redactados para el usuario.
 */
const CODIGOS_CON_MENSAJE_DE_NEGOCIO = new Set([
  '42501', // No autorizado (fn_verificar_permiso / fn_exigir_llamada_servidor)
  '22023', // Validación (documento, fecha, líneas, proveedor inactivo, producto inactivo…)
  'P0002', // Proveedor o producto inexistente
  '22003', // Importe fuera de rango
  '55000', // Compra / kárdex de solo inserción
])

const UNICOS: Record<string, string> = {
  uq_compra_documento: 'Documento ya registrado: ese número de factura o nota ya existe para el proveedor',
  uq_detalle_compra_producto: 'Hay productos repetidos en la compra: agrupe las cantidades en una sola línea',
}

const CHECKS: Record<string, string> = {
  chk_compra_tipo_documento: 'Tipo de documento no válido: use FACTURA o NOTA',
  chk_compra_nro_documento: 'Número de documento no válido',
  chk_compra_total: 'El total de la compra debe ser mayor a 0',
  chk_detalle_compra_cantidad: 'Cantidad cero o negativa',
  chk_detalle_compra_costo: 'El costo unitario debe ser mayor a 0',
  chk_detalle_compra_subtotal: 'Subtotal de línea inconsistente',
}

function restriccion(error: ErrorBD, tipo: 'unique constraint' | 'check constraint'): string | null {
  const texto = `${error.message ?? ''} ${error.details ?? ''}`
  const m = texto.match(new RegExp(`${tipo} "([^"]+)"`))
  return m ? m[1] : null
}

/**
 * Traduce un error de la BD a un ErrorCompras con mensaje de negocio.
 * `contexto` describe la operación ("No se pudo registrar la compra").
 */
export function traducirErrorBDCompras(error: ErrorBD, contexto: string): ErrorCompras {
  const codigo = error.code ?? ''
  const mensaje = error.message ?? ''

  if (CODIGOS_CON_MENSAJE_DE_NEGOCIO.has(codigo) && mensaje) {
    return new ErrorCompras(mensaje, codigo)
  }

  if (codigo === '23505') {
    // RAISE 23505 de fn_registrar_compra ("Documento ya registrado: …") vs. índice nativo
    const nombre = restriccion(error, 'unique constraint')
    if (!nombre && mensaje) return new ErrorCompras(mensaje, codigo)
    return new ErrorCompras((nombre && UNICOS[nombre]) || `${contexto}: el registro ya existe`, codigo)
  }

  if (codigo === '23514') {
    // RAISE con 23514 (p. ej. "Stock insuficiente…") vs. violación nativa de un CHECK
    const nombre = restriccion(error, 'check constraint')
    if (!nombre && mensaje) return new ErrorCompras(mensaje, codigo)
    return new ErrorCompras((nombre && CHECKS[nombre]) || `${contexto}: datos fuera del rango permitido`, codigo)
  }

  if (codigo === '23503') {
    return new ErrorCompras(`${contexto}: el proveedor o el producto referenciado no existe`, codigo)
  }

  if (codigo === 'PGRST116') {
    return new ErrorCompras(`${contexto}: registro no encontrado`, codigo)
  }

  // Migración de CU15 no aplicada en esta BD
  if (codigo === 'PGRST202' || codigo === '42883') {
    return new ErrorCompras(
      'La función de compras no está instalada en la base de datos (migracion_cu15_compras.sql pendiente)',
      codigo,
    )
  }
  if (codigo === 'PGRST205' || codigo === '42P01' || codigo === 'PGRST204' || codigo === '42703' || codigo === 'PGRST200') {
    return new ErrorCompras(
      'La base de datos no tiene las tablas o columnas de compras (migracion_cu15_compras.sql pendiente)',
      codigo,
    )
  }

  // Error interno: se registra en el servidor, al usuario solo el contexto.
  console.error(`[CU15] ${contexto}:`, error)
  return new ErrorCompras(`${contexto}. Intente nuevamente.`, codigo || 'INTERNO')
}
