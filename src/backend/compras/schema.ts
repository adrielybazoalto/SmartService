import { z } from 'zod'
import {
  calcularResumenCompra,
  esFechaCalendario,
  fechaHoyNegocio,
  limpiarNroDocumento,
  productosRepetidos,
} from './reglas'
import { MAX_LINEAS_COMPRA, TIPOS_DOCUMENTO_COMPRA } from './types'

/**
 * Esquemas Zod de CU15. Solo dependen de `zod` y de reglas puras (se prueban
 * sin Next.js). Replican las validaciones de fn_registrar_compra para dar
 * mensajes claros antes de llamar a la BD; la función vuelve a validar todo.
 */

const MAX_NUMERIC_12_2 = 9_999_999_999.99

/** Acepta number o string numérico (formularios); '' y espacios NO se convierten en 0. */
const numero = (campo: string) =>
  z
    .union([z.number(), z.string()], { message: `${campo} debe ser un número` })
    .transform((v, ctx) => {
      if (typeof v === 'number') return v
      const t = v.trim()
      if (!t) {
        ctx.addIssue({ code: 'custom', message: `${campo} es obligatorio` })
        return z.NEVER
      }
      return Number(t)
    })
    .pipe(z.number({ message: `${campo} debe ser un número` }).finite(`${campo} debe ser un número`))

const conDosDecimales = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6

/** Cantidad o costo: > 0, máximo 2 decimales, dentro de NUMERIC(12,2). */
const positivoDosDecimales = (campo: string) =>
  numero(campo)
    .refine((v) => v > 0, `${campo} debe ser mayor a 0`)
    .refine((v) => v <= MAX_NUMERIC_12_2, `${campo} excede el máximo permitido`)
    .refine(conDosDecimales, `${campo} admite como máximo 2 decimales`)
    // Normaliza 0.1 + 0.2 → 0.3 para enviar a la BD un JSON numérico exacto
    .transform((v) => Math.round(v * 100) / 100)

const id = (campo: string) =>
  z
    .union([z.number(), z.string()], { message: `${campo} es obligatorio` })
    .transform((v, ctx) => {
      if (typeof v === 'number') return v
      const t = v.trim()
      if (!/^\d+$/.test(t)) {
        ctx.addIssue({ code: 'custom', message: `${campo} inválido` })
        return z.NEVER
      }
      return Number(t)
    })
    .pipe(z.number().int(`${campo} inválido`).positive(`${campo} inválido`).max(2_147_483_647, `${campo} inválido`))

const fecha = (campo: string) =>
  z
    .string({ message: `${campo} es obligatoria` })
    .trim()
    .min(1, `${campo} es obligatoria`)
    .refine(esFechaCalendario, `${campo} no es válida (use AAAA-MM-DD)`)

export const tipoDocumentoSchema = z
  .string({ message: 'El tipo de documento es obligatorio' })
  .trim()
  .toUpperCase()
  .pipe(z.enum(TIPOS_DOCUMENTO_COMPRA, { message: 'Tipo de documento no válido: use FACTURA o NOTA' }))

/** Número de factura o nota: mismo patrón que chk_compra_nro_documento (máx. 50). */
export const nroDocumentoSchema = z
  .string({ message: 'El número de factura o nota es obligatorio' })
  .transform(limpiarNroDocumento)
  .pipe(
    z
      .string()
      .min(1, 'El número de factura o nota es obligatorio')
      .max(50, 'El número de documento no puede superar 50 caracteres')
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9 ./-]*$/,
        'Número de documento no válido: use letras, dígitos, espacio, punto, barra o guion',
      ),
  )

export const lineaCompraSchema = z.strictObject({
  producto_id: id('El producto'),
  cantidad: positivoDosDecimales('La cantidad'),
  costo_unitario: positivoDosDecimales('El costo unitario'),
})

const itemsCompraSchema = z
  .array(lineaCompraSchema, { message: 'La compra debe tener al menos un producto' })
  .min(1, 'La compra debe tener al menos un producto')
  .max(MAX_LINEAS_COMPRA, `Una compra admite como máximo ${MAX_LINEAS_COMPRA} líneas`)

/**
 * Registro de compra (pasos 2–5). Objeto ESTRICTO: rechaza `usuario_id`,
 * `total`, `subtotal`, `stock`… La identidad sale de la sesión y los importes
 * los calcula la BD.
 */
