/**
 * Motor de lenguaje natural del Asistente de Navegación por Voz (CU global,
 * solo ADMINISTRADOR). Funciones PURAS: sin React, sin servidor, sin window.
 *
 * El catálogo de destinos se DERIVA de `lib/navigation.ts` (única fuente de
 * verdad del menú), de modo que cualquier módulo nuevo de P1..P4 queda
 * navegable por voz al agregarlo a PAQUETES. Encima se añaden sinónimos
 * conversacionales y detectores de filtros/acciones para las vistas que ya
 * aceptan query params (o que los aceptan desde esta entrega).
 */

import { PAQUETES } from '@/lib/navigation'
import { normalizarTexto } from '@/lib/voz/normalizar'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/** Query params que se añaden a la ruta destino. */
export type ParamsVoz = Record<string, string>

export interface IntencionNavegacion {
  tipo: 'navegacion'
  /** Ruta interna de Next.js, sin query. */
  ruta: string
  /** Ruta completa con query params codificados (lista para router.push). */
  destino: string
  cu: string | null
  etiqueta: string
  paquete: string
  filtros: ParamsVoz
  /** Texto corto para el popover: «Tickets de Soporte (CU18) · filtro: abiertos». */
  resumen: string
}

export interface SinIntencion {
  tipo: 'no-entendido'
  mensaje: string
}

export type ResultadoInterpretacion = IntencionNavegacion | SinIntencion

interface DestinoBase {
  id: string
  ruta: string
  cu: string | null
  etiqueta: string
  paquete: string
  alias: string[]
}

interface ReglaFiltro {
  /** Frases que activan el filtro (se comparan ya normalizadas). */
  palabras: string[]
  param: string
  valor: string
  /** Etiqueta legible del filtro para el feedback. */
  texto: string
}

// ---------------------------------------------------------------------------
// Vocabulario: cada palabras clave son sinónimos/alias conversacionales
// ---------------------------------------------------------------------------

