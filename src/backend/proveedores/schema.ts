/**
 * CU014 — 2° schema.ts · Esquemas de validación con Zod
 */
import { z } from 'zod';

const textoOpcional = (max: number, campo: string) =>
  z
    .string()
    .trim()
    .max(max, `${campo}: máximo ${max} caracteres`)
    .optional()
    .nullable()
    .transform((s) => (s ? s : null));

/** proveedorDTO (registrarDatosProveedor) */
export const proveedorSchema = z.object({
  razon_social: z
    .string()
    .trim()
    .min(3, 'La razón social debe tener al menos 3 caracteres')
    .max(200, 'La razón social no puede superar 200 caracteres'),
  nit: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z-]{5,50}\$/, 'NIT inválido (5 a 50 caracteres: números, letras o guiones)'),
  contacto: textoOpcional(150, 'Contacto'),
  telefono: textoOpcional(30, 'Teléfono').refine((t) => !t || /^[0-9+\s()-]{6,30}\$/.test(t), 'Teléfono inválido'),
  correo: textoOpcional(150, 'Correo')
    .refine((c) => !c || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}\$/.test(c), 'Correo electrónico inválido')
    .transform((c) => (c ? c.toLowerCase() : null)),
  direccion: textoOpcional(255, 'Dirección'),
});

/** Ítem de listaDTO (seleccionarProveedorYCatalogo) */
export const productoCatalogoSchema = z.object({
  productoId: z.coerce.number().int().positive('Producto inválido'),
  codigoItemProveedor: textoOpcional(100, 'Código de ítem'),
  precioMayorista: z.coerce
    .number()
    .finite('Precio inválido')
    .min(0, 'El precio no puede ser negativo')
    .max(9_999_999_999.99, 'Precio fuera de rango')
    .transform((n) => Math.round(n * 100) / 100),
  stockDisponible: z.coerce
    .number()
    .int('El stock debe ser un número entero')
    .min(0, 'El stock no puede ser negativo')
    .max(100_000_000, 'Stock fuera de rango')
    .default(0),
});

export const listaCatalogoSchema = z
  .array(productoCatalogoSchema)
  .min(1, 'Agregue al menos un producto al catálogo')
  .max(500, 'Máximo 500 productos por actualización');

// Tipos inferidos automáticamente por Zod (evita conflictos de tipos manuales)
export type CrearProveedorInput = z.infer<typeof proveedorSchema>;
export type ProductoCatalogoInput = z.infer<typeof productoCatalogoSchema>;