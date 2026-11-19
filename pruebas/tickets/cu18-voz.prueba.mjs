// ============================================================
// Pruebas del parser de COMANDOS DE VOZ del CU18 (aporte propio).
//
// Ejecuta el TypeScript REAL con Node.js (type stripping): normalización,
// parseTicketCommand, parseFilterCommand y la resolución del sistema
// instalado. Sin red, sin Supabase y sin navegador.
//
// Ejecutar desde la raíz:  node pruebas/tickets/cu18-voz.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'

const { normalizarTexto } = await import('@/lib/voz/normalizar')
const { parseTicketCommand, parseFilterCommand, esComandoFiltro } = await import('@/backend/tickets/comandos-voz')
const { filtrarSistemasPorTexto } = await import('@/backend/tickets/busqueda')

let pasan = 0
let fallan = 0
function prueba(nombre, fn) {
  try {
    fn()
    pasan++
    console.log(`PASA  | ${nombre}`)
  } catch (e) {
    fallan++
    console.log(`FALLA | ${nombre} | ${e.message}`)
  }
}
function igual(real, esperado, campo = '') {
  const [a, b] = [JSON.stringify(real), JSON.stringify(esperado)]
  if (a !== b) throw new Error(`${campo} esperado ${b}, recibido ${a}`)
}
/** Compara solo los campos indicados del resultado. */
function contiene(real, esperado) {
  for (const [k, v] of Object.entries(esperado)) igual(real[k], v, `${k}:`)
}

// ---------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------
prueba('normaliza minúsculas, tildes y números en palabras', () => {
  igual(normalizarTexto('Tres CÁMARAS dañadas en el Depósito'), '3 camaras danadas en el deposito')
})
prueba('números compuestos y "un/una" se conservan como artículos', () => {
  igual(normalizarTexto('treinta y dos sensores y una alarma, veinticinco metros'), '32 sensores y una alarma, 25 metros')
})

// ---------------------------------------------------------------------
// parseTicketCommand: 12 frases realistas
// ---------------------------------------------------------------------
prueba('1. correctivo con cliente, síntoma y urgencia separados por comas', () => {
  contiene(
    parseTicketCommand('Ticket correctivo para el cliente Hotel Las Palmeras, las cámaras no graban desde ayer, urgencia alta'),
    {
      clienteTexto: 'hotel las palmeras',
      sistemaTexto: 'camara',
      tipo: 'CORRECTIVO',
      urgencia: 'ALTA',
      descripcion: 'Las cámaras no graban desde ayer',
    },
  )
})

prueba('2. todo con palabras clave y sin comas (como dicta Chrome Android)', () => {
  contiene(
    parseTicketCommand('cliente Farmacia Central Norte sistema alarma urgencia crítica descripción la sirena no suena al activar'),
    {
      clienteTexto: 'farmacia central norte',
      sistemaTexto: 'alarma',
      tipo: 'CORRECTIVO',
      urgencia: 'CRITICA',
      descripcion: 'La sirena no suena al activar',
    },
  )
})

prueba('3. mantenimiento preventivo con "revisión" y urgencia baja', () => {
  contiene(
    parseTicketCommand('Mantenimiento preventivo del cerco eléctrico del cliente Juan Carlos Rojas, revisión semestral, urgencia baja'),
    {
      clienteTexto: 'juan carlos rojas',
      sistemaTexto: 'cerco electrico',
      tipo: 'PREVENTIVO',
      urgencia: 'BAJA',
    },
  )
})

prueba('4. "urgente" equivale a CRITICA y "no funciona" a CORRECTIVO', () => {
  contiene(parseTicketCommand('Es urgente, el control de acceso de la sucursal norte no funciona'), {
    urgencia: 'CRITICA',
    tipo: 'CORRECTIVO',
    sistemaTexto: 'control de acceso',
    clienteTexto: 'norte',
  })
})

