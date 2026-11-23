/**
 * Extractor universal de datos de formularios dictados en español.
 *
 * Es una capa pura (sin React ni APIs del navegador): recibe un esquema
 * declarativo de campos y una frase natural, y devuelve los valores ya
 * normalizados, los campos obligatorios que faltaron y un resumen en español.
 *
 * Se usa tanto desde `AsistenteVozGlobal` (para decidir qué formulario abrir y
 * rellenar) como desde las pruebas unitarias.
 */

import { normalizarTexto, sinTildes } from './normalizar'

export type TipoCampoVoz =
  | 'texto'
  | 'email'
  | 'telefono'
  | 'numero'
  | 'fecha'
  | 'hora'
  | 'select'
  | 'catalogo'
  | 'boolean'

export interface OpcionVoz {
  /** Valor canónico que espera el formulario (puede ser un id como string). */
  valor: string
  /** Etiqueta visible en español. */
  etiqueta: string
  /** Formas alternativas de decirlo. */
  sinonimos?: string[]
}

export interface CampoEsquemaVoz {
  /** Clave usada por el formulario en `aplicar(valores)`. */
  nombre: string
  /** Etiqueta legible para el resumen y para encontrar el campo en la frase. */
  etiqueta: string
  tipo: TipoCampoVoz
  /** Palabras adicionales para reconocer el campo ("llamado", "correo", etc.). */
  sinonimos?: string[]
  requerido?: boolean
  opciones?: OpcionVoz[]
  /** En campos `catalogo`, admite más de una coincidencia. */
  multi?: boolean
  /** En `texto`, aplica mayúscula inicial (por defecto sí). */
  capitalizar?: boolean
}

export interface EsquemaFormularioVoz {
  id: string
  /** Nombre del formulario tal como se muestra al administrador. */
  etiqueta: string
  /** Ruta (o prefijo de ruta) donde vive el formulario. */
  ruta: string
  /** Palabras que identifican este formulario en la frase hablada. */
  sinonimos?: string[]
  campos: CampoEsquemaVoz[]
}

export type ValorCampoVoz = string | number | boolean | string[]
export type ValoresVoz = Record<string, ValorCampoVoz>

export interface ResultadoExtraccionVoz {
  esquemaId: string
  formulario: string
  valores: ValoresVoz
  camposDetectados: string[]
  camposRellenados: Array<{ nombre: string; etiqueta: string; texto: string }>
  faltantes: Array<{ nombre: string; etiqueta: string }>
  resumen: string
}

const PALABRAS_VACIAS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'es', 'son', 'para', 'con', 'por', 'que', 'se', 'llamado', 'llamada',
  'nombre', 'valor', 'ser', 'tiene', 'al', 'a',
])

const VERBOS_ACCION = [
  'registrar', 'registre', 'crear', 'crea', 'nuevo', 'nueva', 'agregar',
  'agrega', 'dar de alta', 'alta', 'llenar', 'rellenar', 'editar', 'modificar',
  'configurar', 'emitir', 'generar', 'asignar', 'guardar', 'cambiar',
]

/** Normaliza una frase hablada conservando @ y . para correos y números. */
export function normalizarFrase(texto: string): string {
  const conArroba = sinTildes(texto)
    .replace(/\s*@\s*/g, ' arroba ')
    .replace(/\s+arroba\s+/g, ' arroba ')
    .replace(/\s*\/\s*/g, ' barra ')
    .replace(/\s*-\s*/g, ' guion ')
  return normalizarTexto(conArroba)
    .replace(/\s+arroba\s*/g, '@')
    .replace(/\s+punto\s*/g, '.')
    .replace(/\s+guion(?:s)?\s*/g, '-')
    .replace(/\s+barra\s*/g, '/')
    .replace(/\s+mas\s*/g, '+')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim()
}

