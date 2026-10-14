import type { AccionInventario, ImagenProductoDTO } from './types'

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

/** Fila de IMAGEN_PRODUCTO tal como llega embebida en la consulta de PRODUCTO. */
export interface FilaImagenProducto {
  id: number
  url_imagen: string | null
  es_principal: boolean | null
  orden: number | null
}

/**
 * URL que se puede usar en <img src>: http(s) absoluta o ruta del propio sitio
 * ("/..."). Descarta vacías, "javascript:", "data:", "//host" y similares.
 */
export function esUrlImagenValida(url: string | null | undefined): url is string {
  if (typeof url !== 'string') return false
  const u = url.trim()
  if (!u || u.length > 500) return false
  if (u.startsWith('/')) return !u.startsWith('//') && !u.startsWith('/\\')
  try {
    const { protocol } = new URL(u)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/** Orden de IMAGEN_PRODUCTO: `orden` ascendente (NULL al final) y luego id. */
function compararImagenes(a: ImagenProductoDTO, b: ImagenProductoDTO): number {
  if (a.orden !== b.orden) {
    if (a.orden === null) return 1
    if (b.orden === null) return -1
    return a.orden - b.orden
  }
  return a.id - b.id
}

/**
 * Separa la foto principal (catálogo) de las adicionales (detalle).
 * Principal: la primera marcada `es_principal`; si ninguna lo está, la primera
 * por orden. Las URL no válidas se omiten (la interfaz muestra el respaldo).
 */
export function separarImagenes(filas: readonly FilaImagenProducto[] | null | undefined): {
  principal: ImagenProductoDTO | null
  adicionales: ImagenProductoDTO[]
} {
  const imagenes: ImagenProductoDTO[] = []
  for (const f of filas ?? []) {
    if (!esUrlImagenValida(f.url_imagen)) continue
    imagenes.push({ id: f.id, url: f.url_imagen.trim(), esPrincipal: f.es_principal === true, orden: f.orden ?? null })
  }
  imagenes.sort(compararImagenes)
  const principal = imagenes.find((i) => i.esPrincipal) ?? imagenes[0] ?? null
  return { principal, adicionales: imagenes.filter((i) => i !== principal) }
}
