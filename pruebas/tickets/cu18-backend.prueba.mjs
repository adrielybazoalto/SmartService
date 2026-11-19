// ============================================================
// Pruebas del BACKEND del CU18 (Gestionar Tickets de Soporte).
//
// Ejecuta el TypeScript REAL (servicio y Server Actions) con Node.js y un
// cliente Supabase FALSO que registra cada consulta. Sin red ni BD.
//
// Ejecutar desde la raíz:  node pruebas/tickets/cu18-backend.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'

const S = await import('@/backend/tickets/service')
const A = await import('@/app/actions/tickets')
const C = await import('@/backend/tickets/constantes')

let pasan = 0
let fallan = 0
const [errorOriginal, avisoOriginal] = [console.error, console.warn]
async function prueba(nombre, fn) {
  console.error = () => {}
  console.warn = () => {}
  try {
    await fn()
    pasan++
    console.log(`PASA  | ${nombre}`)
  } catch (e) {
    fallan++
    console.log(`FALLA | ${nombre} | ${e.message}`)
  } finally {
    console.error = errorOriginal
    console.warn = avisoOriginal
  }
}
function igual(real, esperado, campo = '') {
  const [a, b] = [JSON.stringify(real), JSON.stringify(esperado)]
  if (a !== b) throw new Error(`${campo} esperado ${b}, recibido ${a}`)
}
async function rechaza(promesa, mensaje) {
  try {
    await promesa
  } catch (e) {
    if (!e.message.includes(mensaje)) throw new Error(`mensaje esperado «${mensaje}», recibido «${e.message}»`)
    return
  }
  throw new Error(`se esperaba el error «${mensaje}»`)
}

/**
 * Cliente falso: cada consulta queda en `consultas` y la responde `responder`
 * ({ tabla, op, payload, filtros, modo } -> { data, error }).
 */
function dbFalsa(responder = () => ({ data: null, error: null })) {
  const consultas = []
  const rpcs = []
  const consulta = (tabla) => {
    const c = { tabla, op: 'select', payload: null, filtros: [], modo: 'lista' }
    const b = {
      select() { return b },
      insert(p) { c.op = 'insert'; c.payload = p; return b },
      update(p) { c.op = 'update'; c.payload = p; return b },
      eq(col, val) { c.filtros.push([col, val]); return b },
      order() { return b },
      single() { c.modo = 'uno'; return b },
      maybeSingle() { c.modo = 'uno'; return b },
      then(ok, ko) {
        consultas.push(c)
        return Promise.resolve(responder(c)).then(ok, ko)
      },
    }
    return b
  }
  return {
    consultas,
    rpcs,
    from: consulta,
    rpc(nombre, args) {
      rpcs.push({ nombre, args })
      return Promise.resolve(responder({ rpc: nombre, args }))
    },
  }
}

const SISTEMA = {
  id: 3,
  nombre_sistema: 'Alarma contra intrusión',
  numero_serie: null,
  establecimiento: { id: 2, nombre_establecimiento: 'Sucursal Norte', cliente: { id: 9, nombre: 'Farmacia Central', razon_social: null } },
}
const ADMIN = { id: 1, estado: true, rol: { id: 1, nombre: 'ADMINISTRADOR' } }
const TECNICO = { id: 5, estado: true, rol: { id: 3, nombre: 'TECNICO' } }

function sesion(usuario, acciones, db) {
  globalThis.__cu16 = { usuario, accionesPermitidas: acciones, db, cabeceras: { 'x-real-ip': '190.181.25.10' }, revalidadas: [] }
}

/** Responde a la creación de un ticket: sistema activo, insert y bitácora. */
function responderCreacion({ sistema = SISTEMA } = {}) {
  return (c) => {
    if (c.tabla === 'sistema_instalado') return { data: sistema, error: null }
    if (c.tabla === 'mantenimiento_ticket' && c.op === 'insert')
      return { data: { id: 7, ...c.payload, fecha_reporte: '2026-11-18 10:30:00' }, error: null }
    if (c.tabla === 'bitacora') return { data: { id: 1, ...c.payload }, error: null }
    return { data: null, error: null }
  }
}

const VALIDO = { sistema_instalado_id: 3, tipo_mantenimiento: 'CORRECTIVO', nivel_urgencia: 'ALTA', descripcion_incidencia: 'La sirena no suena' }

// ---------------------------------------------------------------------
// Validaciones (mensajes exactos)
// ---------------------------------------------------------------------
await prueba('sin sistema instalado: mensaje exacto y sin escrituras', async () => {
  const db = dbFalsa(responderCreacion())
  await rechaza(S.crearTicket(db, { ...VALIDO, sistema_instalado_id: undefined }, 1), C.MSG_SISTEMA_OBLIGATORIO)
  igual(db.consultas.length, 0)
})

