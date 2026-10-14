import { z } from 'zod'

/** Convención de la aplicación (el esquema no define CHECK en CLIENTE). */
export const TIPO_CLIENTE = ['NATURAL', 'JURIDICO'] as const

/** Tipos de inmueble admitidos en el registro de establecimientos (CU07). */
export const TIPO_INMUEBLE = [
  'CASA',
  'DEPARTAMENTO',
  'LOCAL COMERCIAL',
  'OFICINA',
  'BODEGA',
  'OTRO',
] as const

/** Cadena vacía de un formulario → NULL para la BD. */
const vacioANull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

export const crearClienteSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(150),
  tipo_cliente: z.enum(TIPO_CLIENTE),
  razon_social: z.preprocess(vacioANull, z.string().trim().max(150).nullable().optional()),
  documento_identidad: z.preprocess(vacioANull, z.string().trim().max(30).nullable().optional()),
  correo: z.preprocess(
    vacioANull,
    z.string().trim().email('Correo inválido').max(100).nullable().optional(),
  ),
  telefono: z.preprocess(vacioANull, z.string().trim().max(20).nullable().optional()),
  telefono_alternativo: z.preprocess(vacioANull, z.string().trim().max(20).nullable().optional()),
})

export const actualizarClienteSchema = crearClienteSchema.partial()

/**
 * CU07 — Input ÚNICO del formulario "Nuevo Cliente y Establecimiento".
 * Mezcla los datos del cliente (paso 1) y los del establecimiento (paso 2)
 * con los nombres de campo del diagrama (camelCase). El Controlador
 * (ControlGestionarClientes) lo valida y lo proyecta a las tablas:
 *   cliente.* + establecimiento.*
 */
export const registrarClienteCompletoSchema = z.object({
  // ── Paso 1: datos del cliente ──
  tipoCliente: z.enum(TIPO_CLIENTE),
  documento: z
    .preprocess(vacioANull, z.string().trim().max(30).nullable().optional()),
  nombreRazonSocial: z.string().trim().min(2, 'El nombre o razón social es obligatorio').max(150),
  telefono: z.preprocess(vacioANull, z.string().trim().max(20).nullable().optional()),
  telefonoAlternativo: z.preprocess(vacioANull, z.string().trim().max(20).nullable().optional()),
  correo: z.preprocess(
    vacioANull,
    z.string().trim().email('Correo inválido').max(100).nullable().optional(),
  ),
  // ── Paso 2: datos del establecimiento ──
  nombreEstablecimiento: z.string().trim().min(2, 'El nombre del establecimiento es obligatorio').max(150),
  tipoInmueble: z.preprocess(vacioANull, z.enum(TIPO_INMUEBLE).nullable().optional()),
  direccion: z.string().trim().min(1, 'La dirección es obligatoria').max(255),
  latitud: z.preprocess(
    vacioANull,
    z
      .string()
      .trim()
      .regex(/^-?\d{1,2}(\.\d{1,7})?$/, 'Latitud inválida (ej. -17.783333)')
      .nullable()
      .optional(),
  ),
  longitud: z.preprocess(
    vacioANull,
    z
      .string()
      .trim()
      .regex(/^-?\d{1,3}(\.\d{1,7})?$/, 'Longitud inválida (ej. -63.182222)')
      .nullable()
      .optional(),
  ),
})

/**
 * CU07 — Input para la edición de datos de un cliente existente.
 */
export const editarClienteFormularioSchema = z.object({
  id: z.number().int().positive('ID de cliente inválido'),
  tipoCliente: z.enum(TIPO_CLIENTE),
  documento: z.preprocess(vacioANull, z.string().trim().max(30).nullable().optional()),
  nombreRazonSocial: z.string().trim().min(2, 'El nombre o razón social es obligatorio').max(150),
  telefono: z.preprocess(vacioANull, z.string().trim().max(20).nullable().optional()),
  telefonoAlternativo: z.preprocess(vacioANull, z.string().trim().max(20).nullable().optional()),
  correo: z.preprocess(
    vacioANull,
    z.string().trim().email('Correo inválido').max(100).nullable().optional(),
  ),
})

export type CrearClienteInput = z.infer<typeof crearClienteSchema>
export type ActualizarClienteInput = z.infer<typeof actualizarClienteSchema>
export type RegistroClienteCompletoInput = z.infer<typeof registrarClienteCompletoSchema>
/** Tipo del formulario tal como lo envía la IU (antes de los preprocess). */
export type RegistroClienteFormulario = z.input<typeof registrarClienteCompletoSchema>
export type EditarClienteFormulario = z.infer<typeof editarClienteFormularioSchema>