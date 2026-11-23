// ============================================================
// Pruebas unitarias del extractor universal de formularios por voz.
// TypeScript real con Node.js (type stripping), sin Next ni red.
//
// Ejecutar desde la raíz: node pruebas/voz/extractor-formularios.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'

const {
  normalizarCorreo,
  normalizarTelefono,
  normalizarNumero,
  normalizarFecha,
  normalizarHora,
  coincidirOpcion,
  extraerDatosFormulario,
  seleccionarEsquema,
  esSolicitudFormulario,
} = await import('@/lib/voz/extractor-formularios')
const { ESQUEMAS_FORMULARIOS, esquemaPorId } = await import('@/lib/voz/esquemas-formularios')

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
  if (real !== esperado) throw new Error(`${campo} esperado ${JSON.stringify(esperado)}, recibido ${JSON.stringify(real)}`)
}

const hoy = new Date(2026, 10, 22) // 22 de noviembre de 2026

// ---------------------------------------------------------------------
// Normalizaciones habladas
// ---------------------------------------------------------------------
prueba('«ana arroba gmail punto com» → ana@gmail.com', () => {
  igual(normalizarCorreo('ana arroba gmail punto com'), 'ana@gmail.com')
})

prueba('correo ya escrito conserva @ y punto', () => {
  igual(normalizarCorreo('ana@gmail.com'), 'ana@gmail.com')
})

prueba('teléfono con espacios y guiones → solo dígitos', () => {
  igual(normalizarTelefono('7001 2345'), '70012345')
  igual(normalizarTelefono('700-123-45'), '70012345')
})

prueba('números hablados y separadores latinos', () => {
  igual(normalizarNumero('mil doscientos'), 1200)
  igual(normalizarNumero('1.234'), 1234)
  igual(normalizarNumero('1,5'), 1.5)
})

prueba('fechas naturales hoy y mañana → YYYY-MM-DD', () => {
  igual(normalizarFecha('hoy', hoy), '2026-11-22')
  igual(normalizarFecha('mañana', hoy), '2026-11-23')
  igual(normalizarFecha('25/11/2026', hoy), '2026-11-25')
})

prueba('horas habladas → HH:MM', () => {
  igual(normalizarHora('8 y 30'), '08:30')
  igual(normalizarHora('ocho y media'), '08:30')
  igual(normalizarHora('14:05'), '14:05')
})

prueba('coincidencia difusa sin tildes ni mayúsculas para selects', () => {
  const roles = esquemaPorId('crear-usuario').campos.find((c) => c.nombre === 'cboRol').opciones
  igual(coincidirOpcion('TECNICO', roles)?.valor, 'TECNICO')
  igual(coincidirOpcion('el administrador', roles)?.valor, 'ADMINISTRADOR')
  igual(coincidirOpcion('encargado', roles)?.valor, 'ENCARGADO')
})

// ---------------------------------------------------------------------
// Extracción por esquema
// ---------------------------------------------------------------------
prueba('registrar usuario con correo hablado, teléfono y rol', () => {
  const esquema = esquemaPorId('crear-usuario')
  const r = extraerDatosFormulario(
    'Quiero registrar un nuevo usuario llamado Ana Gómez, correo ana arroba gmail punto com, teléfono 7001 2345, rol técnico',
    esquema,
    hoy,
  )
  igual(r.esquemaId, 'crear-usuario')
  igual(r.valores.txtNombre, 'Ana gomez')
  igual(r.valores.txtCorreo, 'ana@gmail.com')
  igual(r.valores.txtTelefono, '70012345')
  igual(r.valores.cboRol, 'TECNICO')
  igual(r.faltantes.length, 1, 'faltantes')
  igual(r.faltantes[0].nombre, 'txtPassword')
  if (!r.resumen.includes('Contraseña')) throw new Error('el resumen no menciona el campo faltante')
})

prueba('registrar cliente con NIT y teléfono', () => {
  const r = extraerDatosFormulario(
    'Registrar nuevo cliente Empresa Sur, nit 123456, teléfono 70012345',
    esquemaPorId('crear-cliente'),
    hoy,
  )
  igual(r.valores.nombreRazonSocial, 'Empresa sur')
  igual(r.valores.documento, '123456')
  igual(r.valores.telefono, '70012345')
  if (r.faltantes.length < 2) throw new Error('deben quedar campos obligatorios sin rellenar')
})

prueba('crear ticket: urgencia y tipo se resuelven por sinónimos', () => {
  const r = extraerDatosFormulario(
    'Crear ticket urgente para cliente Juan por falla en cámara',
    esquemaPorId('crear-ticket'),
    hoy,
  )
  igual(r.valores.urgencia, 'CRITICA')
  igual(r.valores.tipo, 'CORRECTIVO')
})

prueba('programar orden con fecha y horas', () => {
  const r = extraerDatosFormulario(
    'Crear orden correctiva, fecha mañana, hora de inicio 8 y 30, hora de fin 10 y 30',
    esquemaPorId('crear-orden-correctiva'),
    hoy,
  )
  igual(r.valores.fecha, '2026-11-23')
  igual(r.valores.horaInicio, '08:30')
  igual(r.valores.horaFin, '10:30')
})

prueba('catálogo sin opciones conserva lo dictado para resolverlo el formulario', () => {
  const r = extraerDatosFormulario(
    'Nueva cotización, cliente Empresa Sur, establecimiento Casa Matriz',
    esquemaPorId('crear-cotizacion'),
    hoy,
  )
  igual(r.valores.clienteId, 'Empresa sur')
  igual(r.valores.establecimientoId, 'Casa matriz')
})

// ---------------------------------------------------------------------
// Selección de esquema (paso 1 vs paso 2)
// ---------------------------------------------------------------------
prueba('la navegación simple NO activa rellenado de formulario', () => {
  igual(esSolicitudFormulario('Quiero ver todos los usuarios'), false)
  igual(esSolicitudFormulario('Ir a clientes'), false)
  igual(seleccionarEsquema('Llévame a ver los tickets', ESQUEMAS_FORMULARIOS), null)
})

prueba('una frase de creación elige el esquema correcto', () => {
  igual(
    seleccionarEsquema('Quiero registrar un nuevo usuario llamado Ana', ESQUEMAS_FORMULARIOS)?.id,
    'crear-usuario',
  )
  igual(
    seleccionarEsquema('Registrar nuevo cliente Empresa Sur, nit 123', ESQUEMAS_FORMULARIOS)?.id,
    'crear-cliente',
  )
  igual(
    seleccionarEsquema('Crear ticket urgente por falla en cámara', ESQUEMAS_FORMULARIOS, '/tickets-soporte')?.id,
    'crear-ticket',
  )
})

prueba('el registro de esquemas cubre P1..P4 sin ids repetidos', () => {
  if (ESQUEMAS_FORMULARIOS.length < 26) throw new Error(`sólo ${ESQUEMAS_FORMULARIOS.length} esquemas`)
  const ids = ESQUEMAS_FORMULARIOS.map((e) => e.id)
  if (new Set(ids).size !== ids.length) throw new Error('ids duplicados')
  for (const esquema of ESQUEMAS_FORMULARIOS) {
    if (!esquema.ruta.startsWith('/')) throw new Error(`ruta inválida en ${esquema.id}`)
    if (!esquema.campos.length) throw new Error(`sin campos en ${esquema.id}`)
    for (const campo of esquema.campos) {
      if (!campo.etiqueta) throw new Error(`campo sin etiqueta en ${esquema.id}`)
    }
  }
})

console.log(`\nResultado: ${pasan} pasan, ${fallan} fallan`)
if (fallan) process.exitCode = 1
