import type { AccionCompras, LineaCalculadaDTO, ResumenCompraDTO } from './types'

/**
 * Reglas de negocio PURAS de CU15 (sin BD ni Next.js): se prueban aisladas.
 * El registro, el stock y el kárdex NO se calculan aquí: son exclusivos de
 * fn_registrar_compra. Estas reglas solo sirven para validar antes de llamar
 * a la BD y para mostrar subtotales y total (paso 4 del flujo).
 */

/** Zona horaria del negocio (la misma que usa fn_registrar_compra). */
export const ZONA_HORARIA_NEGOCIO = 'America/La_Paz'

/** Fecha de hoy (YYYY-MM-DD) en la zona horaria del negocio. */
export function fechaHoyNegocio(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora)
}

/** true si `fecha` es YYYY-MM-DD y existe en el calendario (rechaza 2026-02-30). */
export function esFechaCalendario(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false
  const [a, m, d] = fecha.split('-').map(Number)
  const f = new Date(Date.UTC(a, m - 1, d))
  return f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d
}

/**
 * Clave de unicidad del número de documento: igual a la columna generada
 * compra.nro_documento_normalizado (mayúsculas, sin espacios, puntos, barras
 * ni guiones; conserva los ceros a la izquierda).
 */
export function normalizarNroDocumento(nro: string): string {
  return nro.replace(/[\s./-]/g, '').toUpperCase()
}

/** Número de documento como lo guarda la función: sin bordes y con espacios simples. */
export function limpiarNroDocumento(nro: string): string {
  return nro.trim().replace(/\s+/g, ' ')
}

/** Redondeo a 2 decimales en centavos (sin errores de coma flotante). */
function aCentavos(v: number): number {
  return Math.round(v * 100)
}

/** Subtotal de una línea: round(cantidad × costo, 2), como en la BD. */
export function calcularSubtotal(cantidad: number, costoUnitario: number): number {
  // cantidad y costo tienen como máximo 2 decimales → producto exacto en 1/10000
  const exacto = aCentavos(cantidad) * aCentavos(costoUnitario)
  return Math.round(exacto / 100) / 100
}

/** Subtotal por línea y total (paso 4: "El sistema muestra el subtotal por línea y el total"). */
export function calcularResumenCompra(
  items: readonly { producto_id: number; cantidad: number; costo_unitario: number }[],
): ResumenCompraDTO {
  let totalCentavos = 0
  const lineas: LineaCalculadaDTO[] = items.map((i) => {
    const subtotal = calcularSubtotal(i.cantidad, i.costo_unitario)
    totalCentavos += aCentavos(subtotal)
    return { productoId: i.producto_id, cantidad: i.cantidad, costoUnitario: i.costo_unitario, subtotal }
  })
  return { lineas, total: totalCentavos / 100 }
}

/** IDs de producto que aparecen más de una vez en la compra. */
export function productosRepetidos(items: readonly { producto_id: number }[]): number[] {
  const vistos = new Set<number>()
  const repetidos = new Set<number>()
  for (const { producto_id } of items) {
    if (vistos.has(producto_id)) repetidos.add(producto_id)
    vistos.add(producto_id)
  }
  return [...repetidos]
}

/**
 * Decisión de acceso de CU15 (dos niveles, ambos obligatorios):
 *   1) permiso de ruta COMPRAS en ROL_PERMISO;
 *   2) la acción concedida en ROL_FUNCION para 'Compras'.
 */
export function evaluarAccesoCompras(
  tienePermisoRuta: boolean,
  accionesConcedidas: readonly string[],
  accion: AccionCompras,
): boolean {
  return tienePermisoRuta && accionesConcedidas.includes(accion)
}
