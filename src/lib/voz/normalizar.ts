/**
 * Normalización de texto dictado (Web Speech API), genérica: la usan los
 * comandos de voz del CU18 y los usará el CU20 (Reportes).
 *
 * - minúsculas y sin tildes ("Cámaras" -> "camaras", "dañado" -> "danado");
 * - números en palabras a dígitos ("tres" -> "3", "veinticinco" -> "25",
 *   "treinta y dos" -> "32"). "un"/"una" NO se convierten: son artículos.
 *
 * Sin React ni imports de servidor.
 */

/** Minúsculas y sin marcas diacríticas. */
export function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const UNIDADES: Record<string, number> = {
  cero: 0, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  cien: 100,
}

const DECENAS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
}

/** Palabra de un número, o null si no lo es. */
export function numeroDePalabra(palabra: string): number | null {
  const p = sinTildes(palabra)
  if (p in UNIDADES) return UNIDADES[p]
  if (p in DECENAS) return DECENAS[p]
  return null
}

/** Ficha de una frase: la forma original (para mostrar) y la normalizada (para comparar). */
export interface Ficha {
  original: string
  norm: string
  /** Coma o punto del dictado: separa campos. */
  separador: boolean
}

/**
 * Parte el texto en fichas (palabras y separadores) y une los números en
 * palabras: ["treinta", "y", "dos"] -> "32".
 */
export function fichas(texto: string): Ficha[] {
  const crudas = texto.match(/[\p{L}\p{N}]+|[,.;:]/gu) ?? []
  const base: Ficha[] = crudas.map((c) => ({
    original: c,
    norm: sinTildes(c),
    separador: /^[,.;:]$/.test(c),
  }))

  const salida: Ficha[] = []
  for (let i = 0; i < base.length; i++) {
    const f = base[i]
    const decena = DECENAS[f.norm]
    if (decena !== undefined && base[i + 1]?.norm === 'y') {
      const unidad = UNIDADES[base[i + 2]?.norm ?? '']
      if (unidad !== undefined && unidad >= 1 && unidad <= 9) {
        const n = String(decena + unidad)
        salida.push({ original: n, norm: n, separador: false })
        i += 2
        continue
      }
    }
    const numero = numeroDePalabra(f.norm)
    if (numero !== null && !f.separador) {
      const n = String(numero)
      salida.push({ original: n, norm: n, separador: false })
      continue
    }
    salida.push(f)
  }
  return salida
}

/** Texto normalizado completo: minúsculas, sin tildes, números en dígitos, espacios simples. */
export function normalizarTexto(texto: string): string {
  return fichas(texto)
    .map((f) => f.norm)
    .join(' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()
}

/** Une fichas originales en una frase legible (la coma va pegada a la palabra anterior). */
export function unirFichas(lista: Ficha[]): string {
  return lista
    .map((f) => f.original)
    .join(' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()
}
