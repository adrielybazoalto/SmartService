import type { Db, TablesInsert } from '@/lib/supabase/types'
import {
  filtrarOrdenesSchema,
  guardarCuadrillaSchema,
  type FiltrarOrdenesInput,
  type GuardarCuadrillaInput,
} from './schema'
import { formatearFechaHora } from '@/lib/fechas'
import { aMs, cruzaVentana, motivosJornada } from './disponibilidad'
import {
  ESTADO_CANCELADA,
  ESTADO_FINALIZADA,
  ESTADO_PROGRAMADA,
  ESTADOS_NO_ACTIVOS,
  ROL_TECNICO,
  type CuadrillaMiembro,
  type OrdenAsignable,
  type OrdenConTecnicos,
  type OrdenListada,
  type ResultadoGuardarCuadrilla,
  type TecnicoBase,
} from './types'

const COLUMNAS_ORDEN = 'id, codigo_orden, tipo_trabajo, estado, fecha_inicio_programada, fecha_fin_programada'
const MSG_SIN_VENTANA =
  'La orden no tiene una ventana horaria programada; defínala antes de asignar la cuadrilla'
const MSG_NO_PROGRAMADA =
  'No se puede modificar la cuadrilla de una orden que no está en estado Programada'

function fallo(error: { message: string }, accion: string): Error {
  console.error(`Error al ${accion}:`, error)
  return new Error(`No se pudo ${accion}. Intente nuevamente.`)
}

function ventanaValida(o: OrdenAsignable): boolean {
  if (!o.fecha_inicio_programada || !o.fecha_fin_programada) return false
  return aMs(o.fecha_inicio_programada) < aMs(o.fecha_fin_programada)
}

async function getOrden(db: Db, id: number): Promise<OrdenAsignable> {
  const { data, error } = await db.from('orden_trabajo').select(COLUMNAS_ORDEN).eq('id', id).maybeSingle()
  if (error) throw fallo(error, 'cargar la orden de trabajo')
  if (!data) throw new Error('No se encontró la orden de trabajo')
  return data
}

/** Técnicos = usuarios con rol TECNICO y estado activo. */
async function listarTecnicosActivos(db: Db): Promise<TecnicoBase[]> {
  const { data: rol, error: e1 } = await db.from('rol').select('id').eq('nombre', ROL_TECNICO).maybeSingle()
  if (e1) throw fallo(e1, 'cargar los técnicos')
  if (!rol) return []
  const { data, error } = await db
    .from('usuario')
    .select('id, nombre, telefono')
    .eq('rol_id', rol.id)
    .eq('estado', true)
    .order('nombre', { ascending: true })
  if (error) throw fallo(error, 'cargar los técnicos')
  return data
}

/**
 * Verificación de disponibilidad (RF08, «include» CU10): para cada técnico devuelve los
 * motivos por los que NO puede tomar la ventana de la orden. [] = disponible.
 *  (a) dentro de su jornada día por día, (b) sin bloqueos que se crucen,
 *  (c) sin otra orden activa en el mismo intervalo (la propia orden se excluye).
 */
async function evaluarTecnicos(
  db: Db,
  orden: OrdenAsignable,
  tecnicos: TecnicoBase[],
): Promise<Record<number, string[]>> {
  const ini = orden.fecha_inicio_programada as string
  const fin = orden.fecha_fin_programada as string
  const ids = tecnicos.map((t) => t.id)
  if (ids.length === 0) return {}

  const [jor, blo, ocu] = await Promise.all([
    db.from('carga_horaria_tecnico').select('usuario_id, dia_semana, hora_inicio, hora_fin').in('usuario_id', ids).eq('activo', true),
    db.from('bloqueo_tecnico').select('usuario_id, tipo, fecha_inicio, fecha_fin').in('usuario_id', ids).lt('fecha_inicio', fin).gt('fecha_fin', ini),
    db
      .from('orden_trabajo_tecnico')
      .select('usuario_id, orden:orden_trabajo_id(id, codigo_orden, estado, fecha_inicio_programada, fecha_fin_programada)')
      .in('usuario_id', ids)
      .neq('orden_trabajo_id', orden.id),
  ])
  if (jor.error) throw fallo(jor.error, 'verificar la disponibilidad')
  if (blo.error) throw fallo(blo.error, 'verificar la disponibilidad')
  if (ocu.error) throw fallo(ocu.error, 'verificar la disponibilidad')

  const iniMs = aMs(ini)
  const finMs = aMs(fin)
  const resultado: Record<number, string[]> = {}

  for (const t of tecnicos) {
    const motivos: string[] = []
    motivos.push(...motivosJornada((jor.data ?? []).filter((j) => j.usuario_id === t.id), iniMs, finMs))

    for (const b of (blo.data ?? []).filter((x) => x.usuario_id === t.id)) {
      motivos.push(`Bloqueo (${b.tipo ?? 'sin tipo'}) del ${formatearFechaHora(b.fecha_inicio)} al ${formatearFechaHora(b.fecha_fin)}`)
    }

    for (const f of (ocu.data ?? []).filter((x) => x.usuario_id === t.id)) {
      const o = f.orden
      if (!o || ESTADOS_NO_ACTIVOS.includes(o.estado.toUpperCase())) continue
      if (!o.fecha_inicio_programada || !o.fecha_fin_programada) continue
      if (cruzaVentana(iniMs, finMs, aMs(o.fecha_inicio_programada), aMs(o.fecha_fin_programada))) {
        motivos.push(
          `Asignado a la orden ${o.codigo_orden} (${formatearFechaHora(o.fecha_inicio_programada)} a ${formatearFechaHora(o.fecha_fin_programada)})`,
        )
      }
    }
    resultado[t.id] = motivos
  }
  return resultado
}

