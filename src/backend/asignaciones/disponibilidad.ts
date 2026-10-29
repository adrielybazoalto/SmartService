/**
 * Lógica PURA de disponibilidad (sin base de datos): fácil de probar.
 * Todas las fechas son "ingenuas" (timestamp sin zona horaria), igual que en la BD:
 * se comparan como hora local sin conversión.
 */

const DIA_MS = 24 * 60 * 60 * 1000
const NOMBRES_DIA = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const PREFIJOS: Record<string, number> = { lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 7 }

export interface JornadaFila {
  dia_semana: string
  hora_inicio: string
  hora_fin: string
}

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
}

function diaDe(token: string): number | null {
  const t = normalizar(token).replace(/[^a-z]/g, '')
  return PREFIJOS[t.slice(0, 3)] ?? null
}

/**
 * Convierte el texto de `dia_semana` en números de día (1 = lunes … 7 = domingo).
 * Entiende: "Lunes", "Lunes a Viernes", "Viernes a Lunes", "Lunes, Miércoles y Viernes",
 * "Todos los días", y abreviaturas ("lun", "mié").
 */
export function parseDiasSemana(texto: string): number[] {
  const t = normalizar(texto)
  if (/todos|diario|toda la semana/.test(t)) return [1, 2, 3, 4, 5, 6, 7]

  const rango = t.match(/^([a-z]+)(?:\s+(?:a|al|hasta)\s+|\s*-\s*)([a-z]+)$/)
  if (rango) {
    const ini = diaDe(rango[1])
    const fin = diaDe(rango[2])
    if (ini && fin) {
      const dias: number[] = []
      let d = ini
      for (let i = 0; i < 7; i++) {
        dias.push(d)
        if (d === fin) break
        d = (d % 7) + 1
      }
      return dias
    }
  }

  const dias = t
    .split(/\s*(?:,|;|\/|\by\b|\be\b|&)\s*/)
    .map(diaDe)
    .filter((d): d is number => d !== null)
  return [...new Set(dias)]
}

function minutos(hora: string): number {
  const [h, m] = hora.split(':')
  return Number(h) * 60 + Number(m ?? 0)
}

/** "2026-10-22T09:00:00" o "2026-10-22 09:00:00" → milisegundos (sin zona horaria). */
export function aMs(ts: string): number {
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
}

export function formatearTs(ts: string): string {
  return ts.replace('T', ' ').slice(0, 16)
}

/** Dos intervalos [a,b) y [c,d) se cruzan si a < d y c < b. */
export function cruzaVentana(a: number, b: number, c: number, d: number): boolean {
  return a < d && c < b
}

/**
 * Valida DÍA POR DÍA (Opción 1 acordada): cada día que toca la ventana debe tener jornada activa.
 *  - Ventana de un solo día: debe caber completa dentro de la jornada de ese día.
 *  - Ventana de varios días: el primer día se cuenta desde la hora de inicio hasta el fin de su
 *    jornada, los días intermedios deben ser laborables, y el último día va desde el inicio de su
 *    jornada hasta la hora de fin. (Las horas de la noche no cuentan como trabajo.)
 * Devuelve los motivos de incumplimiento ([] = cumple).
 */
export function motivosJornada(jornadas: JornadaFila[], inicioMs: number, finMs: number): string[] {
  if (jornadas.length === 0) return ['Sin jornada configurada']
  const parseadas = jornadas.map((j) => ({
    dias: parseDiasSemana(j.dia_semana),
    ini: minutos(j.hora_inicio),
    fin: minutos(j.hora_fin),
  }))

  const primerDia = Math.floor(inicioMs / DIA_MS) * DIA_MS
  let cursor = inicioMs
  while (cursor < finMs) {
    const inicioDia = Math.floor(cursor / DIA_MS) * DIA_MS
    const finDia = inicioDia + DIA_MS
    const esPrimero = inicioDia === primerDia
    const esUltimo = finDia >= finMs
    const segIni = (cursor - inicioDia) / 60000
    const segFin = (Math.min(finMs, finDia) - inicioDia) / 60000
    const dow = ((new Date(inicioDia).getUTCDay() + 6) % 7) + 1 // 1 = lunes … 7 = domingo

    const cabe = parseadas.some((j) => {
      if (!j.dias.includes(dow)) return false
      const desde = esPrimero ? segIni : j.ini
      const hasta = esUltimo ? segFin : j.fin
      return desde >= j.ini && hasta <= j.fin && desde < hasta
    })
    if (!cabe) {
      const fecha = new Date(inicioDia).toISOString().slice(0, 10)
      return [`Fuera de su jornada laboral el ${NOMBRES_DIA[dow]} ${fecha}`]
    }
    cursor = finDia
  }
  return []
}
