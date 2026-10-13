import type { z } from 'zod'
import { calcularResumenCompra, esFechaCalendario, normalizarNroDocumento } from '@/backend/compras/reglas'
import {
  documentoCompraSchema,
  registrarCompraSchema,
  type DocumentoCompraInput,
  type FiltrosComprasInput,
  type RegistrarCompraInput,
} from '@/backend/compras/schema'
// Solo módulos puros: el índice '@/backend/compras' arrastra código de servidor.
import { TIPOS_DOCUMENTO_COMPRA, type ProductoCompraDTO } from '@/backend/compras/types'

/**
 * Lógica PURA de la interfaz de CU15 (sin React ni Next.js): arma la entrada
 * de las Server Actions, lee los filtros de la URL y calcula lo que se muestra.
 * Los subtotales y el total usan las MISMAS reglas del backend
 * (calcularResumenCompra); el registro, el stock y el kárdex siguen siendo
 * exclusivos de fn_registrar_compra.
 */

// ------------------------------------------------------------------ filtros

export interface ValoresFiltrosCompras {
  proveedor: string
  tipo: '' | (typeof TIPOS_DOCUMENTO_COMPRA)[number]
  nro: string
  desde: string
  hasta: string
}

export type ParametrosUrl = Record<string, string | string[] | undefined>

const unico = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

/** Límite del listado: las compras más recientes. */
export const LIMITE_LISTADO = 100

/**
 * Filtros de /compras desde la URL (?proveedor=&tipo=&nro=&desde=&hasta=).
 * Valores mal formados se descartan; el esquema del backend vuelve a validar.
 */
export function leerFiltrosCompras(params: ParametrosUrl): { valores: ValoresFiltrosCompras; filtros: FiltrosComprasInput } {
  const proveedor = unico(params.proveedor).trim()
  const tipo = unico(params.tipo).trim().toUpperCase()
  const fecha = (v: string) => (esFechaCalendario(v.trim()) ? v.trim() : '')
  const valores: ValoresFiltrosCompras = {
    proveedor: /^\d{1,10}$/.test(proveedor) ? proveedor : '',
    tipo: (TIPOS_DOCUMENTO_COMPRA as readonly string[]).includes(tipo) ? (tipo as ValoresFiltrosCompras['tipo']) : '',
    nro: unico(params.nro).trim().slice(0, 50),
    desde: fecha(unico(params.desde)),
    hasta: fecha(unico(params.hasta)),
  }
  const filtros: FiltrosComprasInput = {
    limite: LIMITE_LISTADO,
    ...(valores.proveedor && { proveedor_id: valores.proveedor }),
    ...(valores.tipo && { tipo_documento: valores.tipo }),
    ...(valores.nro && { nro_documento: valores.nro }),
    ...(valores.desde && { desde: valores.desde }),
    ...(valores.hasta && { hasta: valores.hasta }),
  }
  return { valores, filtros }
}

/** Query string de los filtros (sin parámetros vacíos). */
export function queryFiltrosCompras(v: ValoresFiltrosCompras): string {
  const params = new URLSearchParams()
  if (v.proveedor) params.set('proveedor', v.proveedor)
  if (v.tipo) params.set('tipo', v.tipo)
  if (v.nro.trim()) params.set('nro', v.nro.trim())
  if (v.desde) params.set('desde', v.desde)
  if (v.hasta) params.set('hasta', v.hasta)
  return params.toString()
}

export function hayFiltrosCompras(v: ValoresFiltrosCompras): boolean {
  return Boolean(v.proveedor || v.tipo || v.nro || v.desde || v.hasta)
}

// ------------------------------------------------------------------ formato

/** DATE de la BD (AAAA-MM-DD) → DD/MM/AAAA. Determinista: sin zona horaria. */
export function formatoFechaCompra(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha
}

export function etiquetaTipoDocumento(tipo: string): string {
  if (tipo === 'FACTURA') return 'Factura'
  if (tipo === 'NOTA') return 'Nota'
  return tipo
}

/** Suma de los importes mostrados (en centavos, sin error de coma flotante). */
export function sumaImportes(importes: readonly number[]): number {
  return importes.reduce((acc, v) => acc + Math.round(v * 100), 0) / 100
}

// ------------------------------------------------------------ formulario

export interface LineaFormulario {
  productoId: number
  /** Texto tal como lo escribe el usuario. */
  cantidad: string
  costoUnitario: string
}

export interface ValoresCompra {
  proveedorId: string
  fechaCompra: string
  tipoDocumento: '' | (typeof TIPOS_DOCUMENTO_COMPRA)[number]
  nroDocumento: string
  observacion: string
  lineas: LineaFormulario[]
}

/**
 * Entrada de registrarCompraAction. SOLO los campos del esquema estricto: sin
 * usuario, total, subtotales ni stock (la identidad sale de la sesión y los
 * importes los calcula la BD).
 */
export function construirEntradaCompra(v: ValoresCompra): RegistrarCompraInput {
  return {
    proveedor_id: v.proveedorId,
    tipo_documento: v.tipoDocumento,
    nro_documento: v.nroDocumento,
    fecha_compra: v.fechaCompra,
    observacion: v.observacion.trim() ? v.observacion : null,
    items: v.lineas.map((l) => ({
      producto_id: l.productoId,
      cantidad: decimalConPunto(l.cantidad),
      costo_unitario: decimalConPunto(l.costoUnitario),
    })),
  }
}

