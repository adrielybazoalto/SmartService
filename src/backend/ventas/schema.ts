/**
 * CU09 — Esquemas de validación (Zod)
 * Se usan en el servicio para validar todo lo que llega desde la IU.
 *
 * Compatible con Zod 3 y Zod 4: los mensajes se pasan con `{ message }`,
 * que ambas versiones aceptan. Sin ellos, Zod 4 responde en inglés.
 */
import { z } from 'zod';
import { TIPOS_COMPROBANTE, TIPOS_PAGO } from './types';

const MONTO_MAXIMO = 9_999_999_999.99; // NUMERIC(12,2)

/** ¿Tiene como máximo 2 decimales? (NUMERIC(10,2) / (12,2)) */
const dosDecimales = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/** Monto en Bs: acepta number o string numérico, ≥ 0 y con 2 decimales */
const monto = (campo: string) =>
  z.coerce
    .number({ message: `${campo} debe ser un número válido` })
    .min(0, { message: `${campo} no puede ser negativo` })
    .max(MONTO_MAXIMO, { message: `${campo} excede el máximo permitido` })
    .transform((n) => Math.round(n * 100) / 100);

const id = (campo: string) =>
  z.coerce
    .number({ message: `${campo} inválido` })
    .int({ message: `${campo} inválido` })
    .positive({ message: `${campo} inválido` });

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
    .string({ message: 'Observación inválida' })
    .trim()
    .max(500, { message: 'La observación no puede superar 500 caracteres' })
    .optional()
    .transform((s) => (s ? s : undefined)),
  cajaId: id('Caja').optional(),
});

// ---------------------------------------------------------------------------
// Venta
// ---------------------------------------------------------------------------

/** Ítem de venta: un producto con su cantidad */
export const itemVentaSchema = z.object({
    productoId: id('Producto'),
    cantidad: z.coerce
      .number({ message: 'Cantidad inválida' })
      .positive({ message: 'La cantidad debe ser mayor a 0' })
      .max(100_000, { message: 'Cantidad fuera de rango' })
      .refine(dosDecimales, { message: 'La cantidad admite como máximo 2 decimales' }),
});

/** datosVentaDTO (sin usuarioId, que lo pone el servidor desde la sesión) */
export const registrarVentaSchema = z.object({
  clienteId: id('Cliente').nullable().optional(),
  tipoPago: z.enum(TIPOS_PAGO, { message: 'Método de pago no válido' }),
  /** N° de referencia del comprobante (obligatorio en TRANSFERENCIA) */
  referenciaPago: z.string().trim().max(60, { message: 'La referencia admite hasta 60 caracteres' }).optional(),
  tipoComprobante: z.enum(TIPOS_COMPROBANTE, { message: 'Tipo de comprobante inválido' }),
  descuento: monto('El descuento').default(0),
  items: z
    .array(itemVentaSchema, { message: 'Lista de ítems inválida' })
    .min(1, { message: 'Agregue al menos un producto a la venta' })
    .max(100, { message: 'Demasiadas líneas en una sola venta' }),
}).refine((d) => d.tipoPago !== 'TRANSFERENCIA' || !!d.referenciaPago, {
  message: 'Ingrese el número de referencia de la transferencia',
  path: ['referenciaPago'],
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