await prueba('descripción vacía o solo espacios: mensaje exacto', async () => {
  const db = dbFalsa(responderCreacion())
  await rechaza(S.crearTicket(db, { ...VALIDO, descripcion_incidencia: '   ' }, 1), C.MSG_DESCRIPCION_OBLIGATORIA)
  igual(db.consultas.length, 0)
})

await prueba('los mensajes son los del enunciado', async () => {
  igual(C.MSG_SISTEMA_OBLIGATORIO, 'Debe seleccionar un sistema instalado para asociar el ticket.')
  igual(C.MSG_DESCRIPCION_OBLIGATORIA, 'La descripción de la incidencia es obligatoria.')
})

await prueba('sistema de un cliente/establecimiento inactivo: no se guarda', async () => {
  const db = dbFalsa(responderCreacion({ sistema: null }))
  await rechaza(S.crearTicket(db, VALIDO, 1), 'inactivo')
  igual(db.consultas.filter((c) => c.op === 'insert').length, 0)
})

// ---------------------------------------------------------------------
// Creación y bitácora
// ---------------------------------------------------------------------
await prueba('crea en ABIERTO y registra CREAR_TICKET con origen VOZ', async () => {
  const db = dbFalsa(responderCreacion())
  const t = await S.crearTicket(db, { ...VALIDO, origen: 'VOZ' }, 1, '190.181.25.10')
  igual(t.codigo, 'TK-2026-007')
  const insert = db.consultas.find((c) => c.tabla === 'mantenimiento_ticket' && c.op === 'insert')
  igual(insert.payload.estado, 'ABIERTO')
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(insert.payload.fecha_reporte)) throw new Error('fecha_reporte sin hora de Bolivia')
  const bit = db.consultas.find((c) => c.tabla === 'bitacora')
  igual(bit.payload.accion, 'CREAR_TICKET')
  igual(bit.payload.ip, '190.181.25.10')
  if (!bit.payload.descripcion.includes('Ticket registrado por VOZ')) throw new Error(bit.payload.descripcion)
  if (!bit.payload.descripcion.includes('Farmacia Central > Sucursal Norte > Alarma contra intrusión')) throw new Error(bit.payload.descripcion)
})

await prueba('sin origen se registra como MANUAL', async () => {
  const db = dbFalsa(responderCreacion())
  await S.crearTicket(db, VALIDO, 1, '190.181.25.10')
  const bit = db.consultas.find((c) => c.tabla === 'bitacora')
  if (!bit.payload.descripcion.endsWith('Ticket registrado MANUAL')) throw new Error(bit.payload.descripcion)
})

// ---------------------------------------------------------------------
// Cambio de estado
// ---------------------------------------------------------------------
const responderEstado = (estado) => (c) => {
  if (c.tabla === 'mantenimiento_ticket' && c.op === 'select')
    return { data: { id: 4, estado, fecha_reporte: '2026-11-18 08:00:00' }, error: null }
  if (c.tabla === 'mantenimiento_ticket' && c.op === 'update') return { data: { id: 4, ...c.payload }, error: null }
  return { data: { id: 1 }, error: null }
}

await prueba('ABIERTO -> EN_PROCESO actualiza con filtro por estado y audita', async () => {
  const db = dbFalsa(responderEstado('ABIERTO'))
  await S.cambiarEstadoTicket(db, { ticketId: 4, estado: 'EN_PROCESO' }, 1, '190.181.25.10')
  const upd = db.consultas.find((c) => c.op === 'update')
  igual(upd.filtros, [['id', 4], ['estado', 'ABIERTO']])
  const bit = db.consultas.find((c) => c.tabla === 'bitacora')
  igual(bit.payload.accion, 'ACTUALIZAR_ESTADO_TICKET')
  igual(bit.payload.descripcion, 'Ticket TK-2026-004: ABIERTO → EN_PROCESO')
})

await prueba('RESUELTO es final: no puede volver a EN_PROCESO', async () => {
  const db = dbFalsa(responderEstado('RESUELTO'))
  await rechaza(S.cambiarEstadoTicket(db, { ticketId: 4, estado: 'EN_PROCESO' }, 1), 'no puede pasar a En Proceso')
  igual(db.consultas.filter((c) => c.op === 'update').length, 0)
})