/**
 * Primero las órdenes sin cuadrilla, de la más reciente a la más antigua; después las
 * que ya la tienen, en el orden recibido (por fecha programada).
 */
export function ordenarPorPendientes(filas: OrdenListada[]): OrdenListada[] {
  const sinCuadrilla = filas.filter((r) => r.totalTecnicos === 0).sort((a, b) => b.orden.id - a.orden.id)
  return [...sinCuadrilla, ...filas.filter((r) => r.totalTecnicos > 0)]
}

/**
 * Listado de órdenes con el resumen de su cuadrilla. Filtros: código (q), estado y cuadrilla.
 * Por defecto solo las PROGRAMADAS (las únicas que admiten asignar/modificar).
 */
export async function listarOrdenes(db: Db, filtros: FiltrarOrdenesInput = {}): Promise<OrdenListada[]> {
  const f = filtrarOrdenesSchema.parse(filtros)
  const estado = f.estado ?? 'programadas'

  let query = db.from('orden_trabajo').select(COLUMNAS_ORDEN)
  if (estado === 'programadas') query = query.eq('estado', ESTADO_PROGRAMADA)
  else if (estado === 'finalizadas') query = query.eq('estado', ESTADO_FINALIZADA)
  else if (estado === 'canceladas') query = query.eq('estado', ESTADO_CANCELADA)
  else if (estado === 'en_curso') {
    query = query.not('estado', 'in', `(${ESTADO_PROGRAMADA},${ESTADO_FINALIZADA},${ESTADO_CANCELADA})`)
  }
  const q = f.q?.replace(/[%,()]/g, '').trim()
  if (q) query = query.ilike('codigo_orden', `%${q}%`)

  const { data: ordenes, error } = await query.order('fecha_inicio_programada', {
    ascending: estado === 'programadas',
    nullsFirst: false,
  })
  if (error) throw fallo(error, 'cargar las órdenes de trabajo')
  if (ordenes.length === 0) return []

  const { data: cuadrillas, error: e2 } = await db
    .from('orden_trabajo_tecnico')
    .select('orden_trabajo_id, es_lider, usuario:usuario_id(nombre)')
    .in('orden_trabajo_id', ordenes.map((o) => o.id))
  if (e2) throw fallo(e2, 'cargar las cuadrillas')

  const filas = ordenarPorPendientes(ordenes.map((orden) => {
    const miembros = (cuadrillas ?? []).filter((c) => c.orden_trabajo_id === orden.id)
    return {
      orden,
      totalTecnicos: miembros.length,
      liderNombre: miembros.find((c) => c.es_lider)?.usuario?.nombre ?? null,
    }
  }))
  if (f.cuadrilla === 'sin_asignar') return filas.filter((r) => r.totalTecnicos === 0)
  if (f.cuadrilla === 'asignadas') return filas.filter((r) => r.totalTecnicos > 0)
  return filas
}

/**
 * Datos de la pantalla: orden, técnicos con su disponibilidad (solo si la orden es PROGRAMADA)
 * y la cuadrilla actual, que se puede consultar en cualquier estado.
 */
export async function obtenerOrdenConTecnicos(db: Db, ordenId: number): Promise<OrdenConTecnicos> {
  const orden = await getOrden(db, ordenId)
  const tecnicos = await listarTecnicosActivos(db)
  const { data: cuadrilla, error } = await db
    .from('orden_trabajo_tecnico')
    .select('usuario_id, es_lider, usuario:usuario_id(nombre, telefono)')
    .eq('orden_trabajo_id', ordenId)
  if (error) throw fallo(error, 'cargar la cuadrilla')

  const modificable = orden.estado === ESTADO_PROGRAMADA
  const ventanaDefinida = ventanaValida(orden)
  const motivos = ventanaDefinida && modificable ? await evaluarTecnicos(db, orden, tecnicos) : {}

  const miembros: CuadrillaMiembro[] = (cuadrilla ?? [])
    .map((c) => ({
      usuario_id: c.usuario_id,
      nombre: c.usuario?.nombre ?? `Técnico ${c.usuario_id}`,
      telefono: c.usuario?.telefono ?? null,
      esLider: c.es_lider,
    }))
    .sort((a, b) => Number(b.esLider) - Number(a.esLider))

  return {
    orden,
    ventanaDefinida,
    modificable,
    tieneCuadrilla: miembros.length > 0,
    cuadrilla: miembros,
    tecnicos: tecnicos.map((t) => {
      const fila = miembros.find((c) => c.usuario_id === t.id)
      const m = motivos[t.id] ?? []
      return {
        ...t,
        disponible: modificable && ventanaDefinida && m.length === 0,
        motivos: m,
        asignado: !!fila,
        esLider: !!fila?.esLider,
      }
    }),
  }
}

