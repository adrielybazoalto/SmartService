/**
 * CU18 — Parser de comandos de voz (aporte propio). Funciones PURAS, sin React
 * ni imports de servidor: se usan en el navegador y en las pruebas.
 *
 *   parseTicketCommand("Ticket correctivo para el cliente Hotel Las Palmeras,
 *     las cámaras no graban desde ayer, urgencia alta")
 *   -> { clienteTexto: 'hotel las palmeras', sistemaTexto: 'camara',
 *        tipo: 'CORRECTIVO', urgencia: 'ALTA',
 *        descripcion: 'Las cámaras no graban desde ayer',
 *        camposDetectados: ['tipo', 'urgencia', 'cliente', 'sistema', 'descripcion'] }
 *
 *   parseFilterCommand("mostrar tickets abiertos de urgencia crítica")
 *   -> { estado: 'ABIERTO', urgencia: 'CRITICA', limpiar: false, ... }
 */
import { fichas, unirFichas, type Ficha } from '@/lib/voz/normalizar'
import type { EstadoTicket, TipoTicket, UrgenciaTicket } from './constantes'

export type CampoDictado = 'cliente' | 'sistema' | 'tipo' | 'urgencia' | 'descripcion'

export interface ComandoTicket {
  clienteTexto?: string
  sistemaTexto?: string
  tipo?: TipoTicket
  urgencia?: UrgenciaTicket
  descripcion?: string
  camposDetectados: CampoDictado[]
}

export interface ComandoFiltro {
  estado?: EstadoTicket
  urgencia?: UrgenciaTicket
  /** "mostrar todos", "quitar filtros": vuelve al listado completo. */
  limpiar: boolean
  camposDetectados: Array<'estado' | 'urgencia'>
}

type Frase = readonly string[]

// ---------------------------------------------------------------------
// Vocabulario (en forma normalizada: minúsculas, sin tildes)
// ---------------------------------------------------------------------

/** "preventivo"/"correctivo" dichos explícitamente: se quitan de la descripción. */
const TIPO_EXPLICITO: ReadonlyArray<[Frase, TipoTicket]> = [
  [['mantenimiento', 'preventivo'], 'PREVENTIVO'],
  [['mantenimiento', 'correctivo'], 'CORRECTIVO'],
  [['preventivo'], 'PREVENTIVO'],
  [['preventiva'], 'PREVENTIVO'],
  [['correctivo'], 'CORRECTIVO'],
  [['correctiva'], 'CORRECTIVO'],
]

/** Síntomas: deciden el tipo pero forman parte de la descripción. */
const SINTOMAS_CORRECTIVO: readonly Frase[] = [
  ['falla'], ['fallas'], ['fallando'], ['averia'], ['averiado'], ['averiada'],
  ['no', 'funciona'], ['no', 'funcionan'], ['no', 'graba'], ['no', 'graban'],
  ['no', 'enciende'], ['no', 'prende'], ['no', 'suena'],
  ['danado'], ['danada'], ['danados'], ['danadas'],
  ['roto'], ['rota'], ['rotos'], ['rotas'],
]
const SINTOMAS_PREVENTIVO: readonly Frase[] = [['revision'], ['revisar'], ['revisen']]

const VALOR_URGENCIA: Record<string, UrgenciaTicket> = {
  baja: 'BAJA', bajo: 'BAJA',
  media: 'MEDIA', medio: 'MEDIA',
  alta: 'ALTA', alto: 'ALTA',
  critica: 'CRITICA', critico: 'CRITICA', urgente: 'CRITICA', emergencia: 'CRITICA',
}
const URGENCIA_FUERTE = new Set(['critica', 'critico', 'urgente', 'emergencia'])
const MARCA_URGENCIA = new Set(['urgencia', 'prioridad'])

