/**
 * Errores de CU16. `ErrorInventario` lleva un mensaje APTO para el usuario;
 * cualquier otro error se considera interno y no se muestra tal cual.
 */
export class ErrorInventario extends Error {
  readonly codigo: string

  constructor(mensaje: string, codigo = 'INVENTARIO') {
    super(mensaje)
    this.name = 'ErrorInventario'
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

/** SQLSTATE que las funciones de CU16 lanzan con mensajes ya redactados para el usuario. */
const CODIGOS_CON_MENSAJE_DE_NEGOCIO = new Set([
  '42501', // No autorizado (fn_verificar_permiso / fn_exigir_llamada_servidor)
  '22023', // Validación (cantidad, justificación, sin diferencia, producto inactivo…)
  'P0002', // Producto inexistente
  '55000', // El kárdex es de solo inserción
  '22003', // Importe fuera de rango
])

const UNICOS: Record<string, string> = {
  uq_producto_codigo: 'Código duplicado: ya existe un producto con ese código',
  categoria_producto_nombre_key: 'Ya existe una categoría con ese nombre',
}

const CHECKS: Record<string, string> = {
  chk_producto_codigo: 'Código de producto inválido',
  chk_producto_margen: 'El margen de ganancia no puede ser negativo',
  chk_producto_precio: 'El precio de compra no puede ser negativo',
  chk_producto_stock: 'El stock no puede quedar negativo',
  chk_producto_stock_minimo: 'El stock mínimo no puede ser negativo',
}

function restriccion(error: ErrorBD, tipo: 'unique constraint' | 'check constraint'): string | null {
  const texto = `${error.message ?? ''} ${error.details ?? ''}`
  const m = texto.match(new RegExp(`${tipo} "([^"]+)"`))
  return m ? m[1] : null
}

/**
 * Traduce un error de la BD a un ErrorInventario con mensaje de negocio.
 * `contexto` describe la operación ("No se pudo registrar el producto").
 */
export function traducirErrorBD(error: ErrorBD, contexto: string): ErrorInventario {
  const codigo = error.code ?? ''
  const mensaje = error.message ?? ''

  // Funciones de CU16: el mensaje de la BD ya es para el usuario.
  if (CODIGOS_CON_MENSAJE_DE_NEGOCIO.has(codigo) && mensaje) {
    return new ErrorInventario(mensaje, codigo)
  }

  if (codigo === '23505') {
    const nombre = restriccion(error, 'unique constraint')
    return new ErrorInventario((nombre && UNICOS[nombre]) || `${contexto}: el registro ya existe`, codigo)
  }

  if (codigo === '23514') {
    // RAISE con 23514 (p. ej. "Stock insuficiente…") vs. violación nativa de un CHECK
    const nombre = restriccion(error, 'check constraint')
    if (!nombre && mensaje) return new ErrorInventario(mensaje, codigo)
    return new ErrorInventario((nombre && CHECKS[nombre]) || `${contexto}: datos fuera del rango permitido`, codigo)
  }

  if (codigo === '23503') {
    return new ErrorInventario(`${contexto}: la categoría o el producto referenciado no existe`, codigo)
  }

  if (codigo === 'PGRST116') {
    return new ErrorInventario(`${contexto}: registro no encontrado`, codigo)
  }

  // Migración de CU16 no aplicada en esta BD
  if (codigo === 'PGRST202' || codigo === '42883') {
    return new ErrorInventario(
      'Las funciones de inventario no están instaladas en la base de datos (migracion_cu16_inventario.sql pendiente)',
      codigo,
    )
  }
  if (codigo === 'PGRST204' || codigo === '42703') {
    return new ErrorInventario(
      'La base de datos no tiene las columnas de CU16 (migracion_cu16_inventario.sql pendiente)',
      codigo,
    )
  }

  // Error interno: se registra en el servidor, al usuario solo el contexto.
  console.error(`[CU16] ${contexto}:`, error)
  return new ErrorInventario(`${contexto}. Intente nuevamente.`, codigo || 'INTERNO')
}
