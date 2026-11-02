import type { Db } from '@/lib/supabase/types'
import { aMs } from '@/backend/asignaciones/disponibilidad'
import { ahoraBolivia, formatearFechaHora } from '@/lib/fechas'
import {
  guardarJornadaSchema,
  registrarBloqueoSchema,
  type GuardarJornadaInput,
  type RegistrarBloqueoInput,
} from './schema'
import type { BloqueoTecnico, CargaHoraria, TecnicoResumen } from './types'

const ROL_TECNICO = 'TECNICO'
const MSG_ERROR_GUARDAR = 'No se pudo guardar. Intente nuevamente.'
const MSG_NO_TECNICO = 'El usuario seleccionado no es un técnico activo'
const MSG_BLOQUEO_NO_EXISTE = 'El bloqueo no existe o ya fue eliminado'

/** El usuario debe existir, estar activo y tener el rol TECNICO. */
async function esTecnicoActivo(db: Db, usuarioId: number): Promise<boolean> {
  const { data } = await db
    .from('usuario')
    .select('estado, rol:rol_id(nombre)')
    .eq('id', usuarioId)
    .maybeSingle()
  return data?.estado === true && data.rol?.nombre === ROL_TECNICO
}

/**
 * 1. Listar el personal técnico activo.
 */
export async function listarTecnicos(db: Db) {
  const { data: rol, error: errorRol } = await db.from('rol').select('id').eq('nombre', ROL_TECNICO).maybeSingle()
  if (errorRol) {
    console.error('[personal-tecnico] Error al buscar el rol técnico:', errorRol)
    throw new Error('No se pudo obtener la lista de técnicos.')
  }
  if (!rol) return []

  const { data, error } = await db
    .from('usuario')
    .select('id, nombre, correo, estado, rol_id')
    .eq('rol_id', rol.id)
    .eq('estado', true)
    .order('nombre', { ascending: true })

  if (error) {
    console.error('[personal-tecnico] Error al listar técnicos:', error)
    throw new Error('No se pudo obtener la lista de técnicos.')
  }
  return data ?? []
}

/**
 * 1.1. Obtener resumen global con el estado actual de los técnicos (optimizado sin N+1).
 */
export async function obtenerResumenPersonalTecnico(db: Db): Promise<TecnicoResumen[]> {
  const tecnicos = await listarTecnicos(db)
  if (tecnicos.length === 0) return []

  const ids = tecnicos.map((t) => t.id)

  // Consultar todas las jornadas de los técnicos
  const { data: jornadasData } = await db
    .from('carga_horaria_tecnico')
    .select('*')
    .in('usuario_id', ids)

  // Consultar todos los bloqueos de los técnicos (ordenados por fecha_inicio DESC)
  const { data: bloqueosData } = await db
    .from('bloqueo_tecnico')
    .select('*')
    .in('usuario_id', ids)
    .order('fecha_inicio', { ascending: false })

  const jornadasMap = new Map<number, CargaHoraria>()
  for (const j of jornadasData ?? []) {
    // Si hay más de una, guardamos la activa más reciente
    if (!jornadasMap.has(j.usuario_id) || j.activo) {
      jornadasMap.set(j.usuario_id, j)
    }
  }

  // Los bloqueos son TIMESTAMP sin zona en hora de Bolivia
  const ahoraMs = aMs(ahoraBolivia())
  const bloqueosPorTecnico = new Map<number, BloqueoTecnico[]>()
  for (const b of bloqueosData ?? []) {
    const list = bloqueosPorTecnico.get(b.usuario_id) ?? []
    list.push(b)
    bloqueosPorTecnico.set(b.usuario_id, list)
  }

  return tecnicos.map((tech) => {
    const jor = jornadasMap.get(tech.id)
    const techBloqueos = bloqueosPorTecnico.get(tech.id) ?? []

    // 1. Bloqueo en curso ahora mismo (dentro del rango fecha_inicio - fecha_fin)
    const bloqEnCurso = techBloqueos.find((b) => {
      return ahoraMs >= aMs(b.fecha_inicio) && ahoraMs <= aMs(b.fecha_fin)
    })

    // 2. Bloqueo vigente o programado (fecha_fin posterior o igual a la actual)
    const bloqVigente = techBloqueos.find((b) => {
      return aMs(b.fecha_fin) >= ahoraMs
    })

    const bloq = bloqEnCurso || bloqVigente

    let detalle = 'Disponible'
    if (bloq) {
      const tipo = bloq.tipo ? bloq.tipo.trim() : ''
      const motivo = bloq.motivo ? bloq.motivo.trim() : ''
      if (tipo && motivo) {
        detalle = `${tipo} (${motivo})`
      } else if (tipo) {
        detalle = tipo
      } else if (motivo) {
        detalle = motivo
      } else {
        detalle = 'Bloqueado'
      }
    }

    return {
      id: tech.id,
      nombre: tech.nombre,
      correo: tech.correo,
      estado: tech.estado,
      rol_id: tech.rol_id,
      jornada: jor
        ? `${jor.dia_semana} (${jor.hora_inicio.slice(0, 5)} - ${jor.hora_fin.slice(0, 5)})`
        : 'Sin horario asignado',
      jornadaData: jor
        ? {
            id: jor.id,
            dia_semana: jor.dia_semana,
            hora_inicio: jor.hora_inicio.slice(0, 5),
            hora_fin: jor.hora_fin.slice(0, 5),
            activo: jor.activo,
          }
        : null,
      bloqueado: Boolean(bloq),
      detalleBloqueo: detalle,
      bloqueoActivo: bloq ?? null,
    }
  })
}

