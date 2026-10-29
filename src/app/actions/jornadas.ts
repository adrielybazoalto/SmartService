'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUser } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { registrarEvento } from '@/backend/bitacora'
import { obtenerIpOrigen } from '@/lib/ip'
import type { Db } from '@/lib/supabase/types'
import {
  listarTecnicos as listarTecnicosService,
  obtenerResumenPersonalTecnico as obtenerResumenPersonalTecnicoService,
  obtenerBloqueosTecnico as obtenerBloqueosTecnicoService,
  guardarJornada as guardarJornadaService,
  registrarBloqueo as registrarBloqueoService,
  eliminarBloqueo as eliminarBloqueoService,
} from '@/backend/personal-tecnico'

const RUTA_MODULO = '/personal-tecnico'

/** Helper para auditar en bitácora sin interrumpir la operación si falla */
async function auditar(db: Db, usuarioId: number, accion: string, descripcion: string) {
  try {
    const ip = await obtenerIpOrigen()
    await registrarEvento(db, { usuario_id: usuarioId, accion, descripcion }, ip)
  } catch (e) {
    console.error('Error al registrar en bitácora (CU10):', e)
  }
}

// 1. Listar el personal técnico
export async function listarTecnicos() {
  const db = getSupabaseServiceClient()
  return listarTecnicosService(db)
}

// 1.1. Obtener resumen global para el estado actual de los técnicos
export async function obtenerResumenPersonalTecnico() {
  const db = getSupabaseServiceClient()
  return obtenerResumenPersonalTecnicoService(db)
}

// 1.2. Obtener los bloqueos activos de un técnico específico (para poder desbloquearlo)
export async function obtenerBloqueosTecnico(usuarioId: number) {
  const db = getSupabaseServiceClient()
  return obtenerBloqueosTecnicoService(db, usuarioId)
}

// 2. Guardar o editar la Carga Horaria (Jornada)
export async function guardarJornada(
  usuarioId: number,
  dias: string,
  horaInicio: string,
  horaFin: string,
) {
  const usuarioActual = await getCurrentUser()
  if (!usuarioActual || !usuarioActual.id) {
    throw new Error('Sesión requerida: debe iniciar sesión para configurar jornadas laborales.')
  }
  const db = getSupabaseServiceClient()

  const resultado = await guardarJornadaService(db, {
    usuario_id: usuarioId,
    dia_semana: dias,
    hora_inicio: horaInicio,
    hora_fin: horaFin,
  })

  if (!resultado.success) {
    return resultado
  }

  // Registrar en bitácora con usuario verificado (sin fallback genérico)
  await auditar(
    db,
    usuarioActual.id,
    'CONFIGURAR_JORNADA',
    `Se actualizó la jornada laboral (${dias}: ${horaInicio} - ${horaFin}) para el técnico ID ${usuarioId}`,
  )

  revalidatePath(RUTA_MODULO)
  return resultado
}

// 3. Registrar Bloqueo
export async function registrarBloqueo(
  usuarioId: number,
  fechaInicio: string,
  fechaFin: string,
  motivo: string,
  tipo: string,
) {
  const usuarioActual = await getCurrentUser()
  if (!usuarioActual || !usuarioActual.id) {
    throw new Error('Sesión requerida: debe iniciar sesión para registrar bloqueos de técnicos.')
  }
  const db = getSupabaseServiceClient()

  const resultado = await registrarBloqueoService(db, {
    usuario_id: usuarioId,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    motivo,
    tipo,
  })

  if (!resultado.success) {
    return resultado
  }

  // Registrar en bitácora con usuario verificado (sin fallback genérico)
  await auditar(
    db,
    usuarioActual.id,
    'REGISTRAR_BLOQUEO',
    `Se registró bloqueo (${tipo}) para el técnico ID ${usuarioId}. Motivo: ${motivo}`,
  )

  revalidatePath(RUTA_MODULO)
  return resultado
}

// 4. Eliminar Bloqueo (Desbloquear al técnico)
export async function eliminarBloqueoAction(bloqueoId: number) {
  const usuarioActual = await getCurrentUser()
  if (!usuarioActual || !usuarioActual.id) {
    throw new Error('Sesión requerida: debe iniciar sesión para eliminar bloqueos de técnicos.')
  }
  const db = getSupabaseServiceClient()

  const resultado = await eliminarBloqueoService(db, bloqueoId)

  if (!resultado.success) {
    return resultado
  }

  // Registrar en bitácora con usuario verificado (sin fallback genérico)
  await auditar(
    db,
    usuarioActual.id,
    'ELIMINAR_BLOQUEO',
    `Se canceló el bloqueo ID ${bloqueoId} y se habilitó la disponibilidad del técnico`,
  )

  revalidatePath(RUTA_MODULO)
  return resultado
}