import { z } from 'zod'
import { TIPO_MOVIMIENTO } from './types'

export const crearCategoriaSchema = z.object({
  nombre: z.string().min(1, 'El nombre es obligatorio').max(100),
  descripcion: z.string().nullable().optional(),
})

export const actualizarCategoriaSchema = crearCategoriaSchema.partial()

export const crearProductoSchema = z.object({
  nombre: z.string().min(2, 'El nombre es obligatorio').max(150),
  descripcion_tecnica: z.string().nullable().optional(),
  unidad_medida: z.string().max(30).nullable().optional(),
  margen_ganancia: z.coerce.number().min(0).max(100).nullable().optional(),
  precio_compra_actual: z.coerce.number().min(0, 'El precio de compra es obligatorio'),
  stock_disponible: z.coerce.number().min(0).default(0),
  stock_minimo: z.coerce.number().min(0).default(0),
  categoria_id: z.number().int().positive('Debe seleccionar una categoría'),
})

export const actualizarProductoSchema = z
  .object({
    nombre: z.string().min(2).max(150),
    descripcion_tecnica: z.string().nullable(),
    unidad_medida: z.string().max(30).nullable(),
    margen_ganancia: z.coerce.number().min(0).max(100).nullable(),
    precio_compra_actual: z.coerce.number().min(0),
    stock_disponible: z.coerce.number().min(0),
    stock_minimo: z.coerce.number().min(0),
    categoria_id: z.number().int().positive(),
  })
  .partial()

export const registrarMovimientoKardexSchema = z.object({
  producto_id: z.number().int().positive(),
  tipo_movimiento: z.enum(TIPO_MOVIMIENTO),
  cantidad: z.coerce.number().positive('La cantidad debe ser mayor a 0'),
  origen_movimiento: z.string().max(100).nullable().optional(),
  observacion: z.string().nullable().optional(),
})

export const crearImagenProductoSchema = z.object({
  producto_id: z.number().int().positive(),
  url_imagen: z.string().url('URL de imagen inválida'),
  es_principal: z.boolean().default(false),
  orden: z.number().int().min(0).default(1),
})

export type CrearCategoriaInput = z.infer<typeof crearCategoriaSchema>
export type ActualizarCategoriaInput = z.infer<typeof actualizarCategoriaSchema>
export type CrearProductoInput = z.infer<typeof crearProductoSchema>
export type ActualizarProductoInput = z.infer<typeof actualizarProductoSchema>
export type RegistrarMovimientoKardexInput = z.infer<typeof registrarMovimientoKardexSchema>
export type CrearImagenProductoInput = z.infer<typeof crearImagenProductoSchema>