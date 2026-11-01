'use server'

import { z } from 'zod'
import { requireUser } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { tienePermisoModulo } from '@/lib/permisos'
import { obtenerIpOrigen } from '@/lib/ip'
import { guardarEventoCliente } from '@/backend/bitacora'
import {
  actualizarCliente,
  crearCliente,
  listarClientes,
  buscarClientes,
  verificarDocumento,
  registrarClienteCompletoSchema,
  editarClienteFormularioSchema,
  type CrearClienteInput,
  type RegistroClienteFormulario,
  type EditarClienteFormulario,
  type Cliente,
} from '@/backend/clientes'
import {
  crearEstablecimiento,
  listarEstablecimientos,
  type CrearEstablecimientoInput,
  type Establecimiento,
} from '@/backend/establecimientos'

/**
 * CONTROLADOR: ControlGestionarClientes (CU07).
 * Orquesta el registro de un cliente y su establecimiento contra Supabase,
 * validando el documento único y registrando el evento de bitácora.
 *
 * Acceso: permiso CLIENTES (LEER) en ROL_FUNCION (BD) + sesión JWT propia.
 */

// ── Entidades para la IU (nunca exponen columnas de auditoría) ──────────────

export interface EstablecimientoEntity {
  id: number
  cliente_id: number
  nombre_establecimiento: string
  direccion: string
  tipo_inmueble: string | null
  latitud: string | null
  longitud: string | null
}

export interface ClienteEntity {
  id: number
  nombre: string
  tipo_cliente: string
  razon_social: string | null
  documento_identidad: string | null
  correo: string | null
  telefono: string | null
  telefono_alternativo: string | null
  fecha_registro: string
  establecimientos: EstablecimientoEntity[]
}

export interface RespuestaAccionCliente {
  ok: boolean
  mensaje: string
  data?: {
    cliente: ClienteEntity
    establecimiento: EstablecimientoEntity
  }
}

// ── Guard de acceso del módulo ──────────────────────────────────────────────

async function exigirAccesoClientes() {
  if (!(await tienePermisoModulo('/clientes'))) {
    throw new Error('No autorizado: tu rol no tiene el permiso del módulo Clientes.')
  }
  return requireUser()
}

// ── Mapeo tabla → entidad ───────────────────────────────────────────────────

function aEntidadEstablecimiento(e: Establecimiento): EstablecimientoEntity {
  return {
    id: e.id,
    cliente_id: e.cliente_id,
    nombre_establecimiento: e.nombre_establecimiento,
    direccion: e.direccion,
    tipo_inmueble: e.tipo_inmueble,
    latitud: e.latitud,
    longitud: e.longitud,
  }
}

function aEntidadCliente(c: Cliente, establecimientos: EstablecimientoEntity[]): ClienteEntity {
  return {
    id: c.id,
    nombre: c.nombre,
    tipo_cliente: c.tipo_cliente,
    razon_social: c.razon_social,
    documento_identidad: c.documento_identidad,
    correo: c.correo,
    telefono: c.telefono,
    telefono_alternativo: c.telefono_alternativo,
    fecha_registro: c.fecha_registro,
    establecimientos,
  }
}

/** Primer mensaje legible de un error zod / de servicio. */
function mensajeDeError(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) {
    return e.issues[0]?.message ?? fallback
  }
  return e instanceof Error ? e.message : fallback
}

// ── Operaciones del ControlGestionarClientes (CU07) ─────────────────────────

/** Llama a verificarDocumento(): ¿ya existe un cliente con ese documento? */
export async function validarDocumentoUnico(documento: string): Promise<{ existe: boolean }> {
  await exigirAccesoClientes()

  if (!documento || !documento.trim()) return { existe: false }

  const db = getSupabaseServiceClient()
  const existente = await verificarDocumento(db, documento)
  return { existe: Boolean(existente) }
}

