import type { SupabaseClient } from '@supabase/supabase-js'
import type { Db } from '@/lib/supabase/types'
import { registrarEvento } from '@/backend/bitacora'
import { ahoraBolivia, ventanaBolivia } from '@/lib/fechas'
import type { OrdenTrabajo } from '@/backend/ordenes/types'
import {
  ETIQUETA_ESTADO,
  TRANSICIONES_TICKET,
  codigoTicket,
  esEstadoTicket,
  esTipoTicket,
  esUrgenciaTicket,
  type EstadoTicket,
} from './constantes'
import { etiquetaSistema, filtrarSistemasPorTexto } from './busqueda'
import {
  cambiarEstadoTicketSchema,
  crearTicketSchema,
  derivarTicketSchema,
  primerError,
  type CrearTicketInput,
  type DerivarTicketInput,
} from './schema'
import type { MantenimientoTicket, SistemaOpcion, TicketListado } from './types'

const MSG_FALTA_MIGRACION = 'Falta aplicar la migración del CU18 (migracion_cu18_tickets.sql) en la base de datos'
const MSG_SISTEMA_INACTIVO =
  'El sistema instalado seleccionado no existe o su cliente/establecimiento está inactivo.'

/** Las consultas con embebidos se hacen sin tipos generados (los de database.types.ts no traen esos nombres de FK). */
const sinTipos = (db: Db) => db as unknown as SupabaseClient

// ---------------------------------------------------------------------
// Filas crudas de PostgREST (un embebido puede llegar como objeto o como arreglo)
// ---------------------------------------------------------------------
type Uno<T> = T | T[] | null

interface FilaSistema {
  id: number
  nombre_sistema: string
  numero_serie: string | null
  establecimiento: Uno<{
    id: number
    nombre_establecimiento: string
    cliente: Uno<{ id: number; nombre: string; razon_social: string | null }>
  }>
}

interface FilaTicket {
  id: number
  tipo_mantenimiento: string
  nivel_urgencia: string | null
  descripcion_incidencia: string
  fecha_reporte: string
  estado: string
  sistema_instalado: Uno<FilaSistema>
  orden_trabajo: Uno<{ id: number; codigo_orden: string; estado: string }>
}

function uno<T>(valor: Uno<T> | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null
  return valor ?? null
}

const SELECT_SISTEMA_ACTIVO =
  'id, nombre_sistema, numero_serie, establecimiento!inner(id, nombre_establecimiento, estado, cliente!inner(id, nombre, razon_social, estado))'

function aSistemaOpcion(fila: FilaSistema): SistemaOpcion | null {
  const est = uno(fila.establecimiento)
  const cli = uno(est?.cliente)
  if (!est || !cli) return null
  return {
    id: fila.id,
    nombre_sistema: fila.nombre_sistema,
    numero_serie: fila.numero_serie,
    establecimiento: { id: est.id, nombre: est.nombre_establecimiento },
    cliente: { id: cli.id, nombre: cli.nombre, razon_social: cli.razon_social },
  }
}

// ---------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------

