'use server'

import { revalidatePath } from 'next/cache'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { obtenerIpOrigen } from '@/lib/ip'
import { exigirPermiso, type AccionPermiso } from '@/lib/permisos'
import type { Db } from '@/lib/supabase/types'
import {
  CLAVE_MODULO_ALERTAS,
  RUTA_ALERTAS,
  listarAlertas,
  marcarAlertaLeida,
  type AlertaPreventiva,
} from '@/backend/alertas'

/** CU19 — Server Actions del módulo ALERTAS_PREVENTIVAS. */

type RespuestaAccion<T> = { ok: true; data: T; mensaje: string } | { ok: false; error: string }

function exito<T>(data: T, mensaje: string): RespuestaAccion<T> {
  return { ok: true, data, mensaje }
}

function falla<T>(e: unknown, porDefecto: string): RespuestaAccion<T> {
  console.error('[CU19]', e)
  return { ok: false, error: e instanceof Error ? e.message : porDefecto }
}

async function contexto(accion: AccionPermiso = 'LEER') {
  const usuario = await exigirPermiso(CLAVE_MODULO_ALERTAS, accion)
  return {
    db: getSupabaseServiceClient() as unknown as Db,
    usuarioId: usuario.id,
    ip: await obtenerIpOrigen(),
  }
}

/** Listado del panel. `incluirLeidas` permite alternar Pendientes / Todas. */
export async function listarAlertasAccion(
  incluirLeidas = false,
): Promise<RespuestaAccion<AlertaPreventiva[]>> {
  try {
    const { db } = await contexto('LEER')
    const alertas = await listarAlertas(db, incluirLeidas)
    return exito(alertas, `${alertas.length} alerta(s)`)
  } catch (e) {
    return falla(e, 'Error al listar las alertas preventivas')
  }
}

/** Marca una alerta como leída; valida existencia y permisos en el servidor. */
export async function marcarAlertaLeidaAccion(
  alertaId: number,
): Promise<RespuestaAccion<{ id: number; leido: boolean }>> {
  try {
    const { db, usuarioId, ip } = await contexto('ACTUALIZAR')
    const alerta = await marcarAlertaLeida(db, { alertaId }, usuarioId, ip)
    revalidatePath(RUTA_ALERTAS)
    revalidatePath('/')
    return exito(alerta, alerta.leido ? 'Alerta marcada como leída' : 'La alerta ya estaba leída')
  } catch (e) {
    return falla(e, 'Error al marcar la alerta como leída')
  }
}