/**
 * 1.2. Obtener el historial completo de bloqueos de un técnico.
 */
export async function obtenerBloqueosTecnico(
  db: Db,
  usuarioId: number,
): Promise<BloqueoTecnico[]> {
  const { data, error } = await db
    .from('bloqueo_tecnico')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('fecha_inicio', { ascending: false })

  if (error) {
    console.error(`[personal-tecnico] Error al obtener bloqueos de usuario ${usuarioId}:`, error)
    return []
  }
  return data ?? []
}

/**
 * 2. Guardar o actualizar la jornada (carga horaria) de un técnico.
 */
export async function guardarJornada(
  db: Db,
  input: GuardarJornadaInput,
): Promise<{ success: boolean; message: string }> {
  const validado = guardarJornadaSchema.safeParse(input)
  if (!validado.success) {
    return {
      success: false,
      message: validado.error.issues[0]?.message ?? 'Datos de jornada inválidos.',
    }
  }

  const { usuario_id, dia_semana, hora_inicio, hora_fin } = validado.data

  if (!(await esTecnicoActivo(db, usuario_id))) {
    return { success: false, message: MSG_NO_TECNICO }
  }

  // Formatear horas a HH:mm:ss si vienen en formato HH:mm
  const hInicio = hora_inicio.length === 5 ? `${hora_inicio}:00` : hora_inicio
  const hFin = hora_fin.length === 5 ? `${hora_fin}:00` : hora_fin

  // Buscar si ya existe una carga horaria para este técnico
  const { data: existente } = await db
    .from('carga_horaria_tecnico')
    .select('id')
    .eq('usuario_id', usuario_id)
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existente?.id) {
    const { error } = await db
      .from('carga_horaria_tecnico')
      .update({
        dia_semana,
        hora_inicio: hInicio,
        hora_fin: hFin,
        activo: true,
      })
      .eq('id', existente.id)

    if (error) {
      console.error('[personal-tecnico] Error al actualizar la jornada:', error)
      return { success: false, message: MSG_ERROR_GUARDAR }
    }
  } else {
    const { error } = await db.from('carga_horaria_tecnico').insert({
      usuario_id,
      dia_semana,
      hora_inicio: hInicio,
      hora_fin: hFin,
      activo: true,
    })

    if (error) {
      console.error('[personal-tecnico] Error al crear la jornada:', error)
      return { success: false, message: MSG_ERROR_GUARDAR }
    }
  }

  return { success: true, message: 'Jornada configurada / actualizada correctamente.' }
}

/**
 * 3. Registrar un bloqueo / ausencia para un técnico.
 */
export async function registrarBloqueo(
  db: Db,
  input: Omit<RegistrarBloqueoInput, 'tipo'> & { tipo: string },
): Promise<{ success: boolean; message: string }> {
  const validado = registrarBloqueoSchema.safeParse(input)
  if (!validado.success) {
    return {
      success: false,
      message: validado.error.issues[0]?.message ?? 'Datos de bloqueo inválidos.',
    }
  }

  const { usuario_id, fecha_inicio, fecha_fin, motivo, tipo } = validado.data

  if (!(await esTecnicoActivo(db, usuario_id))) {
    return { success: false, message: MSG_NO_TECNICO }
  }

  const { error } = await db.from('bloqueo_tecnico').insert({
    usuario_id,
    fecha_inicio,
    fecha_fin,
    motivo,
    tipo,
  })

  if (error) {
    console.error('[personal-tecnico] Error al registrar el bloqueo:', error)
    return { success: false, message: MSG_ERROR_GUARDAR }
  }

  return { success: true, message: 'Bloqueo registrado exitosamente.' }
}

/**
 * 4. Eliminar / cancelar un bloqueo existente.
 */
export async function eliminarBloqueo(
  db: Db,
  bloqueoId: number,
): Promise<{ success: boolean; message: string; detalle?: string }> {
  if (!Number.isInteger(bloqueoId) || bloqueoId <= 0) {
    return { success: false, message: 'Identificador de bloqueo inválido.' }
  }

  const { data: bloqueo } = await db
    .from('bloqueo_tecnico')
    .select('tipo, fecha_inicio, fecha_fin, usuario:usuario_id(nombre)')
    .eq('id', bloqueoId)
    .maybeSingle()
  if (!bloqueo) return { success: false, message: MSG_BLOQUEO_NO_EXISTE }

  const { data: borrado, error } = await db.from('bloqueo_tecnico').delete().eq('id', bloqueoId).select('id')

  if (error) {
    console.error('[personal-tecnico] Error al eliminar el bloqueo:', error)
    return { success: false, message: 'No se pudo eliminar el bloqueo. Intente nuevamente.' }
  }
  if (!borrado?.length) return { success: false, message: MSG_BLOQUEO_NO_EXISTE }

  return {
    success: true,
    message: 'Bloqueo cancelado y técnico desbloqueado con éxito.',
    detalle:
      `técnico ${bloqueo.usuario?.nombre ?? 'desconocido'}, tipo ${bloqueo.tipo ?? 'sin tipo'}, ` +
      `del ${formatearFechaHora(bloqueo.fecha_inicio)} al ${formatearFechaHora(bloqueo.fecha_fin)}`,
  }
}