function limpiarFragmento(fragmento: string): string {
  let limpio = fragmento.trim()
  // Quita conectores hablados al inicio ("llamado Ana", "con NIT 123").
  let cambio = true
  while (cambio) {
    cambio = false
    for (const palabra of [...PALABRAS_VACIAS].sort((a, b) => b.length - a.length)) {
      const re = new RegExp(`^${escapar(palabra)}\\s+`, 'u')
      if (re.test(limpio)) {
        limpio = limpio.replace(re, '')
        cambio = true
        break
      }
    }
  }
  return limpio.replace(/^[,.;:\s]+/, '').replace(/[,.;:\s]+$/, '').trim()
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function capitalizar(texto: string): string {
  if (!texto) return texto
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** "ana arroba gmail punto com" / "ana@gmail.com" -> "ana@gmail.com". */
export function normalizarCorreo(texto: string): string {
  return normalizarFrase(texto)
    .replace(/\s+/g, '')
    .replace(/@+/g, '@')
    .replace(/\.\.+/g, '.')
    .toLowerCase()
}

/** 7001 2345 / 700-12345 / (700) 12345 -> 70012345. */
export function normalizarTelefono(texto: string): string {
  return normalizarFrase(texto).replace(/[^\d+]/g, '')
}

/** Convierte números hablados y separadores latinos a un número JS. */
export function normalizarNumero(texto: string): number | null {
  const frase = normalizarFrase(texto)
  // "mil doscientos" -> 1200, "dos mil veintiséis" -> 2026.
  const CENTENAS: Record<string, number> = {
    cien: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400,
    quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800,
    novecientos: 900,
  }
  const millar = frase.match(
    /\b(\d+|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)?\s*mil(?:\s+(\d+|doscientos|trescientos|cuatrocientos|quinientos|seiscientos|setecientos|ochocientos|novecientos))?\b/u,
  )
  if (millar) {
    const UNIDADES_MIL: Record<string, number> = {
      uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
      seis: 6, siete: 7, ocho: 8, nueve: 9,
    }
    const prefijo = millar[1]
    const miles = prefijo ? (UNIDADES_MIL[prefijo] ?? (Number(prefijo) || 1)) : 1
    const resto = millar[2] ? (CENTENAS[millar[2]] ?? Number(millar[2])) : 0
    return miles * 1000 + resto
  }
  const limpio = frase
    .replace(/bs\.?|bolivianos?|pesos?/gu, '')
    .replace(/por ciento|%/gu, '')
    .replace(/\s/g, '')
    .replace(/(?<=\d)\.(?=\d{3}\b)/g, '') // 1.234 -> 1234
    .replace(/,(?=\d)/g, '.') // 1,5 -> 1.5
  const coincidencia = limpio.match(/-?\d+(?:\.\d+)?/u)
  if (!coincidencia) return null
  const numero = Number(coincidencia[0])
  return Number.isFinite(numero) ? numero : null
}

/** "hoy", "mañana", "ayer" o fechas escritas -> YYYY-MM-DD. */
export function normalizarFecha(texto: string, hoy: Date = new Date()): string | null {
  const frase = normalizarFrase(texto)
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const desplazar = (dias: number) => {
    const d = new Date(base)
    d.setDate(d.getDate() + dias)
    return d
  }
  if (/\bhoy\b/u.test(frase)) return aISO(base)
  if (/\bmanana\b/u.test(frase)) return aISO(desplazar(1))
  if (/\bayer\b/u.test(frase)) return aISO(desplazar(-1))
  if (/\bpasado manana\b/u.test(frase)) return aISO(desplazar(2))

  const iso = frase.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/u)
  if (iso) return `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}`

  const latina = frase.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})\b/u)
  if (latina) {
    const anio = latina[3].length === 2 ? `20${latina[3]}` : latina[3]
    return `${anio}-${pad(latina[2])}-${pad(latina[1])}`
  }
  return null
}

/** "8 y 30", "08:30", "ocho y media" -> HH:MM. */
export function normalizarHora(texto: string): string | null {
  const escrita = texto.match(/\b(\d{1,2})[:.](\d{1,2})\b/u)
  if (escrita) return `${pad(escrita[1])}:${pad(escrita[2])}`
  const frase = normalizarFrase(texto).replace(/\ba las\b/gu, '').trim()
  let coincide = frase.match(/\b(\d{1,2})[:.](\d{1,2})\b/u)
  if (coincide) return `${pad(coincide[1])}:${pad(coincide[2])}`
  if (/\by media\b|\bmedia\b/u.test(frase)) {
    coincide = frase.match(/\b(\d{1,2})\b/u)
    if (coincide) return `${pad(coincide[1])}:30`
  }
  coincide = frase.match(/\b(\d{1,2})\s+y\s+(\d{1,2})\b/u)
  if (coincide) return `${pad(coincide[1])}:${pad(coincide[2])}`
  coincide = frase.match(/\b(\d{1,2})\b/u)
  if (coincide) return `${pad(coincide[1])}:00`
  return null
}

function pad(valor: string): string {
  return valor.padStart(2, '0')
}

function aISO(fecha: Date): string {
  return `${fecha.getFullYear()}-${pad(String(fecha.getMonth() + 1))}-${pad(String(fecha.getDate()))}`
}

