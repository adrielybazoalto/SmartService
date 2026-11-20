import type { SupabaseClient } from '@supabase/supabase-js'
import type { Db } from '@/lib/supabase/types'
import { registrarEvento } from '@/backend/bitacora'
import { ahoraBolivia } from '@/lib/fechas'
import {
  ACCION_BITACORA_MARCAR_LEIDA,
  MSG_ALERTA_NO_ENCONTRADA,
  MSG_FALTA_MIGRACION,
  UMBRAL_DIAS_MAX,
  UMBRAL_DIAS_MIN,
  UMBRAL_DIAS_POR_DEFECTO,
} from './constantes'
import { marcarAlertaLeidaSchema, primerError } from './schema'
import type { AlertaPreventiva, ResultadoGeneracionAlertas, UrgenciaAlerta } from './types'

/**
 * CU19 — Lógica de Alertas y Notificaciones Preventivas.
 *
 * La generación diaria vive en la función SQL `fn_generar_alertas_preventivas`
 * (idempotente y segura ante ejecuciones simultáneas); este servicio solo la
 * invoca. Las consultas y el marcado de lectura pasan por el cliente tipado.
 */

/** Los embebidos de PostgREST se consultan sin tipos generados (igual que CU18). */
const sinTipos = (db: Db) => db as unknown as SupabaseClient

const SELECT_ALERTA =
  'id, mensaje, fecha_alerta, leido, ' +
  'sistema_instalado(id, nombre_sistema, numero_serie, periodicidad_meses, ' +
  'fecha_ultimo_mantenimiento, fecha_proximo_mantenimiento, ' +
  'establecimiento(id, nombre_establecimiento, cliente(id, nombre)))'

/** Un embebido puede llegar como objeto o como arreglo de un elemento. */
type Uno<T> = T | T[] | null

interface FilaSistemaAlerta {
  id: number
  nombre_sistema: string
  numero_serie: string | null
  periodicidad_meses: number
  fecha_ultimo_mantenimiento: string | null
  fecha_proximo_mantenimiento: string | null
  establecimiento: Uno<{
    id: number
    nombre_establecimiento: string
    cliente: Uno<{ id: number; nombre: string }>
  }>
}

interface FilaAlerta {
  id: number
  mensaje: string
  fecha_alerta: string
  leido: boolean
  sistema_instalado: Uno<FilaSistemaAlerta>
}

function uno<T>(valor: Uno<T> | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null
  return valor ?? null
}

// ---------------------------------------------------------------------
// Umbral y urgencia
// ---------------------------------------------------------------------

/**
 * Días de anticipación configurados. Si ALERTAS_UMBRAL_DIAS falta o no es un
 * entero válido se usa el valor por defecto (30).
 */
export function umbralDias(): number {
  const crudo = process.env.ALERTAS_UMBRAL_DIAS
  const valor = crudo ? Number.parseInt(crudo, 10) : Number.NaN
  if (!Number.isInteger(valor) || valor < UMBRAL_DIAS_MIN || valor > UMBRAL_DIAS_MAX) {
    return UMBRAL_DIAS_POR_DEFECTO
  }
  return valor
}

/** Diferencia en días entre una fecha AAAA-MM-DD y hoy (Bolivia). */
export function diasRestantes(
  fecha: string | null,
  hoy: string = ahoraBolivia().slice(0, 10),
): number | null {
  if (!fecha) return null
  const a = Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)))
  const b = Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, Number(hoy.slice(8, 10)))
  return Math.round((a - b) / 86_400_000)
}

/**
 * Urgencia según la fecha REAL de próximo mantenimiento:
 * vencido (días < 0), próximo (dentro del umbral), vigente o sin fecha.
 */
export function urgenciaDe(
  fecha: string | null,
  umbral: number = umbralDias(),
  hoy: string = ahoraBolivia().slice(0, 10),
): UrgenciaAlerta {
  const dias = diasRestantes(fecha, hoy)
  if (dias === null) return 'SIN_FECHA'
  if (dias < 0) return 'VENCIDO'
  if (dias <= umbral) return 'PROXIMO'
  return 'VIGENTE'
}

/** Orden de urgencia del panel: vencidos, próximos, vigentes y sin fecha. */
const RANGO_URGENCIA: Record<UrgenciaAlerta, number> = {
  VENCIDO: 0,
  PROXIMO: 1,
  VIGENTE: 2,
  SIN_FECHA: 3,
}

/**
 * Ordena por urgencia (CU19 2.3): primero los vencidos (el más atrasado
 * primero), luego los próximos (el más cercano primero), después el mayor
 * tiempo restante y al final las alertas sin fecha. Desempate: alerta más
 * reciente primero.
 */
export function ordenarPorUrgencia(alertas: AlertaPreventiva[]): AlertaPreventiva[] {
  return [...alertas].sort((a, b) => {
    const rango = RANGO_URGENCIA[a.urgencia] - RANGO_URGENCIA[b.urgencia]
    if (rango !== 0) return rango
    if (a.dias_restantes !== null && b.dias_restantes !== null && a.dias_restantes !== b.dias_restantes) {
      return a.dias_restantes - b.dias_restantes
    }
    if (a.fecha_alerta !== b.fecha_alerta) return a.fecha_alerta < b.fecha_alerta ? 1 : -1
    return a.id - b.id
  })
}

