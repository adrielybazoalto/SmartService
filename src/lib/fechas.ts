/**
 * Fechas de ORDEN_TRABAJO: ventana programada e inicio/fin real son TIMESTAMP sin
 * zona y se guardan como hora de Bolivia (America/La_Paz). Se manejan como texto,
 * nunca con new Date(texto) ni toISOString(): esos pasan por la zona del proceso
 * o a UTC. Se usa también en el navegador: no importar nada de servidor aquí.
 */

const ZONA_BOLIVIA = 'America/La_Paz'
const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/

const formatoBolivia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_BOLIVIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

/** ('2026-11-02', '15:10') → '2026-11-02 15:10:00'. */
export function aTimestampBolivia(fecha: string, hora: string): string {
  if (!FECHA.test(fecha) || !HORA.test(hora)) throw new Error('Fecha u hora inválida')
  return `${fecha} ${hora}:00`
}

/** Fecha y hora actuales en Bolivia: 'YYYY-MM-DD HH:mm:ss'. */
export function ahoraBolivia(): string {
  const p = Object.fromEntries(formatoBolivia.formatToParts(new Date()).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`
}

/** Inicio y fin de una ventana de un solo día; el fin debe ser posterior al inicio. */
export function ventanaBolivia(fecha: string, horaInicio: string, horaFin: string) {
  const inicio = aTimestampBolivia(fecha, horaInicio)
  const fin = aTimestampBolivia(fecha, horaFin)
  if (fin <= inicio) throw new Error('La hora de fin programada debe ser posterior a la hora de inicio')
  return { inicio, fin }
}

/** Muestra un TIMESTAMP sin zona tal cual: 'YYYY-MM-DD HH:mm'. */
export function formatearFechaHora(ts: string | null | undefined): string {
  return ts ? ts.replace('T', ' ').slice(0, 16) : '—'
}