prueba('5. "emergencia" -> CRITICA; "dañado" -> CORRECTIVO; números a dígitos en la descripción', () => {
  const r = parseTicketCommand('Emergencia en Hotel Las Palmeras, tres cámaras dañadas por la tormenta')
  contiene(r, { urgencia: 'CRITICA', tipo: 'CORRECTIVO', sistemaTexto: 'camara' })
  if (!r.descripcion?.includes('3 cámaras dañadas')) throw new Error(`descripción: ${r.descripcion}`)
})

prueba('6. "avería" y "prioridad media"', () => {
  contiene(parseTicketCommand('Avería en la alarma del cliente Farmacia Central, prioridad media'), {
    tipo: 'CORRECTIVO',
    urgencia: 'MEDIA',
    clienteTexto: 'farmacia central',
    sistemaTexto: 'alarma',
  })
})

prueba('7. "roto" con sistema dicho tras la palabra "sistema de"', () => {
  contiene(parseTicketCommand('El sistema de cámaras del cliente Hotel Las Palmeras tiene un lente roto'), {
    tipo: 'CORRECTIVO',
    sistemaTexto: 'camara',
    clienteTexto: 'hotel las palmeras',
  })
})

prueba('8. solo la descripción: el texto que sobra es la descripción', () => {
  contiene(parseTicketCommand('la cámara del parqueo no graba de noche'), {
    tipo: 'CORRECTIVO',
    sistemaTexto: 'camara',
    descripcion: 'La cámara del parqueo no graba de noche',
    camposDetectados: ['tipo', 'sistema', 'descripcion'],
  })
})

prueba('9. "tipo preventivo" y "nivel de urgencia alta" se quitan de la descripción', () => {
  contiene(
    parseTicketCommand('Registrar ticket tipo preventivo, nivel de urgencia alta, cliente Juan Carlos Rojas, limpieza de aisladores'),
    { tipo: 'PREVENTIVO', urgencia: 'ALTA', clienteTexto: 'juan carlos rojas', descripcion: 'Limpieza de aisladores' },
  )
})

prueba('10. el tipo explícito manda sobre el síntoma', () => {
  contiene(parseTicketCommand('Mantenimiento preventivo, la alarma falla a veces'), {
    tipo: 'PREVENTIVO',
    sistemaTexto: 'alarma',
    descripcion: 'La alarma falla a veces',
  })
})

prueba('11. sistema libre tras "equipo" (sin palabra conocida)', () => {
  contiene(parseTicketCommand('cliente Hotel Las Palmeras equipo DVR principal con falla, urgencia alta'), {
    clienteTexto: 'hotel las palmeras',
    sistemaTexto: 'dvr principal',
    tipo: 'CORRECTIVO',
    urgencia: 'ALTA',
  })
})

prueba('12. frase sin datos útiles: ningún campo', () => {
  igual(parseTicketCommand('eh').camposDetectados, [])
  igual(parseTicketCommand('').camposDetectados, [])
})

prueba('13. descripción explícita al final sin que el cliente la absorba', () => {
  contiene(
    parseTicketCommand('cliente Farmacia Central descripción cambio de batería del panel, urgencia media'),
    { clienteTexto: 'farmacia central', urgencia: 'MEDIA', descripcion: 'Cambio de batería del panel' },
  )
})

// ---------------------------------------------------------------------
// parseFilterCommand
// ---------------------------------------------------------------------
prueba('filtro: "mostrar tickets abiertos de urgencia crítica"', () => {
  contiene(parseFilterCommand('mostrar tickets abiertos de urgencia crítica'), { estado: 'ABIERTO', urgencia: 'CRITICA', limpiar: false })
})
prueba('filtro: "tickets en proceso"', () => {
  contiene(parseFilterCommand('tickets en proceso'), { estado: 'EN_PROCESO', urgencia: undefined })
})
prueba('filtro: "ver los resueltos de prioridad alta"', () => {
  contiene(parseFilterCommand('ver los resueltos de prioridad alta'), { estado: 'RESUELTO', urgencia: 'ALTA' })
})
prueba('filtro: "solo los urgentes" -> CRITICA', () => {
  contiene(parseFilterCommand('solo los urgentes'), { estado: undefined, urgencia: 'CRITICA' })
})
prueba('filtro: "mostrar todos" limpia los filtros', () => {
  contiene(parseFilterCommand('mostrar todos los tickets'), { limpiar: true, camposDetectados: [] })
})
prueba('filtro: "todos los cancelados" filtra, no limpia', () => {
  contiene(parseFilterCommand('todos los cancelados'), { estado: 'CANCELADO', limpiar: false })
})