const ALIAS: Record<string, string[]> = {
  // P1 · Seguridad y gestión de accesos
  inicio: [
    'inicio',
    'dashboard',
    'panel principal',
    'pantalla principal',
    'menu principal',
    'menú principal',
    'casa',
    'todos los modulos',
    'todas las opciones',
  ],
  usuarios: [
    'usuarios',
    'usuario',
    'cuentas internas',
    'cuentas',
    'gestion de usuarios',
    'gestión de usuarios',
    'alta de usuarios',
  ],
  roles: [
    'roles',
    'permisos',
    'roles y permisos',
    'matriz de permisos',
    'accesos',
    'seguridad',
    'asignar permisos',
  ],
  perfil: [
    'perfil',
    'mi perfil',
    'mis datos',
    'mi cuenta',
    'cambiar contraseña',
    'configuracion de cuenta',
    'configuración de cuenta',
  ],
  bitacora: [
    'bitacora',
    'bitácora',
    'auditoria',
    'auditoría',
    'registro de eventos',
    'historial de accesos',
    'logs',
    'eventos del sistema',
  ],

  // P2 · Comercial, clientes, catálogo y ventas
  clientes: [
    'clientes',
    'cliente',
    'establecimientos',
    'clientes y establecimientos',
    'razones sociales',
    'directorio de clientes',
    'cartera de clientes',
  ],
  cotizaciones: [
    'cotizaciones',
    'cotizacion',
    'cotización',
    'proformas',
    'proforma',
    'presupuestos',
    'presupuesto',
    'propuestas',
    'cotizar',
  ],
  ventas: [
    'ventas',
    'venta',
    'caja',
    'punto de venta',
    'mostrador',
    'arqueo de caja',
    'cobros en mostrador',
  ],
  proveedores: [
    'proveedores',
    'proveedor',
    'mayoristas',
    'catalogo de mayoristas',
    'catálogo de mayoristas',
    'comparacion de precios',
    'comparación de precios',
  ],
  compras: [
    'compras',
    'compra',
    'adquisiciones',
    'compras de equipos',
    'compras de insumos',
    'ingreso de mercaderia',
    'ingreso de mercadería',
  ],
  inventario: [
    'inventario',
    'stock',
    'kardex',
    'kárdex',
    'almacen',
    'almacén',
    'bodega',
    'productos',
    'existencias',
  ],
  servicios: [
    'servicios',
    'servicio',
    'catalogo',
    'catálogo',
    'catalogo de servicios',
    'catálogo de servicios',
    'tarifas',
    'precios de servicios',
    'lista de precios',
  ],

  // P3 · Personal técnico y logística de campo
  'personal-tecnico': [
    'personal tecnico',
    'personal técnico',
    'tecnicos',
    'técnicos',
    'jornadas',
    'disponibilidad',
    'horarios',
    'asistencia',
    'ausencias',
    'hoja de vida',
  ],
  'asignar-tecnicos': [
    'asignar tecnicos',
    'asignar técnicos',
    'asignaciones',
    'asignacion de tecnicos',
    'asignación de técnicos',
    'cuadrillas',
    'programar tecnicos',
    'programar técnicos',
    'programacion',
    'programación',
  ],
  'ordenes-trabajo': [
    'ordenes de trabajo',
    'órdenes de trabajo',
    'orden de trabajo',
    'orden de servicio',
    'ordenes',
    'órdenes',
    'trabajos',
    'trabajos pendientes',
    'ot',
    'ots',
    'reporte de campo',
  ],
  liquidacion: [
    'liquidacion',
    'liquidación',
    'liquidaciones',
    'notas de servicio',
    'nota de servicio',
    'facturacion de servicios',
    'facturación de servicios',
    'cobro de ordenes',
    'cobro de órdenes',
  ],

  // P4 · Post-venta, alertas y reportes gerenciales
  'tickets-soporte': [
    'tickets de soporte',
    'ticket de soporte',
    'tickets',
    'ticket',
    'incidencias',
    'incidencia',
    'soporte',
    'mantenimientos',
    'mantenimiento',
    'fallas',
    'falla',
    'problemas',
    'reporte de falla',
    'sistemas instalados',
    'crear ticket',
    'nuevo ticket',
    'registrar ticket',
    'crear incidencia',
    'nueva incidencia',
  ],
  alertas: [
    'alertas preventivas',
    'alerta preventiva',
    'alertas',
    'alerta',
    'mantenimientos preventivos',
    'mantenimiento preventivo',
    'vencimientos',
    'recordatorios',
    'avisos de mantenimiento',
  ],
  reportes: [
    'reportes gerenciales',
    'reporte gerencial',
    'reportes',
    'reporte',
    'estadisticas',
    'estadísticas',
    'informes',
    'informe',
    'indicadores',
    'metricas',
    'métricas',
    'balance',
    'dashboard gerencial',
  ],
}

/** Destinos auxiliares reales que también se pueden pedir por voz. */
const DESTINOS_EXTRA: DestinoBase[] = [
  {
    id: 'nueva-cotizacion',
    ruta: '/cotizaciones/nuevo',
    cu: 'CU08',
    etiqueta: 'Nueva Cotización',
    paquete: 'P2',
    alias: ['nueva cotizacion', 'nueva cotización', 'crear cotizacion', 'registrar cotizacion', 'hacer cotizacion'],
  },
  {
    id: 'nueva-compra',
    ruta: '/compras/nueva',
    cu: 'CU15',
    etiqueta: 'Registrar Compra',
    paquete: 'P2',
    alias: ['nueva compra', 'registrar compra', 'crear compra', 'ingresar compra'],
  },
]

/** Catálogo derivado: PAQUETES + los dos atajos de alta de P2. */
const DESTINOS: DestinoBase[] = [
  ...PAQUETES.filter((p) => p.habilitado).flatMap((paquete) =>
    paquete.items.map((item) => ({
      id: item.id,
      ruta: item.ruta,
      cu: item.cu ?? null,
      etiqueta: item.etiqueta.replace(/\s*\(CU\d+\)\s*$/, ''),
      paquete: paquete.id,
      alias: ALIAS[item.id] ?? [item.etiqueta],
    })),
  ),
  ...DESTINOS_EXTRA,
]