async function guardarCuadrilla(
  db: Db,
  input: GuardarCuadrillaInput,
  modo: 'ASIGNAR' | 'MODIFICAR',
): Promise<ResultadoGuardarCuadrilla> {
  const parsed = guardarCuadrillaSchema.parse(input)
  const orden = await getOrden(db, parsed.orden_trabajo_id)

  if (orden.estado !== ESTADO_PROGRAMADA) throw new Error(MSG_NO_PROGRAMADA)
  if (!ventanaValida(orden)) throw new Error(MSG_SIN_VENTANA)

  const { data: actual, error } = await db
    .from('orden_trabajo_tecnico')
    .select('usuario_id, es_lider, usuario:usuario_id(nombre)')
    .eq('orden_trabajo_id', orden.id)
  if (error) throw fallo(error, 'cargar la cuadrilla')
  const filasActuales = actual ?? []

  if (modo === 'ASIGNAR' && filasActuales.length > 0) {
    throw new Error('La orden ya tiene una cuadrilla asignada. Use la opción de modificar la cuadrilla.')
  }
  if (modo === 'MODIFICAR' && filasActuales.length === 0) {
    throw new Error('La orden aún no tiene cuadrilla asignada.')
  }

  const ids = [...new Set(parsed.tecnico_ids)]
  const liderId = parsed.lider_id as number
  const activos = new Map((await listarTecnicosActivos(db)).map((t) => [t.id, t]))
  const seleccionados = ids.map((id) => activos.get(id))
  if (seleccionados.some((t) => !t)) {
    throw new Error('Alguno de los técnicos seleccionados no es válido o está inactivo')
  }
  const tecnicos = seleccionados as TecnicoBase[]

  // Se vuelve a validar al confirmar (la agenda pudo cambiar desde que se abrió la pantalla).
  const motivos = await evaluarTecnicos(db, orden, tecnicos)
  const noDisponibles = tecnicos.filter((t) => (motivos[t.id] ?? []).length > 0)
  if (noDisponibles.length > 0) {
    throw new Error(
      noDisponibles
        .map(
          (t) =>
            `El técnico ${t.nombre} no se encuentra disponible en la ventana horaria seleccionada (cruce con jornada, bloqueo u otra orden activa): ${motivos[t.id].join('; ')}`,
        )
        .join('\n'),
    )
  }

  // Primero se insertan/actualizan los de la nueva cuadrilla y recién después se quitan
  // los excluidos: si algo falla a medias, nunca se pierde la cuadrilla existente.
  const filas: TablesInsert<'orden_trabajo_tecnico'>[] = ids.map((id) => ({
    orden_trabajo_id: orden.id,
    usuario_id: id,
    es_lider: id === liderId,
  }))
  const { error: eUp } = await db.from('orden_trabajo_tecnico').upsert(filas, { onConflict: 'orden_trabajo_id,usuario_id' })
  if (eUp) throw fallo(eUp, 'guardar la cuadrilla')

  const { error: eDel } = await db
    .from('orden_trabajo_tecnico')
    .delete()
    .eq('orden_trabajo_id', orden.id)
    .not('usuario_id', 'in', `(${ids.join(',')})`)
  if (eDel) throw fallo(eDel, 'actualizar la cuadrilla')

  return {
    orden,
    nombres: tecnicos.map((t) => t.nombre),
    liderNombre: (activos.get(liderId) as TecnicoBase).nombre,
    anteriores: filasActuales.map((f) => f.usuario?.nombre ?? `ID ${f.usuario_id}`),
  }
}

/** Asignación inicial (flujo principal del CU11). */
export function asignarCuadrilla(db: Db, input: GuardarCuadrillaInput) {
  return guardarCuadrilla(db, input, 'ASIGNAR')
}

/** Subflujo "Modificar cuadrilla": agregar/quitar técnicos o cambiar al líder. */
export function modificarCuadrilla(db: Db, input: GuardarCuadrillaInput) {
  return guardarCuadrilla(db, input, 'MODIFICAR')
}
