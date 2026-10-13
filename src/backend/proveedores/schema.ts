/**
 * CU14 — Gestionar Proveedores y Catálogo de Mayoristas · Validaciones (Zod)
 *
 * Compatible con Zod 3 y Zod 4 (mensajes con `{ message }`).
 * Este archivo no usa la base de datos, así que también lo puede importar
 * el formulario del navegador (proveedores-form.tsx) para validar igual que
 * el servidor.
 */
import { z } from 'zod';
import {
  ProveedorError,
  type ItemCatalogoDTO,
  type ItemCatalogoValidado,
  type ProveedorDTO,
  type ProveedorValidado,
} from './types';

// ---------------------------------------------------------------------------
// NIT flexible: letras, números y guiones, sin espacios.
// Acepta NIT numéricos (1023456789) y alfanuméricos (NIT-PROV-001).
// ---------------------------------------------------------------------------
export const NIT_REGEX = /^[A-Za-z0-9-]+$/;
export const NIT_MIN = 3;
export const NIT_MAX = 30; // NIT VARCHAR(30) en el DDL

/** true si el NIT tiene un formato aceptado */
export function nitValido(nit: string): boolean {
  return nit.length >= NIT_MIN && nit.length <= NIT_MAX && NIT_REGEX.test(nit) && /[A-Za-z0-9]/.test(nit);
}

export const MENSAJE_NIT = `NIT inválido: use de ${NIT_MIN} a ${NIT_MAX} letras, números o guiones, sin espacios (ej. NIT-PROV-001 o 1023456789)`;

const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEFONO_REGEX = /^[0-9+\s()-]{6,30}$/;
export const PRECIO_MAX = 9_999_999_999.99;

// ---------------------------------------------------------------------------
// Ayudantes
// ---------------------------------------------------------------------------
/** Texto recortado; '' → null */
const aTexto = (v: unknown): string | null => {
  const t = String(v ?? '').trim();
  return t.length ? t : null;
};

/** Texto obligatorio (recortado) */
const obligatorio = () => z.preprocess((v) => String(v ?? '').trim(), z.string());

/** Texto opcional: vacío se guarda como null */
const opcional = (max: number, mensaje: string) =>
  z.preprocess(aTexto, z.string().max(max, { message: mensaje }).nullable());

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Proveedor
// ---------------------------------------------------------------------------
export const proveedorSchema = z.object({
  razon_social: obligatorio()
    .refine((v) => v.length >= 3, { message: 'La razón social debe tener al menos 3 caracteres' })
    .refine((v) => v.length <= 200, { message: 'La razón social no puede superar 200 caracteres' }),
  // El NIT se respeta tal como se escribe (no se fuerzan mayúsculas)
  nit: obligatorio()
    .refine((v) => v.length > 0, { message: 'El NIT es obligatorio' })
    .refine((v) => v.length === 0 || nitValido(v), { message: MENSAJE_NIT }),
  contacto: opcional(150, 'El contacto no puede superar 150 caracteres'),
  telefono: z.preprocess(aTexto, z.string().regex(TELEFONO_REGEX, { message: 'Teléfono inválido' }).nullable()),
  correo: z.preprocess(
    (v) => aTexto(v)?.toLowerCase() ?? null,
    z
      .string()
      .max(150, { message: 'Correo electrónico inválido' })
      .regex(CORREO_REGEX, { message: 'Correo electrónico inválido' })
      .nullable()
  ),
  direccion: opcional(255, 'La dirección no puede superar 255 caracteres'),
});

// ---------------------------------------------------------------------------
// Ítem del catálogo del mayorista
// ---------------------------------------------------------------------------
export const itemCatalogoSchema = z.object({
  productoId: z.preprocess(
    (v) => Number(v),
    z
      .number({ message: 'Seleccione un producto del inventario' })
      .int({ message: 'Seleccione un producto del inventario' })
      .positive({ message: 'Seleccione un producto del inventario' })
  ),
  codigoItemProveedor: opcional(100, 'El código de ítem no puede superar 100 caracteres'),
  precioCompra: z.preprocess(
    (v) => {
      const t = String(v ?? '').trim();
      return t === '' ? undefined : Number(t);
    },
    z
      .number({ message: 'Ingrese el precio de compra' })
      .min(0, { message: 'El precio de compra no puede ser negativo' })
      .max(PRECIO_MAX, { message: 'Precio de compra fuera de rango' })
  ),
});

// ---------------------------------------------------------------------------
// Funciones de validación (lanzan ProveedorError con el primer problema)
// ---------------------------------------------------------------------------
/** Convierte el primer problema de Zod en un error de negocio */
function errorValidacion(error: z.ZodError): ProveedorError {
  return new ProveedorError(error.issues[0]?.message ?? 'Datos inválidos');
}

/** Normaliza y valida un ProveedorDTO */
export function validarProveedor(dto: ProveedorDTO): ProveedorValidado {
  const r = proveedorSchema.safeParse(dto ?? {});
  if (!r.success) throw errorValidacion(r.error);
  const d = r.data;
  return {
    razon_social: d.razon_social,
    nit: d.nit,
    contacto: d.contacto ?? null,
    telefono: d.telefono ?? null,
    correo: d.correo ?? null,
    direccion: d.direccion ?? null,
  };
}

/** Normaliza y valida un ítem del catálogo */
export function validarItemCatalogo(dto: ItemCatalogoDTO): ItemCatalogoValidado {
  const r = itemCatalogoSchema.safeParse(dto ?? {});
  if (!r.success) throw errorValidacion(r.error);
  const d = r.data;
  return { productoId: d.productoId, codigo: d.codigoItemProveedor ?? null, precio: r2(d.precioCompra) };
}