// ---------------------------------------------------------------------
// Derivar a OT
// ---------------------------------------------------------------------
await prueba('derivar llama a fn_derivar_ticket_orden con la ventana en hora de Bolivia', async () => {
  const db = dbFalsa((c) => (c.rpc ? { data: { id: 30, codigo_orden: 'OT-2026-018' }, error: null } : { data: null, error: null }))
  const ot = await S.derivarTicketAOrden(db, { ticketId: 4, fecha_programada: '2026-11-20', hora_inicio: '09:00', hora_fin: '12:00' }, 1, '190.181.25.10')
  igual(ot.codigo_orden, 'OT-2026-018')
  igual(db.rpcs[0], {
    nombre: 'fn_derivar_ticket_orden',
    args: { p_usuario_id: 1, p_ticket_id: 4, p_inicio: '2026-11-20 09:00:00', p_fin: '2026-11-20 12:00:00', p_ip: '190.181.25.10' },
  })
})

await prueba('ticket ya derivado: se propaga el mensaje de la BD con el código de la OT', async () => {
  const db = dbFalsa(() => ({ data: null, error: { code: 'P0001', message: 'El ticket TK-2026-004 ya fue derivado a la Orden de Trabajo OT-2026-018' } }))
  await rechaza(
    S.derivarTicketAOrden(db, { ticketId: 4, fecha_programada: '2026-11-20', hora_inicio: '09:00', hora_fin: '12:00' }, 1),
    'OT-2026-018',
  )
})

await prueba('ventana inválida: no llama a la BD', async () => {
  const db = dbFalsa()
  await rechaza(
    S.derivarTicketAOrden(db, { ticketId: 4, fecha_programada: '2026-11-20', hora_inicio: '12:00', hora_fin: '09:00' }, 1),
    'posterior',
  )
  igual(db.rpcs.length, 0)
})

// ---------------------------------------------------------------------
// Listado
// ---------------------------------------------------------------------
await prueba('listado: correlativo, cliente > establecimiento > sistema y OT vinculada', async () => {
  const db = dbFalsa(() => ({
    data: [
      { id: 12, tipo_mantenimiento: 'PREVENTIVO', nivel_urgencia: 'BAJA', descripcion_incidencia: 'Revisión', fecha_reporte: '2026-11-18 09:00:00', estado: 'EN_PROCESO', sistema_instalado: SISTEMA, orden_trabajo: [{ id: 30, codigo_orden: 'OT-2026-018', estado: 'PROGRAMADA' }] },
      { id: 13, tipo_mantenimiento: 'CORRECTIVO', nivel_urgencia: 'CRITICA', descripcion_incidencia: 'No graba', fecha_reporte: '2026-11-18 10:00:00', estado: 'ABIERTO', sistema_instalado: SISTEMA, orden_trabajo: null },
    ],
    error: null,
  }))
  const [a, b] = await S.listarTickets(db)
  igual([a.codigo, a.cliente.nombre, a.establecimiento.nombre, a.sistema.nombre, a.orden.codigo_orden], ['TK-2026-012', 'Farmacia Central', 'Sucursal Norte', 'Alarma contra intrusión', 'OT-2026-018'])
  igual([b.codigo, b.urgencia, b.orden], ['TK-2026-013', 'CRITICA', null])
})

// ---------------------------------------------------------------------
// Permisos (Server Actions)
// ---------------------------------------------------------------------
await prueba('Técnico (solo LEER) consulta pero no crea', async () => {
  const db = dbFalsa(() => ({ data: [], error: null }))
  sesion(TECNICO, ['MANTENIMIENTO_TICKETS:LEER'], db)
  igual((await A.listarTicketsAccion()).ok, true)
  const r = await A.crearTicketAccion(VALIDO)
  igual(r.ok, false)
  if (!r.error.includes('No autorizado')) throw new Error(r.error)
  igual(db.consultas.filter((c) => c.op === 'insert').length, 0)
})

await prueba('derivar exige además ORDENES_TRABAJO:CREAR (CU12)', async () => {
  const db = dbFalsa()
  sesion(ADMIN, ['MANTENIMIENTO_TICKETS:LEER', 'MANTENIMIENTO_TICKETS:CREAR'], db)
  const r = await A.derivarTicketAccion({ ticketId: 4, fecha_programada: '2026-11-20', hora_inicio: '09:00', hora_fin: '12:00' })
  igual(r.ok, false)
  igual(db.rpcs.length, 0)
})

await prueba('Encargado crea por la Server Action y se revalida el listado', async () => {
  const db = dbFalsa(responderCreacion())
  sesion({ id: 2, estado: true, rol: { id: 2, nombre: 'ENCARGADO' } }, ['MANTENIMIENTO_TICKETS:CREAR'], db)
  const r = await A.crearTicketAccion({ ...VALIDO, origen: 'VOZ' })
  igual([r.ok, r.ok && r.data.codigo], [true, 'TK-2026-007'])
  igual(globalThis.__cu16.revalidadas, ['/tickets-soporte'])
  igual(db.consultas.find((c) => c.tabla === 'bitacora').payload.usuario_id, 2)
})

console.log(`\n${pasan} pasan, ${fallan} fallan`)
if (fallan > 0) process.exit(1)
