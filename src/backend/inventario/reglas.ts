import type { AccionInventario } from './types'

/**
 * Reglas de negocio PURAS de CU16 (sin BD ni Next.js): se prueban aisladas.
 */

/** RF16 — stock crítico: existencias en o por debajo del stock mínimo. */
export function esStockCritico(stockDisponible: number, stockMinimo: number): boolean {
  return stockDisponible <= stockMinimo
}

const ENTRADAS = new Set(['COMPRA', 'INVENTARIO_INICIAL', 'ANULACION_VENTA', 'ENTRADA_OTRA', 'AJUSTE_POSITIVO'])
const SALIDAS = new Set(['VENTA', 'CONSUMO_OT', 'SALIDA_OTRA', 'AJUSTE_NEGATIVO'])

/** Sentido del movimiento según su motivo; para el histórico sin motivo, según su tipo. */
export function sentidoMovimiento(tipo: string, motivo: string | null): 1 | -1 | null {
  if (motivo && ENTRADAS.has(motivo)) return 1
  if (motivo && SALIDAS.has(motivo)) return -1
  if (!motivo && tipo === 'ENTRADA') return 1
  if (!motivo && tipo === 'SALIDA') return -1
  return null // AJUSTE histórico u otro caso no clasificable
}

/**
 * Decisión de acceso de CU16 (dos niveles, ambos obligatorios):
 *   1) permiso de ruta INVENTARIO en ROL_PERMISO;
 *   2) la acción concedida en ROL_FUNCION para 'Catálogo e Inventario'.
 */
export function evaluarAccesoInventario(
  tienePermisoRuta: boolean,
  accionesConcedidas: readonly string[],
  accion: AccionInventario,
): boolean {
  return tienePermisoRuta && accionesConcedidas.includes(accion)
}

/**
 * Limpia el texto de búsqueda para el filtro `.or()` de PostgREST: quita los
 * caracteres que separan o agrupan condiciones (, ( ) " \) y los comodines
 * (* %), para que el usuario no pueda inyectar condiciones adicionales.
 */
export function sanitizarBusqueda(texto: string): string {
  return texto.replace(/[,()"\\*%]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100)
}

/** Convierte NUMERIC (string o number según PostgREST) a number. */
export function aNumero(valor: string | number | null | undefined): number {
  const n = typeof valor === 'number' ? valor : Number(valor ?? 0)
  return Number.isFinite(n) ? n : 0
}