/** Filtros y acciones que la vista destino entiende por query param. */
const FILTROS: Record<string, ReglaFiltro[]> = {
  '/tickets-soporte': [
    {
      palabras: ['abiertos', 'abiertas', 'abierto', 'abierta', 'pendientes', 'pendiente'],
      param: 'estado',
      valor: 'ABIERTO',
      texto: 'abiertos',
    },
    {
      palabras: ['en proceso', 'en curso', 'proceso', 'en_proceso'],
      param: 'estado',
      valor: 'EN_PROCESO',
      texto: 'en proceso',
    },
    {
      palabras: ['resueltos', 'resueltas', 'resuelto', 'resuelta', 'cerrados', 'cerradas', 'cerrado', 'cerrada'],
      param: 'estado',
      valor: 'RESUELTO',
      texto: 'resueltos',
    },
    {
      palabras: ['cancelados', 'canceladas', 'cancelado', 'cancelada', 'anulados', 'anuladas'],
      param: 'estado',
      valor: 'CANCELADO',
      texto: 'cancelados',
    },
    {
      palabras: ['urgencia media', 'prioridad media', 'medianos', 'medias', 'media', 'medio'],
      param: 'urgencia',
      valor: 'MEDIA',
      texto: 'urgencia media',
    },
    {
      palabras: ['urgencia alta', 'prioridad alta', 'altos', 'altas'],
      param: 'urgencia',
      valor: 'ALTA',
      texto: 'urgencia alta',
    },
    {
      palabras: ['urgencia critica', 'critica', 'crítica', 'critico', 'crítico', 'urgente', 'emergencia'],
      param: 'urgencia',
      valor: 'CRITICA',
      texto: 'urgencia crítica',
    },
    {
      palabras: ['urgencia baja', 'baja', 'bajo', 'bajas'],
      param: 'urgencia',
      valor: 'BAJA',
      texto: 'urgencia baja',
    },
  ],
  '/ordenes-trabajo': [
    {
      palabras: ['programadas', 'programada', 'pendientes', 'pendiente', 'por programar'],
      param: 'estado',
      valor: 'PROGRAMADA',
      texto: 'programadas',
    },
    {
      palabras: ['en curso', 'en proceso', 'en_progreso', 'iniciadas', 'iniciada'],
      param: 'estado',
      valor: 'EN_PROGRESO',
      texto: 'en curso',
    },
    {
      palabras: ['finalizadas', 'finalizada', 'terminadas', 'completadas', 'completada'],
      param: 'estado',
      valor: 'FINALIZADA',
      texto: 'finalizadas',
    },
    {
      palabras: ['canceladas', 'cancelada', 'anuladas', 'anulada'],
      param: 'estado',
      valor: 'CANCELADA',
      texto: 'canceladas',
    },
  ],
  '/alertas': [
    {
      palabras: ['todas', 'todos', 'incluyendo leidas', 'incluyendo leídas'],
      param: 'filtro',
      valor: 'todas',
      texto: 'todas las alertas',
    },
    {
      palabras: ['pendientes', 'sin leer', 'no leidas', 'no leídas', 'vencidas', 'vencidos', 'vencida', 'vencido'],
      param: 'filtro',
      valor: 'pendientes',
      texto: 'pendientes',
    },
  ],
  '/inventario': [
    {
      palabras: [
        'criticos',
        'críticos',
        'critico',
        'crítico',
        'critica',
        'crítica',
        'stock critico',
        'stock crítico',
        'stock bajo',
        'stock minimo',
        'stock mínimo',
        'bajo stock',
      ],
      param: 'critico',
      valor: '1',
      texto: 'stock crítico',
    },
    {
      palabras: ['activos e inactivos', 'todos los productos', 'incluyendo inactivos'],
      param: 'estado',
      valor: 'todos',
      texto: 'activos e inactivos',
    },
  ],
  '/servicios': [
    {
      palabras: ['activos', 'disponibles', 'vigentes'],
      param: 'estado',
      valor: 'activos',
      texto: 'activos',
    },
    {
      palabras: ['inactivos', 'dados de baja', 'desactivados'],
      param: 'estado',
      valor: 'inactivos',
      texto: 'inactivos',
    },
  ],
  '/asignar-tecnicos': [
    {
      palabras: ['sin asignar', 'sin tecnico', 'sin técnico', 'sin cuadrilla'],
      param: 'cuadrilla',
      valor: 'sin_asignar',
      texto: 'sin asignar',
    },
    {
      palabras: ['asignadas', 'con cuadrilla', 'con tecnico', 'con técnico'],
      param: 'cuadrilla',
      valor: 'asignadas',
      texto: 'con cuadrilla',
    },
    {
      palabras: ['en curso', 'en proceso', 'en ejecucion', 'en ejecución'],
      param: 'estado',
      valor: 'en_curso',
      texto: 'en curso',
    },
  ],
  '/compras': [
    {
      palabras: ['facturas', 'factura'],
      param: 'tipo',
      valor: 'FACTURA',
      texto: 'facturas',
    },
    {
      palabras: ['notas', 'nota de entrega', 'notas de entrega'],
      param: 'tipo',
      valor: 'NOTA',
      texto: 'notas de entrega',
    },
  ],
  '/reportes': [
    ...(
      [
        [['resumen', 'general', 'resumen general'], 'RESUMEN_GENERAL', 'resumen general'],
        [['ingresos', 'ventas', 'recaudacion', 'recaudación'], 'INGRESOS', 'ingresos'],
        [['servicios mas solicitados', 'servicios más solicitados'], 'SERVICIOS', 'servicios'],
        [['rotacion', 'rotación', 'rotacion de inventario', 'rotación de inventario'], 'ROTACION_INVENTARIO', 'rotación de inventario'],
        [['inventario critico', 'inventario crítico', 'stock critico', 'stock crítico'], 'INVENTARIO_CRITICO', 'inventario crítico'],
        [['rendimiento tecnico', 'rendimiento técnico', 'por tecnico', 'por técnico'], 'RENDIMIENTO_TECNICO', 'rendimiento técnico'],
        [['proveedores', 'rentabilidad'], 'PROVEEDORES', 'proveedores'],
      ] as Array<[string[], string, string]>
    ).map(([palabras, valor, texto]) => ({ palabras, param: 'tipo', valor, texto })),
    ...(
      [
        [['hoy', 'de hoy'], 'HOY', 'hoy'],
        [['esta semana', 'semanal'], 'ESTA_SEMANA', 'esta semana'],
        [['este mes', 'mensual'], 'ESTE_MES', 'este mes'],
        [['mes anterior', 'mes pasado'], 'MES_ANTERIOR', 'mes anterior'],
        [['este año', 'este anio', 'anual'], 'ESTE_ANIO', 'este año'],
      ] as Array<[string[], string, string]>
    ).map(([palabras, valor, texto]) => ({ palabras, param: 'atajo', valor, texto })),
  ],
}

