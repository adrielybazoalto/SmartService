import type { Db } from '@/lib/supabase/types'
import {
  actualizarEstablecimientoSchema,
  actualizarSistemaInstaladoSchema,
  crearEstablecimientoSchema,
  crearSistemaInstaladoSchema,
  type ActualizarEstablecimientoInput,
  type ActualizarSistemaInstaladoInput,
  type CrearEstablecimientoInput,
  type CrearSistemaInstaladoInput,
} from './schema'
import type { Establecimiento, NuevoEstablecimiento, NuevoSistemaInstalado, SistemaInstalado } from './types'

/** Suma `meses` a una fecha ISO YYYY-MM-DD. */
function sumarMeses(fechaISO: string, meses: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const fecha = new Date(Date.UTC(y, m - 1, d))
  fecha.setUTCMonth(fecha.getUTCMonth() + meses)
  return fecha.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// ESTABLECIMIENTOS
// ---------------------------------------------------------------------------

export async function listarEstablecimientos(db: Db): Promise<Establecimiento[]> {
  const { data, error } = await db
    .from('establecimiento')
    .select('*, cliente(*)')
    .order('id', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los establecimientos: ${error.message}`)
  return data
}

export async function getEstablecimientoPorId(db: Db, id: number) {
  const { data, error } = await db
    .from('establecimiento')
    .select('*, cliente(*)')
    .eq('id', id)
    .single()
  if (error) throw new Error(`No se encontró el establecimiento: ${error.message}`)
  return data
}

export async function crearEstablecimiento(
  db: Db,
  input: CrearEstablecimientoInput,
): Promise<Establecimiento> {
  const parsed = crearEstablecimientoSchema.parse(input)
  const { data, error } = await db
    .from('establecimiento')
    .insert(parsed as NuevoEstablecimiento)
    .select()
    .single()
  if (error) throw new Error(`No se pudo crear el establecimiento: ${error.message}`)
  return data
}

export async function actualizarEstablecimiento(
  db: Db,
  id: number,
  input: ActualizarEstablecimientoInput,
): Promise<Establecimiento> {
  const parsed = actualizarEstablecimientoSchema.parse(input)
  const { data, error } = await db
    .from('establecimiento')
    .update(parsed)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`No se pudo actualizar el establecimiento: ${error.message}`)
  return data
}

export async function cambiarEstadoEstablecimiento(db: Db, id: number, estado: boolean): Promise<Establecimiento> {
  const { data, error } = await db.from('establecimiento').update({ estado }).eq('id', id).select().single()
  if (error) throw new Error(`No se pudo cambiar el estado del establecimiento: ${error.message}`)
  return data
}

export async function eliminarEstablecimiento(db: Db, id: number): Promise<void> {
  const { error } = await db.from('establecimiento').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar el establecimiento: ${error.message}`)
}

// ---------------------------------------------------------------------------
// SISTEMAS INSTALADOS
// ---------------------------------------------------------------------------

export async function listarSistemasInstalados(db: Db) {
  const { data, error } = await db
    .from('sistema_instalado')
    .select('*, establecimiento(*, cliente(*))')
    .order('id', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los sistemas instalados: ${error.message}`)
  return data
}

export async function getSistemaInstaladoPorId(db: Db, id: number) {
  const { data, error } = await db
    .from('sistema_instalado')
    .select('*, establecimiento(*, cliente(*))')
    .eq('id', id)
    .single()
  if (error) throw new Error(`No se encontró el sistema instalado: ${error.message}`)
  return data
}

export async function crearSistemaInstalado(
  db: Db,
  input: CrearSistemaInstaladoInput,
): Promise<SistemaInstalado> {
  const parsed = crearSistemaInstaladoSchema.parse(input)

  const payload: NuevoSistemaInstalado = {
    ...parsed,
    periodicidad_meses: parsed.periodicidad_meses ?? 6,
    // Si no se indica, el próximo mantenimiento se calcula a partir de la
    // instalación + periodicidad.
    fecha_proximo_mantenimiento:
      parsed.fecha_proximo_mantenimiento ??
      (parsed.fecha_instalacion && parsed.periodicidad_meses
        ? sumarMeses(parsed.fecha_instalacion, parsed.periodicidad_meses)
        : null),
  }

  const { data, error } = await db.from('sistema_instalado').insert(payload).select().single()
  if (error) throw new Error(`No se pudo registrar el sistema instalado: ${error.message}`)
  return data
}

export async function actualizarSistemaInstalado(
  db: Db,
  id: number,
  input: ActualizarSistemaInstaladoInput,
): Promise<SistemaInstalado> {
  const parsed = actualizarSistemaInstaladoSchema.parse(input)

  const payload: Partial<SistemaInstalado> = { ...parsed }
  // Si cambió la última fecha de mantenimiento o la periodicidad,
  // se recalcula la próxima fecha.
  if (parsed.fecha_ultimo_mantenimiento || parsed.periodicidad_meses) {
    const { data: actual, error: errGet } = await db
      .from('sistema_instalado')
      .select('fecha_ultimo_mantenimiento, periodicidad_meses')
      .eq('id', id)
      .single()
    if (errGet) throw new Error(`No se encontró el sistema instalado: ${errGet.message}`)

    const base =
      parsed.fecha_ultimo_mantenimiento ?? actual.fecha_ultimo_mantenimiento
    const periodicidad = parsed.periodicidad_meses ?? actual.periodicidad_meses
    payload.fecha_proximo_mantenimiento = base ? sumarMeses(base, periodicidad) : null
  }

  const { data, error } = await db
    .from('sistema_instalado')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`No se pudo actualizar el sistema instalado: ${error.message}`)
  return data
}

export async function eliminarSistemaInstalado(db: Db, id: number): Promise<void> {
  const { error } = await db.from('sistema_instalado').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar el sistema instalado: ${error.message}`)
}

/** Sistemas cuyo próximo mantenimiento vence en o antes de `fecha` (ISO). */
export async function sistemasConMantenimientoVencido(db: Db, fecha = new Date().toISOString().slice(0, 10)) {
  const { data, error } = await db
    .from('sistema_instalado')
    .select('*, establecimiento(*, cliente(*))')
    .not('fecha_proximo_mantenimiento', 'is', null)
    .lte('fecha_proximo_mantenimiento', fecha)
    .order('fecha_proximo_mantenimiento', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los mantenimientos vencidos: ${error.message}`)
  return data
}