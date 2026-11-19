'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { obtenerIpOrigen } from '@/lib/ip'
import { exigirPermiso, type AccionPermiso } from '@/lib/permisos'
import type { Db } from '@/lib/supabase/types'
import {
  buscarSistemasPorTexto,
  cambiarEstadoTicket,
  crearTicket,
  derivarTicketAOrden,
  listarSistemasActivos,
  listarTickets,
  type CrearTicketInput,
  type DerivarTicketInput,
  type EstadoTicket,
  type SistemaOpcion,
  type TicketListado,
} from '@/backend/tickets'

/** CU18 — ControlGestionarTickets: Server Actions del módulo MANTENIMIENTO_TICKETS. */

const CLAVE = 'MANTENIMIENTO_TICKETS'
const RUTA = '/tickets-soporte'

type RespuestaAccion<T> = { ok: true; data: T; mensaje: string } | { ok: false; error: string }

function exito<T>(data: T, mensaje: string): RespuestaAccion<T> {
  return { ok: true, data, mensaje }
}

function falla<T>(e: unknown, porDefecto: string): RespuestaAccion<T> {
  console.error('[CU18]', e)
  return { ok: false, error: e instanceof Error ? e.message : porDefecto }
}

async function contexto(accion: AccionPermiso = 'LEER') {
  const usuario = await exigirPermiso(CLAVE, accion)
  return {
    db: getSupabaseServiceClient() as unknown as Db,
    usuarioId: usuario.id,
    ip: await obtenerIpOrigen(),
  }
}

export async function listarTicketsAccion(): Promise<RespuestaAccion<TicketListado[]>> {
  try {
    const { db } = await contexto('LEER')
    const tickets = await listarTickets(db)
    return exito(tickets, `${tickets.length} ticket(s)`)
  } catch (e) {
    return falla(e, 'Error al listar los tickets')
  }
}

export async function listarSistemasTicketAccion(): Promise<RespuestaAccion<SistemaOpcion[]>> {
  try {
    const { db } = await contexto('CREAR')
    const sistemas = await listarSistemasActivos(db)
    return exito(sistemas, `${sistemas.length} sistema(s) instalado(s)`)
  } catch (e) {
    return falla(e, 'Error al listar los sistemas instalados')
  }
}

/** Resolución del sistema por lo dictado: 0, 1 o varias coincidencias. */
export async function buscarSistemasPorVozAccion(textos: {
  clienteTexto?: string
  sistemaTexto?: string
}): Promise<RespuestaAccion<SistemaOpcion[]>> {
  try {
    const { db } = await contexto('CREAR')
    const sistemas = await buscarSistemasPorTexto(db, textos)
    return exito(sistemas, `${sistemas.length} coincidencia(s)`)
  } catch (e) {
    return falla(e, 'Error al buscar el sistema instalado')
  }
}

export async function crearTicketAccion(
  input: CrearTicketInput,
): Promise<RespuestaAccion<{ id: number; codigo: string }>> {
  try {
    const { db, usuarioId, ip } = await contexto('CREAR')
    const ticket = await crearTicket(db, input, usuarioId, ip)
    revalidatePath(RUTA)
    return exito({ id: ticket.id, codigo: ticket.codigo }, `Ticket ${ticket.codigo} registrado en estado Abierto`)
  } catch (e) {
    return falla(e, 'Error al registrar el ticket')
  }
}

export async function cambiarEstadoTicketAccion(
  ticketId: number,
  estado: EstadoTicket,
): Promise<RespuestaAccion<{ id: number; estado: string }>> {
  try {
    const { db, usuarioId, ip } = await contexto('ACTUALIZAR')
    const ticket = await cambiarEstadoTicket(db, { ticketId, estado }, usuarioId, ip)
    revalidatePath(RUTA)
    return exito({ id: ticket.id, estado: ticket.estado }, 'Estado del ticket actualizado')
  } catch (e) {
    return falla(e, 'Error al actualizar el estado del ticket')
  }
}

/** Derivar exige crear tickets (CU18) y crear órdenes de trabajo (CU12). */
export async function derivarTicketAccion(
  input: DerivarTicketInput,
): Promise<RespuestaAccion<{ id: number; codigo_orden: string }>> {
  try {
    const { db, usuarioId, ip } = await contexto('CREAR')
    await exigirPermiso('ORDENES_TRABAJO', 'CREAR')
    const orden = await derivarTicketAOrden(db, input, usuarioId, ip)
    revalidatePath(RUTA)
    revalidatePath('/ordenes-trabajo')
    revalidatePath('/asignar-tecnicos')
    return exito(
      { id: orden.id, codigo_orden: orden.codigo_orden },
      `Ticket derivado a la Orden de Trabajo ${orden.codigo_orden}`,
    )
  } catch (e) {
    return falla(e, 'Error al derivar el ticket a una orden de trabajo')
  }
}
