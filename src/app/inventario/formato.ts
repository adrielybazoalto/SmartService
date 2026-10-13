/**
 * Formato de números y textos de CU16 para la interfaz. Determinista (no
 * depende del ICU del servidor ni del navegador) para evitar diferencias de
 * hidratación: 1234.5 → "1.234,50".
 */
export function formatoNumero(valor: number, decimales = 2): string {
  const [entero, fraccion] = Math.abs(valor).toFixed(decimales).split('.')
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${valor < 0 ? '−' : ''}${miles}${fraccion ? `,${fraccion}` : ''}`
}

export function formatoBs(valor: number): string {
  return `Bs ${formatoNumero(valor)}`
}

/** Cantidad sin decimales innecesarios: 12 → "12", 2.5 → "2,50". */
export function formatoCantidad(valor: number): string {
  return Number.isInteger(valor) ? formatoNumero(valor, 0) : formatoNumero(valor)
}

/** Precio de venta referencial: costo × (1 + margen %). Solo informativo. */
export function precioVentaReferencial(precioCompra: number, margen: number): number {
  return Math.round(precioCompra * (100 + margen)) / 100
}

/** Etiquetas de los motivos del kárdex (columna movimiento_kardex.motivo). */
export const ETIQUETAS_MOTIVO: Record<string, string> = {
  COMPRA: 'Compra',
  INVENTARIO_INICIAL: 'Inventario inicial',
  ANULACION_VENTA: 'Anulación de venta',
  ENTRADA_OTRA: 'Otra entrada',
  AJUSTE_POSITIVO: 'Ajuste positivo',
  VENTA: 'Venta',
  CONSUMO_OT: 'Consumo en OT',
  SALIDA_OTRA: 'Otra salida',
  AJUSTE_NEGATIVO: 'Ajuste negativo',
}

export function etiquetaMovimiento(tipo: string, motivo: string | null): string {
  if (motivo) return ETIQUETAS_MOTIVO[motivo] ?? motivo
  return `${tipo.charAt(0)}${tipo.slice(1).toLowerCase()} (histórico)`
}