function aAlertaPreventiva(fila: FilaAlerta, umbral: number, hoy: string): AlertaPreventiva {
  const sistema = uno(fila.sistema_instalado)
  const establecimiento = uno(sistema?.establecimiento)
  const cliente = uno(establecimiento?.cliente)
  const proximo = sistema?.fecha_proximo_mantenimiento ?? null

  return {
    id: fila.id,
    mensaje: fila.mensaje,
    fecha_alerta: fila.fecha_alerta,
    leido: fila.leido,
    urgencia: urgenciaDe(proximo, umbral, hoy),
    dias_restantes: diasRestantes(proximo, hoy),
    sistema: {
      id: sistema?.id ?? 0,
      nombre: sistema?.nombre_sistema ?? '—',
      numero_serie: sistema?.numero_serie ?? null,
      periodicidad_meses: sistema?.periodicidad_meses ?? 0,
      fecha_ultimo_mantenimiento: sistema?.fecha_ultimo_mantenimiento ?? null,
      fecha_proximo_mantenimiento: proximo,
    },
    establecimiento: {
      id: establecimiento?.id ?? 0,
      nombre: establecimiento?.nombre_establecimiento ?? '—',
    },
    cliente: { id: cliente?.id ?? 0, nombre: cliente?.nombre ?? '—' },
  }
}

// ---------------------------------------------------------------------
// Generación diaria
// ---------------------------------------------------------------------

/**
 * Ejecuta la evaluación diaria en UNA transacción (RPC): bloqueo de asesoría,
 * inserción solo si no existe la alerta del mismo sistema y ciclo, y conteo.
 * Es idempotente: dos ejecuciones seguidas no duplican alertas.
 */
export async function generarAlertasPreventivas(
  db: Db,
  umbral: number = umbralDias(),
): Promise<ResultadoGeneracionAlertas> {
  const { data, error } = await sinTipos(db).rpc('fn_generar_alertas_preventivas', {
    p_umbral_dias: umbral,
  })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw new Error(MSG_FALTA_MIGRACION)
    throw new Error(`No se pudieron generar las alertas preventivas: ${error.message}`)
  }

  const resultado = (data ?? {}) as Partial<ResultadoGeneracionAlertas>
  return {
    evaluadas: Number(resultado.evaluadas ?? 0),
    creadas: Number(resultado.creadas ?? 0),
    umbral_dias: Number(resultado.umbral_dias ?? umbral),
    fecha_evaluacion: String(resultado.fecha_evaluacion ?? ''),
  }
}

// ---------------------------------------------------------------------
// Consulta del panel
// ---------------------------------------------------------------------

/**
 * Alertas con cliente > establecimiento > sistema, ordenadas por urgencia.
 * Por defecto solo las pendientes (leido = false).
 */
export async function listarAlertas(db: Db, incluirLeidas = false): Promise<AlertaPreventiva[]> {
  let consulta = sinTipos(db)
    .from('alerta_notificacion')
    .select(SELECT_ALERTA)
    .order('fecha_alerta', { ascending: false })
  if (!incluirLeidas) consulta = consulta.eq('leido', false)

  const { data, error } = await consulta
  if (error) throw new Error(`No se pudieron cargar las alertas preventivas: ${error.message}`)

  const umbral = umbralDias()
  const hoy = ahoraBolivia().slice(0, 10)
  return ordenarPorUrgencia(
    ((data ?? []) as unknown as FilaAlerta[]).map((fila) => aAlertaPreventiva(fila, umbral, hoy)),
  )
}

// ---------------------------------------------------------------------
// Marcar como leída
// ---------------------------------------------------------------------

/**
 * Subflujo "marcar como leída": valida el id, verifica que la alerta exista,
 * actualiza solo si sigue pendiente (idempotente) y audita una única vez.
 */
export async function marcarAlertaLeida(
  db: Db,
  input: { alertaId: number },
  usuarioId: number,
  ip?: string | null,
): Promise<{ id: number; leido: boolean }> {
  const parsed = marcarAlertaLeidaSchema.safeParse(input)
  if (!parsed.success) throw new Error(primerError(parsed.error))
  const { alertaId } = parsed.data

  const { data: actual, error: errLeer } = await db
    .from('alerta_notificacion')
    .select('id, leido, mensaje')
    .eq('id', alertaId)
    .maybeSingle()
  if (errLeer) throw new Error(`No se pudo leer la alerta: ${errLeer.message}`)
  if (!actual) throw new Error(MSG_ALERTA_NO_ENCONTRADA)
  // Ya estaba leída: no se reescribe ni se duplica el registro de bitácora.
  if (actual.leido) return { id: actual.id, leido: true }

  const { data: actualizada, error } = await db
    .from('alerta_notificacion')
    .update({ leido: true })
    .eq('id', alertaId)
    .eq('leido', false)
    .select()
    .maybeSingle()
  if (error) throw new Error(`No se pudo marcar la alerta como leída: ${error.message}`)

  if (!actualizada) {
    // Otro usuario la marcó entre la lectura y la escritura: se confirma el estado real.
    const { data: releida, error: errReleer } = await db
      .from('alerta_notificacion')
      .select('id, leido')
      .eq('id', alertaId)
      .maybeSingle()
    if (errReleer) throw new Error(`No se pudo verificar la alerta: ${errReleer.message}`)
    if (!releida) throw new Error(MSG_ALERTA_NO_ENCONTRADA)
    return { id: releida.id, leido: releida.leido }
  }

  try {
    await registrarEvento(
      db,
      {
        usuario_id: usuarioId,
        accion: ACCION_BITACORA_MARCAR_LEIDA,
        descripcion: `Se marcó como leída la alerta #${alertaId}: ${actual.mensaje}`,
      },
      ip,
    )
  } catch (e) {
    console.warn('[CU19] Error al auditar el marcado de la alerta:', e)
  }

  return { id: actualizada.id, leido: actualizada.leido }
}