export const registrarCompraSchema = z
  .strictObject({
    proveedor_id: id('El proveedor'),
    tipo_documento: tipoDocumentoSchema,
    nro_documento: nroDocumentoSchema,
    fecha_compra: fecha('La fecha de compra'),
    observacion: z
      .string()
      .trim()
      .max(1000, 'La observación no puede superar 1000 caracteres')
      .nullish()
      .transform((v) => (v ? v : null)),
    items: itemsCompraSchema,
  })
  .superRefine((v, ctx) => {
    if (v.fecha_compra > fechaHoyNegocio()) {
      ctx.addIssue({ code: 'custom', path: ['fecha_compra'], message: 'La fecha de compra no puede ser futura' })
    }
    if (productosRepetidos(v.items).length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['items'],
        message: 'Hay productos repetidos en la compra: agrupe las cantidades en una sola línea',
      })
    }
    const { lineas, total } = calcularResumenCompra(v.items)
    if (lineas.some((l) => l.subtotal <= 0)) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Un subtotal resulta 0; revise cantidad y costo' })
    }
    if (total > MAX_NUMERIC_12_2) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'El importe de la compra excede el máximo permitido' })
    }
  })

/** Comprobación previa de documento duplicado (la BD es la garantía final). */
export const documentoCompraSchema = z.strictObject({
  proveedor_id: id('El proveedor'),
  tipo_documento: tipoDocumentoSchema,
  nro_documento: nroDocumentoSchema,
})

/** Líneas para calcular subtotales y total sin registrar nada. */
export const resumenCompraSchema = z.strictObject({
  items: itemsCompraSchema,
})

export const filtrosProductosCompraSchema = z
  .strictObject({
    texto: z.string().trim().max(100, 'La búsqueda no puede superar 100 caracteres').optional(),
    /** Si se indica, se incluye el precio pactado con ese proveedor. */
    proveedor_id: id('El proveedor').optional(),
  })
  .default({})

export const filtrosComprasSchema = z
  .strictObject({
    proveedor_id: id('El proveedor').optional(),
    tipo_documento: tipoDocumentoSchema.optional(),
    nro_documento: z.string().trim().max(50, 'La búsqueda no puede superar 50 caracteres').optional(),
    desde: fecha('La fecha inicial').optional(),
    hasta: fecha('La fecha final').optional(),
    limite: z.number().int().min(1).max(200).default(50),
  })
  .refine((v) => !v.desde || !v.hasta || v.desde <= v.hasta, {
    message: 'La fecha inicial no puede ser posterior a la final',
    path: ['hasta'],
  })
  .default({ limite: 50 })

export const compraIdSchema = z.strictObject({ compra_id: id('La compra') })

/** Respuesta JSON de fn_registrar_compra (el comprobante que arma la BD). */
export const resultadoCompraBDSchema = z.object({
  compra_id: z.coerce.number(),
  proveedor_id: z.coerce.number(),
  proveedor: z.string(),
  tipo_documento: z.string(),
  nro_documento: z.string(),
  fecha_compra: z.string(),
  fecha_registro: z.string(),
  usuario_id: z.coerce.number(),
  total: z.coerce.number(),
  lineas: z
    .array(
      z.object({
        producto_id: z.coerce.number(),
        producto: z.string(),
        cantidad: z.coerce.number(),
        costo_unitario: z.coerce.number(),
        subtotal: z.coerce.number(),
        stock_anterior: z.coerce.number(),
        stock_resultante: z.coerce.number(),
        movimiento_id: z.coerce.number(),
      }),
    )
    .min(1),
})

export type RegistrarCompraInput = z.input<typeof registrarCompraSchema>
export type RegistrarCompraDatos = z.output<typeof registrarCompraSchema>
export type DocumentoCompraInput = z.input<typeof documentoCompraSchema>
export type ResumenCompraInput = z.input<typeof resumenCompraSchema>
export type FiltrosProductosCompraInput = z.input<typeof filtrosProductosCompraSchema>
export type FiltrosComprasInput = z.input<typeof filtrosComprasSchema>
export type CompraIdInput = z.input<typeof compraIdSchema>
export type ResultadoCompraBD = z.output<typeof resultadoCompraBDSchema>