/** Sistemas reconocibles sin decir "sistema"; el valor es el texto de búsqueda. */
const SISTEMAS: ReadonlyArray<[Frase, string]> = [
  [['control', 'de', 'acceso'], 'control de acceso'],
  [['control', 'de', 'accesos'], 'control de acceso'],
  [['cerco', 'electrico'], 'cerco electrico'],
  [['cerco'], 'cerco'],
  [['camaras'], 'camara'],
  [['camara'], 'camara'],
  [['cctv'], 'camara'],
  [['videovigilancia'], 'camara'],
  [['alarmas'], 'alarma'],
  [['alarma'], 'alarma'],
  [['biometrico'], 'control de acceso'],
]

const MARCA_CLIENTE = new Set(['cliente', 'clienta'])
const MARCA_ESTABLECIMIENTO = new Set(['establecimiento', 'sucursal'])
const MARCA_SISTEMA = new Set(['sistema', 'equipo'])
const MARCA_DESCRIPCION = new Set(['descripcion'])

/** Palabras que cierran el nombre del cliente o del sistema. */
const CORTE = new Set([
  'cliente', 'clienta', 'sistema', 'equipo', 'descripcion', 'urgencia', 'prioridad', 'tipo',
  'establecimiento', 'sucursal', 'mantenimiento', 'preventivo', 'preventiva', 'correctivo', 'correctiva',
  'no', 'con', 'en', 'que', 'porque', 'tiene', 'tienen', 'reporta', 'reporto', 'presenta', 'donde',
  'urgente', 'emergencia', 'falla', 'fallas', 'averia', 'revision',
])
const ARTICULOS = new Set(['el', 'la', 'los', 'las', 'su', 'sus'])
const CONECTORES_INICIALES = new Set(['de', 'del', 'el', 'la', 'los', 'las', 'es', ':'])

/** Relleno que no aporta a la descripción (al inicio o al final de un tramo). */
const RELLENO_INICIO = new Set([
  'ticket', 'nuevo', 'nueva', 'registrar', 'registra', 'registre', 'crear', 'crea', 'cree', 'abrir', 'abre',
  'un', 'una', 'para', 'del', 'de', 'al', 'a', 'y', 'por', 'favor', 'es', 'con', 'en', 'que', 'se', 'nivel',
])
const RELLENO_FIN = new Set([...RELLENO_INICIO, 'el', 'la', 'los', 'las', 'su', 'sus'])

// ---------------------------------------------------------------------
// Utilidades sobre las fichas
// ---------------------------------------------------------------------

function coincide(fs: Ficha[], i: number, frase: Frase): boolean {
  return frase.every((palabra, k) => fs[i + k]?.norm === palabra)
}

function buscar(fs: Ficha[], frases: readonly Frase[], usado: boolean[]): { i: number; frase: Frase } | null {
  for (let i = 0; i < fs.length; i++) {
    if (usado[i]) continue
    for (const frase of frases) if (coincide(fs, i, frase)) return { i, frase }
  }
  return null
}

function marcar(usado: boolean[], desde: number, hasta: number) {
  for (let k = desde; k <= hasta; k++) if (k >= 0 && k < usado.length) usado[k] = true
}

function esSistemaEn(fs: Ficha[], i: number): boolean {
  return SISTEMAS.some(([frase]) => coincide(fs, i, frase))
}

/**
 * Tramo de un nombre (cliente o sistema) que empieza en `desde`: termina en una
 * coma, en una palabra clave, en un síntoma o en un artículo que introduce un
 * sistema ("... las cámaras no graban").
 */
function tramoNombre(fs: Ficha[], desde: number, usado: boolean[], cortarEnSistema: boolean): [number, number] | null {
  let i = desde
  while (i < fs.length && !usado[i] && CONECTORES_INICIALES.has(fs[i].norm)) i++
  const inicio = i
  while (i < fs.length && i - inicio < 8) {
    const f = fs[i]
    if (usado[i] || f.separador || CORTE.has(f.norm)) break
    if (cortarEnSistema && i > inicio && esSistemaEn(fs, i)) break
    if (i > inicio && ARTICULOS.has(f.norm) && (esSistemaEn(fs, i + 1) || fs[i + 1]?.norm === 'no')) break
    i++
  }
  return i > inicio ? [inicio, i - 1] : null
}

