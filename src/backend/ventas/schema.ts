/**
 * CU09 — Esquemas de validación (Zod)
 * Se usan en el servicio para validar todo lo que llega desde la IU.
 */
import { z } from 'zod';
import { TIPOS_COMPROBANTE, TIPOS_PAGO } from './types';

const MONTO_MAXIMO = 9_999_999_999.99; // NUMERIC(12,2)

/** Monto en Bs: acepta number o string numérico, ≥ 0 y con 2 decimales */
const monto = (campo: string) =>
  z.coerce
    .number()
    .min(0, `${campo} no puede ser negativo`)
    .max(MONTO_MAXIMO, `${campo} excede el máximo permitido`)
    .transform((n) => Math.round(n * 100) / 100);

const id = (campo: string) =>
  z.coerce.number().int(`${campo} inválido`).positive(`${campo} inválido`);
// ---------------------------------------------------------------------------
// Caja
// ---------------------------------------------------------------------------

/** seleccionarAperturaCaja(montoInicial) */
export const aperturaCajaSchema = z.object({
  montoInicial: monto('El fondo inicial'),
});

/** ingresarConteoFisico(montoReal) */
export const cierreCajaSchema = z.object({
  montoReal: monto('El efectivo contado'),
  observacion: z
    .string()
    .trim()
    .max(500, 'La observación no puede superar 500 caracteres')
    .optional()
    .transform((s) => (s ? s : undefined)),
});

// ---------------------------------------------------------------------------
// Venta
// ---------------------------------------------------------------------------

/** Ítem de venta (productoId, cantidad) */
export const itemVentaSchema = z.object({
  productoId: id('Producto'),
  cantidad: z.coerce
    .number()
    .int('La cantidad debe ser un número entero')
    .positive('La cantidad debe ser mayor a 0')
    .max(100_000, 'Cantidad fuera de rango'),
});

/** datosVentaDTO (sin usuarioId/ip, que los pone el servidor) */
export const registrarVentaSchema = z.object({
  clienteId: id('Cliente').nullable().optional(),
  tipoPago: z.enum(TIPOS_PAGO),
  tipoComprobante: z.enum(TIPOS_COMPROBANTE),
  descuento: monto('El descuento').default(0),
  items: z
    .array(itemVentaSchema)
    .min(1, 'Agregue al menos un producto a la venta')
    .max(100, 'Demasiadas líneas en una sola venta'),
});

/** Anulación (subflujo) */
export const anularVentaSchema = z.object({
  ventaId: id('Venta'),
});

// ---------------------------------------------------------------------------
// Tipos inferidos
// ---------------------------------------------------------------------------
export type AperturaCajaInput = z.input<typeof aperturaCajaSchema>;
export type CierreCajaInput = z.input<typeof cierreCajaSchema>;
export type ItemVentaInput = z.input<typeof itemVentaSchema>;
export type RegistrarVentaInput = z.input<typeof registrarVentaSchema>;
export type RegistrarVentaData = z.output<typeof registrarVentaSchema>;