/** Crea el cliente en Supabase (tabla CLIENTE). Devuelve la fila creada. */
export async function registrarClienteBD(datosCliente: CrearClienteInput): Promise<Cliente> {
  await exigirAccesoClientes()

  const db = getSupabaseServiceClient()
  return crearCliente(db, datosCliente)
}

/** Crea el establecimiento vinculado al cliente (tabla ESTABLECIMIENTO). */
export async function registrarEstablecimientoBD(
  datosEstablecimiento: CrearEstablecimientoInput,
): Promise<Establecimiento> {
  await exigirAccesoClientes()

  const db = getSupabaseServiceClient()
  return crearEstablecimiento(db, datosEstablecimiento)
}

/**
 * Invoca guardarEventoCliente() en la bitácora (CU06), persistando la IP de
 * origen del solicitante. Un fallo de auditoría NO interrumpe el registro del
 * cliente.
 */
export async function registrarBitacoraAccion(
  usuario_id: number,
  accion: string,
  descripcion: string,
  ip: string | null,
): Promise<void> {
  try {
    const db = getSupabaseServiceClient()
    await guardarEventoCliente(db, usuario_id, accion, descripcion, ip)
  } catch (e) {
    console.error('Error al registrar en bitácora (CU07):', e)
  }
}

/**
 * Orquesta el flujo completo del CU07:
 *   1. validación del documento único (verificarDocumento)
 *   2. creación del cliente (CLIENTE)
 *   3. creación del establecimiento (ESTABLECIMIENTO)
 *   4. registro en bitácora (guardarEventoCliente) con la IP de origen
 */
export async function procesarRegistroCliente(
  datosFormulario: RegistroClienteFormulario,
): Promise<RespuestaAccionCliente> {
  try {
    const actor = await exigirAccesoClientes()
    const formulario = registrarClienteCompletoSchema.parse(datosFormulario)
    const db = getSupabaseServiceClient()

    // 1) Documento único (solo si se informó el documento).
    if (formulario.documento) {
      const existente = await verificarDocumento(db, formulario.documento)
      if (existente) {
        return {
          ok: false,
          mensaje: `Ya existe un cliente con el documento ${formulario.documento}.`,
        }
      }
    }

    // 2) Cliente: para JURIDICO, "nombreRazonSocial" alimenta también razon_social.
    const cliente = await registrarClienteBD({
      nombre: formulario.nombreRazonSocial.trim(),
      tipo_cliente: formulario.tipoCliente,
      razon_social:
        formulario.tipoCliente === 'JURIDICO' ? formulario.nombreRazonSocial.trim() : null,
      documento_identidad: formulario.documento ?? null,
      correo: formulario.correo ?? null,
      telefono: formulario.telefono ?? null,
      telefono_alternativo: formulario.telefonoAlternativo ?? null,
    })

    // 3) Establecimiento vinculado al cliente recién creado.
    const establecimiento = await registrarEstablecimientoBD({
      cliente_id: cliente.id,
      nombre_establecimiento: formulario.nombreEstablecimiento.trim(),
      direccion: formulario.direccion.trim(),
      tipo_inmueble: formulario.tipoInmueble ?? null,
      latitud: formulario.latitud ?? null,
      longitud: formulario.longitud ?? null,
    })

    // 4) Bitácora (guardarEventoCliente), incluyendo la IP de origen.
    const ip = await obtenerIpOrigen()
    await registrarBitacoraAccion(
      actor.id,
      'REGISTRO_CLIENTE',
      `Se registró el cliente ${cliente.nombre} (${cliente.tipo_cliente}) con el establecimiento ${establecimiento.nombre_establecimiento} (${establecimiento.direccion}).`,
      ip,
    )

    return {
      ok: true,
      mensaje: 'Cliente y establecimiento registrados exitosamente.',
      data: {
        cliente: aEntidadCliente(cliente, [aEntidadEstablecimiento(establecimiento)]),
        establecimiento: aEntidadEstablecimiento(establecimiento),
      },
    }
  } catch (e) {
    return {
      ok: false,
      mensaje: mensajeDeError(e, 'No se pudo registrar el cliente y su establecimiento.'),
    }
  }
}