const SIN_INTENCION: SinIntencion = {
  tipo: 'no-entendido',
  mensaje:
    'No entendí la instrucción. Puede decir, por ejemplo: «llévame a tickets de soporte», ' +
    '«abre las órdenes de trabajo» o «quiero ver los reportes gerenciales».',
}

// ---------------------------------------------------------------------------
// Utilidades internas
// ---------------------------------------------------------------------------

function escapar(rgx: string): string {
  return rgx.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Normaliza y quita signos de puntuación para comparar con límites de palabra. */
function textoLimpio(texto: string): string {
  return normalizarTexto(texto)
    .replace(/[,.;:¡!¿?()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function contieneFrase(texto: string, frase: string): boolean {
  const f = textoLimpio(frase)
  if (!f) return false
  return new RegExp(`(^|\\s)${escapar(f)}($|\\s)`).test(texto)
}

function contieneAlguna(texto: string, opciones: string[]): boolean {
  return opciones.some((opcion) => contieneFrase(texto, opcion))
}

/**
 * Puntúa cada destino. Las frases de varias palabras pesan más que una
 * palabra suelta, y se refuerzan las intenciones de reportes/tickets cuando
 * el hablante usa palabras propias de esos dominios.
 */
function puntuar(texto: string, destino: DestinoBase): number {
  let puntos = 0
  for (const alias of destino.alias) {
    if (!contieneFrase(texto, alias)) continue
    const palabras = textoLimpio(alias).split(' ').length
    puntos = Math.max(puntos, 8 + palabras * 12)
  }

  if (destino.id === 'reportes' && contieneAlguna(texto, ['reporte', 'reportes', 'estadisticas', 'informe', 'informes', 'indicadores', 'metricas'])) {
    puntos += 25
  }
  if (
    destino.id === 'tickets-soporte' &&
    contieneAlguna(texto, ['incidencia', 'incidencias', 'falla', 'fallas', 'soporte', 'ticket', 'tickets'])
  ) {
    puntos += 20
  }

  // «crear nuevo ticket» debe ganar al destino genérico «tickets».
  if (destino.id === 'tickets-soporte' && contieneAlguna(texto, ['crear ticket', 'nuevo ticket', 'registrar ticket'])) {
    puntos += 30
  }

  return puntos
}

/** Detecta filtros y acciones y construye la query. Evita duplicar un mismo param. */
function resolverParams(ruta: string, texto: string, idDestino: string): { filtros: ParamsVoz; etiquetas: string[] } {
  const filtros: ParamsVoz = {}
  const etiquetas: string[] = []

  for (const regla of FILTROS[ruta] ?? []) {
    if (!contieneAlguna(texto, regla.palabras)) continue
    if (filtros[regla.param]) continue // primera coincidencia = más específica
    filtros[regla.param] = regla.valor
    etiquetas.push(regla.texto)
  }

  if (
    idDestino === 'tickets-soporte' &&
    contieneAlguna(texto, ['crear ticket', 'nuevo ticket', 'registrar ticket', 'crear incidencia', 'nueva incidencia', 'reportar falla'])
  ) {
    filtros.accion = 'crear'
    etiquetas.push('abrir formulario de nuevo ticket')
  }

  return { filtros, etiquetas }
}

function construirDestino(ruta: string, filtros: ParamsVoz): string {
  const params = new URLSearchParams()
  for (const [clave, valor] of Object.entries(filtros)) params.set(clave, valor)
  const qs = params.toString()
  return qs ? `${ruta}?${qs}` : ruta
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Interpreta una frase conversacional en español y devuelve un destino real
 * del sistema. `interpretarComandoVoz('muéstrame tickets abiertos')` →
 * `/tickets-soporte?estado=ABIERTO`.
 */
export function interpretarComandoVoz(texto: string): ResultadoInterpretacion {
  const limpio = textoLimpio(texto)
  if (!limpio) return SIN_INTENCION

  let mejor: DestinoBase | null = null
  let mejorPuntos = 0
  for (const destino of DESTINOS) {
    const puntos = puntuar(limpio, destino)
    if (puntos > mejorPuntos) {
      mejor = destino
      mejorPuntos = puntos
    }
  }

  if (!mejor || mejorPuntos === 0) return SIN_INTENCION

  const { filtros, etiquetas } = resolverParams(mejor.ruta, limpio, mejor.id)
  const destino = construirDestino(mejor.ruta, filtros)
  const sufijoCu = mejor.cu ? ` (${mejor.cu})` : ''
  const resumen = etiquetas.length
    ? `${mejor.etiqueta}${sufijoCu} · ${etiquetas.join(', ')}`
    : `${mejor.etiqueta}${sufijoCu}`

  return {
    tipo: 'navegacion',
    ruta: mejor.ruta,
    destino,
    cu: mejor.cu,
    etiqueta: mejor.etiqueta,
    paquete: mejor.paquete,
    filtros,
    resumen,
  }
}

/** Destinos disponibles (para documentación, pruebas o ayuda en la interfaz). */
export function listarDestinosVoz(): Array<{ ruta: string; etiqueta: string; paquete: string; cu: string | null }> {
  return DESTINOS.map(({ ruta, etiqueta, paquete, cu }) => ({ ruta, etiqueta, paquete, cu }))
}

export const MENSAJE_NO_ENTENDIDO = SIN_INTENCION.mensaje