// ---------------------------------------------------------------------
// Resolución del sistema instalado
// ---------------------------------------------------------------------
const SISTEMAS = [
  { id: 1, nombre_sistema: 'Cámaras de seguridad CCTV', numero_serie: 'CCTV-01', establecimiento: { id: 1, nombre: 'Hotel Las Palmeras - Edificio principal' }, cliente: { id: 1, nombre: 'Hotel Las Palmeras', razon_social: 'Palmeras SRL' } },
  { id: 2, nombre_sistema: 'Control de acceso biométrico', numero_serie: null, establecimiento: { id: 2, nombre: 'Hotel Las Palmeras - Oficinas' }, cliente: { id: 1, nombre: 'Hotel Las Palmeras', razon_social: 'Palmeras SRL' } },
  { id: 3, nombre_sistema: 'Alarma contra intrusión', numero_serie: null, establecimiento: { id: 3, nombre: 'Sucursal Norte' }, cliente: { id: 2, nombre: 'Farmacia Central', razon_social: null } },
  { id: 4, nombre_sistema: 'Cámara IP', numero_serie: null, establecimiento: { id: 4, nombre: 'Sucursal Sur' }, cliente: { id: 2, nombre: 'Farmacia Central', razon_social: null } },
  { id: 5, nombre_sistema: 'Cerco eléctrico perimetral', numero_serie: null, establecimiento: { id: 5, nombre: 'Domicilio' }, cliente: { id: 3, nombre: 'Juan Carlos Rojas', razon_social: null } },
]
const ids = (lista) => lista.map((s) => s.id)

prueba('resolución: una coincidencia (cliente + sistema, sin tildes)', () => {
  igual(ids(filtrarSistemasPorTexto(SISTEMAS, { clienteTexto: 'hotel las palmeras', sistemaTexto: 'camara' })), [1])
})
prueba('resolución: varias coincidencias ("camaras" en singular y plural)', () => {
  igual(ids(filtrarSistemasPorTexto(SISTEMAS, { sistemaTexto: 'camaras' })), [1, 4])
})
prueba('resolución: por establecimiento y razón social', () => {
  igual(ids(filtrarSistemasPorTexto(SISTEMAS, { clienteTexto: 'norte' })), [3])
  igual(ids(filtrarSistemasPorTexto(SISTEMAS, { clienteTexto: 'palmeras srl', sistemaTexto: 'control de acceso' })), [2])
})
prueba('resolución: ninguna coincidencia o sin texto -> []', () => {
  igual(ids(filtrarSistemasPorTexto(SISTEMAS, { clienteTexto: 'banco' })), [])
  igual(ids(filtrarSistemasPorTexto(SISTEMAS, {})), [])
})
prueba('integración: frase dictada -> sistema único', () => {
  const cmd = parseTicketCommand('cliente Juan Carlos Rojas, el cerco eléctrico no funciona')
  igual(ids(filtrarSistemasPorTexto(SISTEMAS, cmd)), [5])
})

prueba('micrófono único: órdenes de filtrado', () => {
  for (const t of ['mostrar tickets abiertos de urgencia crítica', 'Filtrar los resueltos', 'ver los cancelados',
                   'quitar filtros', 'todos los tickets', 'muéstrame los urgentes'])
    igual(esComandoFiltro(t), true)
})
prueba('micrófono único: tickets nuevos', () => {
  for (const t of ['Correctivo, cliente Hotel Las Palmeras, las cámaras no graban, urgencia alta',
                   'correctivo, todas las cámaras no graban', 'todas las cámaras del hotel no graban desde ayer',
                   'el cerco eléctrico no funciona', ''])
    igual(esComandoFiltro(t), false)
})

console.log(`\n${pasan} pasan, ${fallan} fallan`)
if (fallan > 0) process.exit(1)