/** Coincidencia difusa sin tildes ni mayúsculas entre una opción y lo dictado. */
export function coincidirOpcion(
  texto: string,
  opciones: OpcionVoz[],
): OpcionVoz | null {
  const buscado = normalizarFrase(texto)
  if (!buscado) return null

  let mejor: { opcion: OpcionVoz; puntos: number } | null = null
  for (const opcion of opciones) {
    const formas = [opcion.etiqueta, ...(opcion.sinonimos ?? []), opcion.valor]
    for (const forma of formas) {
      const normal = normalizarFrase(forma).replace(/_/g, ' ')
      if (!normal) continue
      let puntos = 0
      if (buscado === normal) puntos = 100
      else if (new RegExp(`(?:^|\\s)${escapar(normal)}(?:$|\\s)`, 'u').test(buscado)) puntos = 80
      else if (normal.length >= 4 && buscado.includes(normal)) puntos = 60
      else if (buscado.length >= 4 && normal.includes(buscado)) puntos = 40
      if (puntos && (!mejor || puntos > mejor.puntos)) mejor = { opcion, puntos }
    }
  }
  return mejor?.opcion ?? null
}

interface Marca {
  inicio: number
  fin: number
  campo: string
  longitud: number
}

function etiquetasDelCampo(campo: CampoEsquemaVoz): string[] {
  return [campo.etiqueta, ...(campo.sinonimos ?? [])]
    .map((e) => normalizarFrase(e))
    .filter(Boolean)
}

/** Extrae los valores de una frase para un esquema de formulario concreto. */
export function extraerDatosFormulario(
  texto: string,
  esquema: EsquemaFormularioVoz,
  hoy: Date = new Date(),
): ResultadoExtraccionVoz {
  const frase = normalizarFrase(texto)
  const marcas: Marca[] = []

  for (const campo of esquema.campos) {
    for (const etiqueta of etiquetasDelCampo(campo)) {
      const regex = new RegExp(`(?:^|\\s)(${escapar(etiqueta)})(?=\\s|[,.:;]|$)`, 'gu')
      let partida: RegExpExecArray | null
      while ((partida = regex.exec(frase)) !== null) {
        const inicio = partida.index + (partida[0].length - partida[1].length)
        marcas.push({ inicio, fin: inicio + partida[1].length, campo: campo.nombre, longitud: partida[1].length })
      }
    }
  }

  // Si dos etiquetas se solapan, gana la más larga ("nombre" vs "nombre completo").
  marcas.sort((a, b) => a.inicio - b.inicio || b.longitud - a.longitud)
  const seleccionadas: Marca[] = []
  for (const marca of marcas) {
    const anterior = seleccionadas[seleccionadas.length - 1]
    if (!anterior || marca.inicio >= anterior.fin) seleccionadas.push(marca)
  }

  const fragmentos = new Map<string, string>()
  seleccionadas.forEach((marca, indice) => {
    const siguiente = seleccionadas[indice + 1]
    const fin = siguiente ? siguiente.inicio : frase.length
    const contenido = frase.slice(marca.fin, fin).replace(/\s*[,;]\s*$/u, '')
    const limpio = limpiarFragmento(contenido)
    if (limpio && !fragmentos.has(marca.campo)) fragmentos.set(marca.campo, limpio)
  })

  const valores: ValoresVoz = {}
  const camposDetectados: string[] = []
  const camposRellenados: ResultadoExtraccionVoz['camposRellenados'] = []

  for (const campo of esquema.campos) {
    const fragmento = fragmentos.get(campo.nombre) ?? ''
    const valor = convertirValor(campo, fragmento, frase, hoy)
    if (valor === null || valor === '') continue

    valores[campo.nombre] = valor
    camposDetectados.push(campo.nombre)
    camposRellenados.push({
      nombre: campo.nombre,
      etiqueta: campo.etiqueta,
      texto: textoDelValor(valor, campo),
    })
  }

  const faltantes = esquema.campos
    .filter((c) => c.requerido && valores[c.nombre] === undefined)
    .map((c) => ({ nombre: c.nombre, etiqueta: c.etiqueta }))

  const partes = camposRellenados.map((c) => `${c.etiqueta}: ${c.texto}`)
  const resumenPartes = [`Formulario «${esquema.etiqueta}» abierto.`]
  resumenPartes.push(
    partes.length ? `Campos rellenados: ${partes.join('; ')}.` : 'No se reconocieron campos del formulario.',
  )
  resumenPartes.push(
    faltantes.length
      ? `Faltan por completar manualmente: ${faltantes.map((f) => f.etiqueta).join(', ')}.`
      : 'Revise los datos y confirme manualmente con Guardar.',
  )

  return {
    esquemaId: esquema.id,
    formulario: esquema.etiqueta,
    valores,
    camposDetectados,
    camposRellenados,
    faltantes,
    resumen: resumenPartes.join(' '),
  }
}