/** Acepta la coma decimal habitual en Bolivia: "12,50" → "12.50". */
export function decimalConPunto(texto: string): string {
  return texto.trim().replace(',', '.')
}

/** Número > 0 con máximo 2 decimales escrito en el campo; null si aún no es válido. */
export function leerImporte(texto: string): number | null {
  const t = decimalConPunto(texto)
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Subtotal por línea (null si la línea está incompleta) y total de las líneas
 * válidas, con calcularResumenCompra del backend.
 */
export function resumenFormulario(lineas: readonly LineaFormulario[]): {
  subtotales: (number | null)[]
  total: number
  completas: number
} {
  const validas = lineas.map((l) => {
    const cantidad = leerImporte(l.cantidad)
    const costo = leerImporte(l.costoUnitario)
    return cantidad !== null && costo !== null ? { producto_id: l.productoId, cantidad, costo_unitario: costo } : null
  })
  const { lineas: calculadas, total } = calcularResumenCompra(validas.filter((x) => x !== null))
  let i = 0
  const subtotales = validas.map((x) => (x === null ? null : calculadas[i++].subtotal))
  return { subtotales, total, completas: calculadas.length }
}

/**
 * Costo sugerido al agregar un producto: el precio pactado con el proveedor o,
 * si no hay, el último costo de compra. Vacío si ninguno es > 0.
 */
export function costoSugerido(p: Pick<ProductoCompraDTO, 'precioPactado' | 'precioCompraActual'>): string {
  const ref = p.precioPactado && p.precioPactado > 0 ? p.precioPactado : p.precioCompraActual
  return ref > 0 ? ref.toFixed(2) : ''
}

/** Quita tildes y pasa a minúsculas para buscar «camara» = «Cámara». */
function normalizarTexto(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Búsqueda de productos por nombre o código (en la lista ya cargada). */
export function filtrarProductos(
  productos: readonly ProductoCompraDTO[],
  texto: string,
  maximo = 8,
): ProductoCompraDTO[] {
  const q = normalizarTexto(texto.trim())
  if (!q) return productos.slice(0, maximo)
  return productos
    .filter((p) => normalizarTexto(p.nombre).includes(q) || (p.codigo !== null && normalizarTexto(p.codigo).includes(q)))
    .slice(0, maximo)
}

/**
 * Errores de Zod por ruta completa: "proveedor_id", "items", "items.0.cantidad".
 * Se conserva el primer mensaje de cada ruta.
 */
export function erroresPorRuta(error: z.ZodError): Record<string, string> {
  const errores: Record<string, string> = {}
  for (const issue of error.issues) {
    const ruta = issue.path.length ? issue.path.map(String).join('.') : '_'
    errores[ruta] ??= issue.message
  }
  return errores
}

/**
 * Datos para el aviso previo de documento duplicado, o null si todavía no
 * están completos y válidos (no se consulta al servidor en ese caso).
 */
export function documentoAVerificar(
  v: Pick<ValoresCompra, 'proveedorId' | 'tipoDocumento' | 'nroDocumento'>,
): { entrada: DocumentoCompraInput; clave: string } | null {
  const entrada = { proveedor_id: v.proveedorId, tipo_documento: v.tipoDocumento, nro_documento: v.nroDocumento }
  const r = documentoCompraSchema.safeParse(entrada)
  if (!r.success) return null
  return { entrada, clave: `${r.data.proveedor_id}|${r.data.tipo_documento}|${normalizarNroDocumento(r.data.nro_documento)}` }
}

export type ValidacionCompra =
  | { ok: true; entrada: RegistrarCompraInput }
  | { ok: false; errores: Record<string, string> }

/**
 * Validación del formulario con el MISMO esquema del backend
 * (registrarCompraSchema), más mensajes claros para los campos vacíos. Solo
 * sirve para marcar errores antes de enviar: la Server Action y
 * fn_registrar_compra vuelven a validar todo.
 */
export function validarCompra(v: ValoresCompra): ValidacionCompra {
  const entrada = construirEntradaCompra(v)
  const r = registrarCompraSchema.safeParse(entrada)
  const errores = r.success ? {} : erroresPorRuta(r.error)
  if (!v.proveedorId) errores.proveedor_id = 'Seleccione un proveedor'
  if (!v.tipoDocumento) errores.tipo_documento = 'Seleccione el tipo de documento: factura o nota'
  if (v.lineas.length === 0) errores.items = 'Agregue al menos un producto a la compra'
  return Object.keys(errores).length > 0 ? { ok: false, errores } : { ok: true, entrada }
}

// --------------------------------------------------- protección de envío

/**
 * Candado SÍNCRONO contra envíos repetidos: el estado de React se actualiza
 * después del render, así que un doble clic podría disparar dos llamadas antes
 * de que el botón se deshabilite. `tomar()` devuelve false si ya hay un envío
 * en curso o la compra ya se registró. La garantía final es el índice único
 * uq_compra_documento de la BD.
 */
export function crearCandadoEnvio() {
  let ocupado = false
  let finalizado = false
  return {
    tomar(): boolean {
      if (ocupado || finalizado) return false
      ocupado = true
      return true
    },
    /** Envío fallido: se permite reintentar. */
    liberar() {
      ocupado = false
    },
    /** Compra registrada: no se admite ningún envío más desde este formulario. */
    finalizar() {
      ocupado = false
      finalizado = true
    },
    get ocupado() {
      return ocupado
    },
    get finalizado() {
      return finalizado
    },
  }
}
export type CandadoEnvio = ReturnType<typeof crearCandadoEnvio>
