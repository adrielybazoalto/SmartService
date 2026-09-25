import { z } from 'zod'
import type { NuevoProductoProveedor } from './types'

export const crearProveedorSchema = z.object({
  razon_social: z.string().min(2, 'La razón social es obligatoria').max(150),
  nit: z.string().min(1, 'El NIT es obligatorio').max(30),
  contacto: z.string().max(100).nullable().optional(),
  telefono: z.string().max(20).nullable().optional(),
  correo: z.string().email('Correo inválido').max(100).nullable().optional(),
})

export const actualizarProveedorSchema = crearProveedorSchema.partial()

export const asociarProductoProveedorSchema = z
  .object({
    producto_id: z.number().int().positive(),
    proveedor_id: z.number().int().positive(),
    precio_compra: z.coerce.number().min(0),
    codigo_item_proveedor: z.string().max(100).nullable().optional(),
  })
  .transform((v): NuevoProductoProveedor => ({
    ...v,
    precio_compra: v.precio_compra.toFixed(2),
  }))

export type CrearProveedorInput = z.infer<typeof crearProveedorSchema>
export type ActualizarProveedorInput = z.infer<typeof actualizarProveedorSchema>
export type AsociarProductoProveedorInput = z.input<typeof asociarProductoProveedorSchema>