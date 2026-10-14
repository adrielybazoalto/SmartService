import { z } from 'zod'

/**
 * Esquemas Zod de CU16. Solo dependen de `zod` (se prueban sin Next.js).
 * Los límites replican las restricciones de la BD (schema.sql +
 * migracion_cu16_inventario.sql); la BD vuelve a validar.
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

const monto = (campo: string) =>
  numero(campo)
    .refine((v) => v >= 0, `${campo} no puede ser negativo`)
    .refine((v) => v <= MAX_NUMERIC_12_2, `${campo} excede el máximo permitido`)
    .refine(conDosDecimales, `${campo} admite como máximo 2 decimales`)

const cantidadPositiva = (campo: string) =>
  numero(campo)
    .refine((v) => v > 0, `${campo} debe ser mayor a 0`)
    .refine((v) => v <= MAX_NUMERIC_12_2, `${campo} excede el máximo permitido`)
    .refine(conDosDecimales, `${campo} admite como máximo 2 decimales`)

/** Entero positivo como number o string de dígitos (p. ej. un id que llega por la URL). */
const id = (campo: string) =>
  z
    .union([z.number(), z.string()], { message: `${campo} inválido` })
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

const textoOpcional = (max: number, campo: string) =>
  z
    .string()
    .trim()
    .max(max, `${campo} no puede superar ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null))

/** Código interno: mayúsculas, letras/dígitos y . _ / - ; 2–50 caracteres. */
export const codigoProductoSchema = z
  .string({ message: 'El código es obligatorio' })
  .trim()
  .toUpperCase()
  .min(2, 'El código debe tener al menos 2 caracteres')
  .max(50, 'El código no puede superar 50 caracteres')
  .regex(/^[A-Z0-9][A-Z0-9._/-]*$/, 'El código solo admite letras, dígitos, punto, guion bajo, barra y guion')

const camposProducto = {
  codigo: codigoProductoSchema,
  nombre: z.string({ message: 'El nombre es obligatorio' }).trim().min(2, 'El nombre es obligatorio').max(150, 'El nombre no puede superar 150 caracteres'),
  descripcion_tecnica: textoOpcional(2000, 'La descripción técnica'),
  unidad_medida: z.string({ message: 'La unidad de medida es obligatoria' }).trim().min(1, 'La unidad de medida es obligatoria').max(50, 'La unidad de medida no puede superar 50 caracteres'),
  margen_ganancia: monto('El margen de ganancia').refine((v) => v <= 100, 'El margen de ganancia no puede superar 100 %'),
  precio_compra_actual: monto('El precio de compra'),
  stock_minimo: monto('El stock mínimo'),
  categoria_id: id('La categoría'),
  url_imagen: z
    .string()
    .trim()
    .max(1000000, 'La imagen excede el tamaño permitido')
    .nullish()
    .transform((v) => (v ? v : null)),
}

/**
 * Alta de producto. Objeto ESTRICTO: rechaza `stock_disponible` (y cualquier
 * otro campo): el stock inicial siempre es 0 y solo cambia por el kárdex.
 */
export const registrarProductoSchema = z.strictObject({
  ...camposProducto,
  descripcion_tecnica: camposProducto.descripcion_tecnica.default(null),
  margen_ganancia: camposProducto.margen_ganancia.default(0),
  precio_compra_actual: camposProducto.precio_compra_actual.default(0),
  stock_minimo: camposProducto.stock_minimo.default(0),
  url_imagen: camposProducto.url_imagen.default(null),
})

/** Modificación: al menos un campo; el stock NO es modificable aquí. */
export const modificarProductoSchema = z
  .strictObject({
    producto_id: id('El producto'),
    codigo: camposProducto.codigo.optional(),
    nombre: camposProducto.nombre.optional(),
    descripcion_tecnica: camposProducto.descripcion_tecnica.optional(),
    unidad_medida: camposProducto.unidad_medida.optional(),
    margen_ganancia: camposProducto.margen_ganancia.optional(),
    precio_compra_actual: camposProducto.precio_compra_actual.optional(),
    stock_minimo: camposProducto.stock_minimo.optional(),
    categoria_id: camposProducto.categoria_id.optional(),
    url_imagen: camposProducto.url_imagen.optional(),
  })
  .refine((v) => Object.keys(v).some((k) => k !== 'producto_id' && v[k as keyof typeof v] !== undefined), {
    message: 'No hay cambios que guardar',
  })

export const productoIdSchema = z.strictObject({ producto_id: id('El producto') })

export const filtrosProductosSchema = z
  .strictObject({
    texto: z.string().trim().max(100, 'La búsqueda no puede superar 100 caracteres').optional(),
    categoria_id: id('La categoría').optional(),
    incluir_inactivos: z.boolean().optional(),
    solo_criticos: z.boolean().optional(),
  })
  .default({})

export const registrarCategoriaSchema = z.strictObject({
  nombre: z.string({ message: 'El nombre es obligatorio' }).trim().min(2, 'El nombre de la categoría es obligatorio').max(100, 'El nombre no puede superar 100 caracteres'),
  descripcion: textoOpcional(255, 'La descripción').default(null),
})

/** Ajuste por conteo físico (D4): se indica el stock contado. */
export const registrarAjusteSchema = z.strictObject({
  producto_id: id('El producto'),
  stock_contado: monto('El stock contado'),
  justificacion: z
    .string({ message: 'La justificación es obligatoria' })
    .trim()
    .min(10, 'La justificación del ajuste es obligatoria (mínimo 10 caracteres)')
    .max(1000, 'La justificación no puede superar 1000 caracteres'),
})

export const registrarInventarioInicialSchema = z.strictObject({
  producto_id: id('El producto'),
  cantidad: cantidadPositiva('La cantidad'),
  observacion: textoOpcional(1000, 'La observación').default(null),
})

/** Respuesta JSON de fn_registrar_ajuste / fn_registrar_inventario_inicial. */
export const resultadoMovimientoBDSchema = z.object({
  movimiento_id: z.coerce.number(),
  producto_id: z.coerce.number(),
  producto: z.string(),
  motivo: z.string().optional(),
  cantidad: z.coerce.number(),
  stock_anterior: z.coerce.number(),
  stock_resultante: z.coerce.number(),
})

export type RegistrarProductoInput = z.input<typeof registrarProductoSchema>
export type ModificarProductoInput = z.input<typeof modificarProductoSchema>
export type ProductoIdInput = z.input<typeof productoIdSchema>
export type FiltrosProductosInput = z.input<typeof filtrosProductosSchema>
export type RegistrarCategoriaInput = z.input<typeof registrarCategoriaSchema>
export type RegistrarAjusteInput = z.input<typeof registrarAjusteSchema>
export type RegistrarInventarioInicialInput = z.input<typeof registrarInventarioInicialSchema>