/**
 * Orquesta la actualización de los datos de un cliente existente:
 *   1. valida documento único (que no pertenezca a otro cliente)
 *   2. actualiza el registro en la tabla CLIENTE (incluyendo teléfono alternativo)
 *   3. audita el cambio en la bitácora (ACTUALIZAR_CLIENTE) capturando la IP
 */
export async function procesarActualizacionCliente(
  datosFormulario: EditarClienteFormulario,
): Promise<RespuestaAccionCliente> {
  try {
    const actor = await exigirAccesoClientes()
    const formulario = editarClienteFormularioSchema.parse(datosFormulario)
    const db = getSupabaseServiceClient()

    // 1) Si se modificó o especificó el documento, validar que no pertenezca a otro cliente
    if (formulario.documento) {
      const existente = await verificarDocumento(db, formulario.documento)
      if (existente && existente.id !== formulario.id) {
        return {
          ok: false,
          mensaje: `Ya existe otro cliente registrado con el documento ${formulario.documento}.`,
        }
      }
    }

    // 2) Actualizar el cliente
    const cliente = await actualizarCliente(db, formulario.id, {
      nombre: formulario.nombreRazonSocial.trim(),
      tipo_cliente: formulario.tipoCliente,
      razon_social:
        formulario.tipoCliente === 'JURIDICO' ? formulario.nombreRazonSocial.trim() : null,
      documento_identidad: formulario.documento ?? null,
      correo: formulario.correo ?? null,
      telefono: formulario.telefono ?? null,
      telefono_alternativo: formulario.telefonoAlternativo ?? null,
    })

    // 3) Obtener establecimientos del cliente
    const { data: ests } = await db
      .from('establecimiento')
      .select('*')
      .eq('cliente_id', cliente.id)
      .order('id', { ascending: true })
    const establecimientos = (ests ?? []).map(aEntidadEstablecimiento)

    // 4) Bitácora (guardarEventoCliente), incluyendo la IP de origen
    const ip = await obtenerIpOrigen()
    await registrarBitacoraAccion(
      actor.id,
      'ACTUALIZAR_CLIENTE',
      `Se actualizaron los datos del cliente ${cliente.nombre} (ID: ${cliente.id}, ${cliente.tipo_cliente}).`,
      ip,
    )

    return {
      ok: true,
      mensaje: 'Datos del cliente actualizados exitosamente.',
      data: {
        cliente: aEntidadCliente(cliente, establecimientos),
        establecimiento: establecimientos[0] ?? ({} as EstablecimientoEntity),
      },
    }
  } catch (e) {
    return {
      ok: false,
      mensaje: mensajeDeError(e, 'No se pudo actualizar el cliente.'),
    }
  }
}

// ── Consultas para la IU (solicitarModuloClientes) ──────────────────────────

/** Lista de clientes con sus establecimientos (pantalla inicial del CU07, con soporte de búsqueda). */
export async function listarClientesAction(termino?: string): Promise<ClienteEntity[]> {
  await exigirAccesoClientes()

  const db = getSupabaseServiceClient()
  const [clientes, establecimientos] = await Promise.all([
    termino && termino.trim() ? buscarClientes(db, termino) : listarClientes(db),
    listarEstablecimientos(db),
  ])

  const porCliente = new Map<number, EstablecimientoEntity[]>()
  for (const e of establecimientos) {
    const lista = porCliente.get(e.cliente_id) ?? []
    lista.push(aEntidadEstablecimiento(e))
    porCliente.set(e.cliente_id, lista)
  }

  return clientes.map((c) => aEntidadCliente(c, porCliente.get(c.id) ?? []))
}