function convertirValor(
  campo: CampoEsquemaVoz,
  fragmento: string,
  fraseCompleta: string,
  hoy: Date,
): ValorCampoVoz | null {
  switch (campo.tipo) {
    case 'email': {
      const correo = normalizarCorreo(fragmento)
      return correo.includes('@') && correo.includes('.') ? correo : null
    }
    case 'telefono': {
      const telefono = normalizarTelefono(fragmento)
      return telefono.length >= 5 ? telefono : null
    }
    case 'numero': {
      const numero = normalizarNumero(fragmento)
      return numero === null ? null : numero
    }
    case 'fecha':
      return normalizarFecha(fragmento, hoy)
    case 'hora':
      return normalizarHora(fragmento)
    case 'boolean':
      return /si|sí|confirmo|confirmado|acepto|true/u.test(fragmento) ? true : null
    case 'select':
    case 'catalogo': {
      const opciones = campo.opciones ?? []
      const coincidencia = coincidirOpcion(fragmento, opciones)
        ?? coincidirOpcion(fraseCompleta, opciones)
      if (coincidencia) return coincidencia.valor
      if (campo.multi) {
        const encontradas = opciones.filter((o) => coincidirOpcion(fraseCompleta, [o])?.valor === o.valor)
        if (encontradas.length) return encontradas.map((o) => o.valor)
      }
      // Los catálogos de base de datos se resuelven dentro del formulario;
      // conservamos lo dictado para que el hook pueda hacer la correspondencia.
      if (!opciones.length && fragmento) {
        const texto = campo.capitalizar === false ? fragmento : capitalizar(fragmento)
        return campo.multi ? [texto] : texto
      }
      return null
    }
    case 'texto':
    default: {
      if (!fragmento) return null
      return campo.capitalizar === false ? fragmento : capitalizar(fragmento)
    }
  }
}

function textoDelValor(valor: ValorCampoVoz, campo: CampoEsquemaVoz): string {
  if (Array.isArray(valor)) {
    const nombres = valor.map((v) => campo.opciones?.find((o) => o.valor === v)?.etiqueta ?? v)
    return nombres.join(', ')
  }
  if (typeof valor === 'number') return String(valor)
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  const opcion = campo.opciones?.find((o) => o.valor === valor)
  return opcion?.etiqueta ?? valor
}

/** Detecta si la frase pide explícitamente abrir/rellenar un formulario. */
export function esSolicitudFormulario(texto: string): boolean {
  const frase = normalizarFrase(texto)
  const tieneVerbo = VERBOS_ACCION.some((verbo) => new RegExp(`(?:^|\\s)${escapar(verbo)}(?:\\s|$)`, 'u').test(frase))
  const mencionaFormulario = /\b(formulario|campos?|datos?|registro|alta)\b/u.test(frase)
  return tieneVerbo || mencionaFormulario
}

/** Elige el esquema más probable para una frase dictada. */
export function seleccionarEsquema(
  texto: string,
  esquemas: EsquemaFormularioVoz[],
  rutaActual?: string,
  rutaDestino?: string,
): EsquemaFormularioVoz | null {
  if (!esSolicitudFormulario(texto)) return null
  const frase = normalizarFrase(texto)
  let mejor: { esquema: EsquemaFormularioVoz; puntos: number } | null = null

  for (const esquema of esquemas) {
    let puntos = 0
    const nombres = [esquema.etiqueta, ...(esquema.sinonimos ?? [])]
    for (const nombre of nombres) {
      const norm = normalizarFrase(nombre)
      if (norm && frase.includes(norm)) puntos += 12
    }
    if (rutaActual && coincideRuta(rutaActual, esquema.ruta)) puntos += 4
    if (rutaDestino && coincideRuta(rutaDestino, esquema.ruta)) puntos += 10
    for (const campo of esquema.campos) {
      if (etiquetasDelCampo(campo).some((e) => frase.includes(e))) puntos += 1
    }
    if (mejor === null || puntos > mejor.puntos) mejor = { esquema, puntos }
  }

  return mejor && mejor.puntos >= 8 ? mejor.esquema : null
}

function coincideRuta(ruta: string, prefijo: string): boolean {
  return ruta === prefijo || ruta.startsWith(`${prefijo}/`)
}