/**
 * Tramos de fichas no usadas, partidos por las usadas y por los separadores.
 * `coma` indica que el dictado tenía una coma (o punto) antes del tramo.
 */
function tramosLibres(fs: Ficha[], usado: boolean[], desde = 0): Array<{ fichas: Ficha[]; coma: boolean }> {
  const tramos: Array<{ fichas: Ficha[]; coma: boolean }> = []
  let actual: Ficha[] = []
  let coma = false
  let comaActual = false
  const cerrar = () => {
    if (actual.length) tramos.push({ fichas: actual, coma: comaActual })
    actual = []
  }
  for (let i = desde; i < fs.length; i++) {
    if (usado[i] || fs[i].separador) {
      cerrar()
      if (fs[i].separador) coma = true
    } else {
      if (actual.length === 0) {
        comaActual = coma
        coma = false
      }
      actual.push(fs[i])
    }
  }
  cerrar()

  return tramos
    .map((t) => {
      let a = 0
      let b = t.fichas.length
      while (a < b && RELLENO_INICIO.has(t.fichas[a].norm)) a++
      while (b > a && RELLENO_FIN.has(t.fichas[b - 1].norm)) b--
      return { fichas: t.fichas.slice(a, b), coma: t.coma }
    })
    .filter((t) => t.fichas.length > 0)
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

const textoNorm = (fs: Ficha[], [a, b]: [number, number]) =>
  fs.slice(a, b + 1).map((f) => f.norm).join(' ')

// ---------------------------------------------------------------------
// parseTicketCommand
// ---------------------------------------------------------------------

export function parseTicketCommand(texto: string): ComandoTicket {
  const fs = fichas(texto ?? '')
  const usado = fs.map(() => false)
  const resultado: ComandoTicket = { camposDetectados: [] }
  const detectado = (campo: CampoDictado) => {
    if (!resultado.camposDetectados.includes(campo)) resultado.camposDetectados.push(campo)
  }
  if (fs.length === 0) return resultado

  // 1. Tipo: lo explícito manda; si no, los síntomas
  const explicito = buscar(fs, TIPO_EXPLICITO.map(([f]) => f), usado)
  if (explicito) {
    resultado.tipo = TIPO_EXPLICITO.find(([f]) => f === explicito.frase)?.[1]
    let desde = explicito.i
    if (fs[desde - 1]?.norm === 'tipo') desde--
    if (fs[desde - 1]?.norm === 'de' && fs[desde]?.norm === 'tipo') desde--
    marcar(usado, desde, explicito.i + explicito.frase.length - 1)
  } else if (buscar(fs, SINTOMAS_CORRECTIVO, usado)) {
    resultado.tipo = 'CORRECTIVO'
  } else if (buscar(fs, SINTOMAS_PREVENTIVO, usado)) {
    resultado.tipo = 'PREVENTIVO'
  }
  if (resultado.tipo) detectado('tipo')

  // 2. Urgencia: "urgencia alta", "prioridad de nivel media", "con urgencia"; si no, "crítica", "urgente", "alta"…
  for (let i = 0; i < fs.length && !resultado.urgencia; i++) {
    if (usado[i] || !MARCA_URGENCIA.has(fs[i].norm)) continue
    let j = i + 1
    while (fs[j] && ['de', 'es', 'nivel', ':'].includes(fs[j].norm)) j++
    let desde = i
    while (desde > 0 && ['de', 'con', 'nivel', 'y'].includes(fs[desde - 1].norm) && !usado[desde - 1]) desde--
    const valor = fs[j] ? VALOR_URGENCIA[fs[j].norm] : undefined
    if (valor) {
      resultado.urgencia = valor
      marcar(usado, desde, j)
    } else if (fs[i - 1]?.norm === 'con' && fs[i].norm === 'urgencia') {
      resultado.urgencia = 'CRITICA'
      marcar(usado, i - 1, i)
    }
  }
  if (!resultado.urgencia) {
    const fuerte = fs.findIndex((f, i) => !usado[i] && URGENCIA_FUERTE.has(f.norm))
    const suelta = fuerte >= 0 ? fuerte : fs.findIndex((f, i) => !usado[i] && f.norm in VALOR_URGENCIA)
    if (suelta >= 0) {
      resultado.urgencia = VALOR_URGENCIA[fs[suelta].norm]
      let desde = suelta
      if (['es', 'muy'].includes(fs[desde - 1]?.norm ?? '')) desde--
      marcar(usado, desde, suelta)
    }
  }
  if (resultado.urgencia) detectado('urgencia')

  // 3. Descripción explícita: se reserva el tramo para que no lo tome el cliente
  const iDescripcion = fs.findIndex((f, i) => !usado[i] && MARCA_DESCRIPCION.has(f.norm))
  const limiteNombres = iDescripcion >= 0 ? iDescripcion : fs.length
  if (iDescripcion >= 0) usado[iDescripcion] = true
  const reservaDescripcion = usado.map((u, i) => u || i > iDescripcion && iDescripcion >= 0)

  // 4. Cliente / establecimiento: "cliente X", "sucursal Y" (se buscan juntos)
  const partesCliente: string[] = []
  for (const marcas of [MARCA_CLIENTE, MARCA_ESTABLECIMIENTO]) {
    const i = fs.findIndex((f, k) => k < limiteNombres && !usado[k] && marcas.has(f.norm))
    if (i < 0) continue
    usado[i] = true
    reservaDescripcion[i] = true
    const tramo = tramoNombre(fs, i + 1, reservaDescripcion, true)
    if (tramo) {
      partesCliente.push(textoNorm(fs, tramo))
      marcar(usado, i + 1, tramo[1])
      marcar(reservaDescripcion, i + 1, tramo[1])
    }
  }
  if (partesCliente.length) {
    resultado.clienteTexto = partesCliente.join(' ')
    detectado('cliente')
  }

  // 5. Sistema: "sistema de cámaras", "equipo DVR"; o una palabra conocida en cualquier parte
  const iSistema = fs.findIndex((f, k) => k < limiteNombres && !usado[k] && MARCA_SISTEMA.has(f.norm))
  if (iSistema >= 0) {
    usado[iSistema] = true
    let j = iSistema + 1
    while (fs[j] && CONECTORES_INICIALES.has(fs[j].norm)) j++
    const conocido = SISTEMAS.find(([frase]) => coincide(fs, j, frase))
    if (conocido) {
      resultado.sistemaTexto = conocido[1]
      marcar(usado, iSistema + 1, j + conocido[0].length - 1)
    } else {
      const tramo = tramoNombre(fs, iSistema + 1, reservaDescripcion, false)
      if (tramo) {
        resultado.sistemaTexto = textoNorm(fs, tramo)
        marcar(usado, iSistema + 1, tramo[1])
      }
    }
  }
  if (!resultado.sistemaTexto) {
    for (let i = 0; i < fs.length && !resultado.sistemaTexto; i++) {
      const conocido = SISTEMAS.find(([frase]) => coincide(fs, i, frase))
      if (conocido) resultado.sistemaTexto = conocido[1]
    }
  }
  if (resultado.sistemaTexto) detectado('sistema')

  // 6. Descripción: lo que sigue a "descripción" o, si no se dijo, el texto que sobra
  const tramos = tramosLibres(fs, usado, iDescripcion >= 0 ? iDescripcion + 1 : 0)
  const descripcion = tramos
    .map((t, k) => (k === 0 ? '' : t.coma ? ', ' : ' ') + unirFichas(t.fichas))
    .join('')
    .trim()
  if (descripcion.length >= 3) {
    resultado.descripcion = capitalizar(descripcion)
    detectado('descripcion')
  }

  return resultado
}

// ---------------------------------------------------------------------
// parseFilterCommand
// ---------------------------------------------------------------------

const ESTADO_FILTRO: ReadonlyArray<[Frase, EstadoTicket]> = [
  [['en', 'proceso'], 'EN_PROCESO'],
  [['proceso'], 'EN_PROCESO'],
  [['en', 'curso'], 'EN_PROCESO'],
  ...(['abierto', 'abiertos', 'abierta', 'abiertas', 'pendiente', 'pendientes'] as const).map(
    (p): [Frase, EstadoTicket] => [[p], 'ABIERTO'],
  ),
  ...(['resuelto', 'resueltos', 'resuelta', 'resueltas', 'cerrado', 'cerrados'] as const).map(
    (p): [Frase, EstadoTicket] => [[p], 'RESUELTO'],
  ),
  ...(['cancelado', 'cancelados', 'cancelada', 'canceladas', 'anulado', 'anulados'] as const).map(
    (p): [Frase, EstadoTicket] => [[p], 'CANCELADO'],
  ),
]

const URGENCIA_FILTRO: Record<string, UrgenciaTicket> = {
  baja: 'BAJA', bajas: 'BAJA',
  media: 'MEDIA', medias: 'MEDIA',
  alta: 'ALTA', altas: 'ALTA',
  critica: 'CRITICA', criticas: 'CRITICA', critico: 'CRITICA', criticos: 'CRITICA',
  urgente: 'CRITICA', urgentes: 'CRITICA', emergencia: 'CRITICA', emergencias: 'CRITICA',
}

export function parseFilterCommand(texto: string): ComandoFiltro {
  const fs = fichas(texto ?? '')
  const resultado: ComandoFiltro = { limpiar: false, camposDetectados: [] }

  for (let i = 0; i < fs.length && !resultado.estado; i++) {
    const encontrado = ESTADO_FILTRO.find(([frase]) => coincide(fs, i, frase))
    if (encontrado) resultado.estado = encontrado[1]
  }
  const urg = fs.find((f) => f.norm in URGENCIA_FILTRO)
  if (urg) resultado.urgencia = URGENCIA_FILTRO[urg.norm]

  if (resultado.estado) resultado.camposDetectados.push('estado')
  if (resultado.urgencia) resultado.camposDetectados.push('urgencia')

  const pideTodo =
    fs.some((f) => ['todos', 'todas', 'limpiar', 'borrar'].includes(f.norm)) ||
    fs.some((f, i) => f.norm === 'quitar' && fs[i + 1]?.norm.startsWith('filtro'))
  resultado.limpiar = pideTodo && resultado.camposDetectados.length === 0

  return resultado
}

// ---------------------------------------------------------------------
// Micrófono único de la página: ¿filtrar el listado o dictar un ticket?
// ---------------------------------------------------------------------

/** Verbos con los que empieza una orden de filtrado ("mostrar tickets abiertos"). */
const VERBOS_FILTRO = new Set([
  'mostrar', 'muestra', 'muestrame', 'mostrame', 'ver', 'veo', 'filtrar', 'filtra', 'filtrame',
  'listar', 'lista', 'listame', 'buscar', 'busca', 'quitar', 'quita', 'limpiar', 'limpia', 'borrar',
])

/**
 * true si lo dictado es una orden de filtrado del listado; false si es un
 * ticket nuevo. Decide la primera palabra ("mostrar…", "filtrar…") o un
 * pedido de quitar los filtros ("todos los tickets").
 */
export function esComandoFiltro(texto: string): boolean {
  const fs = fichas(texto ?? '').filter((f) => !/^[,.;:]$/.test(f.norm))
  if (fs.length === 0) return false
  if (VERBOS_FILTRO.has(fs[0].norm)) return true
  // "todos los tickets" sí; "todas las cámaras no graban" es un ticket
  return fs.length <= 4 && parseFilterCommand(texto).limpiar && parseTicketCommand(texto).tipo === undefined
}