/** Sistemas instalados con cliente y establecimiento activos (selector del nuevo ticket). */
export async function listarSistemasActivos(db: Db): Promise<SistemaOpcion[]> {
  const { data, error } = await sinTipos(db)
    .from('sistema_instalado')
    .select(SELECT_SISTEMA_ACTIVO)
    .eq('establecimiento.estado', true)
    .eq('establecimiento.cliente.estado', true)
    .order('id', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los sistemas instalados: ${error.message}`)
  return ((data ?? []) as unknown as FilaSistema[])
    .map(aSistemaOpcion)
    .filter((s): s is SistemaOpcion => s !== null)
    .sort((a, b) => etiquetaSistema(a).localeCompare(etiquetaSistema(b), 'es'))
}

/** Resolución por voz: coincidencias con lo dictado, solo entre los sistemas activos. */
export async function buscarSistemasPorTexto(
  db: Db,
  textos: { clienteTexto?: string | null; sistemaTexto?: string | null },
): Promise<SistemaOpcion[]> {
  if (!textos.clienteTexto?.trim() && !textos.sistemaTexto?.trim()) return []
  return filtrarSistemasPorTexto(await listarSistemasActivos(db), textos)
}

/** Listado de tickets con cliente > establecimiento > sistema y su OT, si la tiene. */
export async function listarTickets(db: Db): Promise<TicketListado[]> {
  const { data, error } = await sinTipos(db)
    .from('mantenimiento_ticket')
    .select(
      'id, tipo_mantenimiento, nivel_urgencia, descripcion_incidencia, fecha_reporte, estado, ' +
        'sistema_instalado(id, nombre_sistema, numero_serie, establecimiento(id, nombre_establecimiento, cliente(id, nombre, razon_social))), ' +
        'orden_trabajo!fk_orden_ticket(id, codigo_orden, estado)',
    )
    .order('id', { ascending: false })
  if (error) throw new Error(`No se pudieron cargar los tickets: ${error.message}`)

  return ((data ?? []) as unknown as FilaTicket[]).map((t) => {
    const sistema = uno(t.sistema_instalado)
    const opcion = sistema ? aSistemaOpcion(sistema) : null
    const orden = uno(t.orden_trabajo)
    return {
      id: t.id,
      codigo: codigoTicket(t.id, t.fecha_reporte),
      fecha_reporte: t.fecha_reporte,
      estado: esEstadoTicket(t.estado) ? t.estado : 'ABIERTO',
      tipo: esTipoTicket(t.tipo_mantenimiento) ? t.tipo_mantenimiento : 'CORRECTIVO',
      urgencia: esUrgenciaTicket(t.nivel_urgencia) ? t.nivel_urgencia : null,
      descripcion: t.descripcion_incidencia,
      sistema: { id: sistema?.id ?? 0, nombre: sistema?.nombre_sistema ?? '—' },
      establecimiento: opcion?.establecimiento ?? { id: 0, nombre: '—' },
      cliente: { id: opcion?.cliente.id ?? 0, nombre: opcion?.cliente.nombre ?? '—' },
      orden: orden ? { id: orden.id, codigo_orden: orden.codigo_orden, estado: orden.estado } : null,
    }
  })
}

async function sistemaActivoPorId(db: Db, id: number): Promise<SistemaOpcion | null> {
  const { data, error } = await sinTipos(db)
    .from('sistema_instalado')
    .select(SELECT_SISTEMA_ACTIVO)
    .eq('id', id)
    .eq('establecimiento.estado', true)
    .eq('establecimiento.cliente.estado', true)
    .maybeSingle()
  if (error) throw new Error(`No se pudo verificar el sistema instalado: ${error.message}`)
  return data ? aSistemaOpcion(data as unknown as FilaSistema) : null
}

// ---------------------------------------------------------------------
// Operaciones
// ---------------------------------------------------------------------

/** Texto de la bitácora que indica el origen del registro. */
export function textoOrigen(origen: 'VOZ' | 'MANUAL'): string {
  return origen === 'VOZ' ? 'Ticket registrado por VOZ' : 'Ticket registrado MANUAL'
}

/** CU18 flujo principal: valida, guarda en ABIERTO y registra CREAR_TICKET. */
export async function crearTicket(
  db: Db,
  input: CrearTicketInput,
  usuarioId: number,
  ip?: string | null,
): Promise<MantenimientoTicket & { codigo: string }> {
  const parsed = crearTicketSchema.safeParse(input)
  if (!parsed.success) throw new Error(primerError(parsed.error))
  const datos = parsed.data

  const sistema = await sistemaActivoPorId(db, datos.sistema_instalado_id)
  if (!sistema) throw new Error(MSG_SISTEMA_INACTIVO)

  const { data: ticket, error } = await db
    .from('mantenimiento_ticket')
    .insert({
      sistema_instalado_id: datos.sistema_instalado_id,
      tipo_mantenimiento: datos.tipo_mantenimiento,
      nivel_urgencia: datos.nivel_urgencia,
      descripcion_incidencia: datos.descripcion_incidencia,
      estado: 'ABIERTO',
      // Hora de Bolivia, como las fechas de ORDEN_TRABAJO (la BD está en UTC)
      fecha_reporte: ahoraBolivia(),
    })
    .select()
    .single()
  if (error || !ticket) throw new Error(`No se pudo registrar el ticket: ${error?.message ?? 'sin respuesta'}`)

  const codigo = codigoTicket(ticket.id, ticket.fecha_reporte)
  try {
    await registrarEvento(
      db,
      {
        usuario_id: usuarioId,
        accion: 'CREAR_TICKET',
        descripcion:
          `Se creó el ticket ${codigo} (${datos.tipo_mantenimiento}, urgencia ${datos.nivel_urgencia}) ` +
          `para ${etiquetaSistema(sistema)}. ${textoOrigen(datos.origen)}`,
      },
      ip,
    )
  } catch (e) {
    console.warn('[CU18] Error al auditar la creación del ticket:', e)
  }

  return { ...ticket, codigo }
}

/** Subflujo: cambio de estado (ABIERTO -> EN_PROCESO -> RESUELTO; o CANCELADO). */
export async function cambiarEstadoTicket(
  db: Db,
  input: { ticketId: number; estado: EstadoTicket },
  usuarioId: number,
  ip?: string | null,
): Promise<MantenimientoTicket> {
  const parsed = cambiarEstadoTicketSchema.safeParse(input)
  if (!parsed.success) throw new Error(primerError(parsed.error))
  const { ticketId, estado } = parsed.data

  const { data: actual, error: errLeer } = await db
    .from('mantenimiento_ticket')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle()
  if (errLeer) throw new Error(`No se pudo leer el ticket: ${errLeer.message}`)
  if (!actual) throw new Error('No se encontró el ticket')

  const desde = esEstadoTicket(actual.estado) ? actual.estado : 'ABIERTO'
  const codigo = codigoTicket(actual.id, actual.fecha_reporte)
  if (!TRANSICIONES_TICKET[desde].includes(estado)) {
    throw new Error(`El ticket ${codigo} está ${ETIQUETA_ESTADO[desde]}: no puede pasar a ${ETIQUETA_ESTADO[estado]}.`)
  }

  // El filtro por estado evita pisar un cambio hecho por otro usuario al mismo tiempo
  const { data: actualizado, error } = await db
    .from('mantenimiento_ticket')
    .update({ estado })
    .eq('id', ticketId)
    .eq('estado', actual.estado)
    .select()
    .maybeSingle()
  if (error) throw new Error(`No se pudo actualizar el ticket: ${error.message}`)
  if (!actualizado) throw new Error('El ticket cambió mientras lo editaba. Recargue la página e intente de nuevo.')

  try {
    await registrarEvento(
      db,
      {
        usuario_id: usuarioId,
        accion: 'ACTUALIZAR_ESTADO_TICKET',
        descripcion: `Ticket ${codigo}: ${desde} → ${estado}`,
      },
      ip,
    )
  } catch (e) {
    console.warn('[CU18] Error al auditar el cambio de estado del ticket:', e)
  }

  return actualizado
}

/**
 * Subflujo "Derivar a Orden de Trabajo": fn_derivar_ticket_orden reutiliza
 * fn_crear_orden_trabajo (CU12) y vincula la OT en una sola transacción.
 */
export async function derivarTicketAOrden(
  db: Db,
  input: DerivarTicketInput,
  usuarioId: number,
  ip?: string | null,
): Promise<OrdenTrabajo> {
  const parsed = derivarTicketSchema.safeParse(input)
  if (!parsed.success) throw new Error(primerError(parsed.error))
  const { ticketId, fecha_programada, hora_inicio, hora_fin } = parsed.data
  const { inicio, fin } = ventanaBolivia(fecha_programada, hora_inicio, hora_fin)

  const { data, error } = await sinTipos(db).rpc('fn_derivar_ticket_orden', {
    p_usuario_id: usuarioId,
    p_ticket_id: ticketId,
    p_inicio: inicio,
    p_fin: fin,
    p_ip: ip && ip.trim() ? ip.trim() : null,
  })
  if (error) throw new Error(error.code === 'PGRST202' ? MSG_FALTA_MIGRACION : error.message)
  return data as OrdenTrabajo
}
