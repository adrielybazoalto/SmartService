// ============================================================
// Pruebas del BACKEND del CU19 (Alertas Preventivas).
//
// Ejecuta el TypeScript REAL (servicio, Server Actions y Route Handler) con
// Node.js y un cliente Supabase FALSO que registra cada consulta. Sin red ni
// BD. La idempotencia real del SQL se prueba en cu19-rpc.prueba.mjs (PGlite).
//
// Ejecutar desde la raíz:  node pruebas/alertas/cu19-backend.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'

const S = await import('@/backend/alertas/service')
const C = await import('@/backend/alertas/constantes')
const A = await import('@/app/actions/alertas')
const R = await import('@/app/api/cron/alertas/route')

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
function afirma(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje)
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
 * ({ tabla, op, payload, filtros, ordenes, modo } | { rpc, args } -> { data, error }).
 */
function dbFalsa(responder = () => ({ data: null, error: null })) {
  const consultas = []
  const rpcs = []
  const consulta = (tabla) => {
    const c = { tabla, op: 'select', payload: null, filtros: [], ordenes: [], modo: 'lista' }
    const b = {
      select(columnas) { c.columnas = columnas; return b },
      insert(p) { c.op = 'insert'; c.payload = p; return b },
      update(p) { c.op = 'update'; c.payload = p; return b },
      eq(col, val) { c.filtros.push([col, val]); return b },
      order(col, opciones) { c.ordenes.push([col, opciones]); return b },
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
      const c = { rpc: nombre, args }
      rpcs.push(c)
      return Promise.resolve(responder(c))
    },
  }
}

const ADMIN = { id: 1, estado: true, rol: { id: 1, nombre: 'ADMINISTRADOR' } }
const TECNICO = { id: 5, estado: true, rol: { id: 3, nombre: 'TECNICO' } }

function sesion(usuario, acciones, db) {
  globalThis.__cu16 = {
    usuario,
    accionesPermitidas: acciones,
    db,
    cabeceras: { 'x-real-ip': '190.181.25.10' },
    revalidadas: [],
  }
}

function fechaBolivia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d))
  t.setUTCDate(t.getUTCDate() + dias)
  return t.toISOString().slice(0, 10)
}

const HOY = fechaBolivia()
const VENCIDO = sumarDias(HOY, -10)
const PROXIMO = sumarDias(HOY, 5)
const LEJANO = sumarDias(HOY, 200)

function filaAlerta(id, fecha, { leido = false, sistema = 100 + id } = {}) {
  return {
    id,
    mensaje: C.mensajeAlerta(fecha ?? ''),
    fecha_alerta: `${HOY} 06:00:00`,
    leido,
    sistema_instalado: {
      id: sistema,
      nombre_sistema: `Sistema ${id}`,
      numero_serie: `SN-${id}`,
      periodicidad_meses: 6,
      fecha_ultimo_mantenimiento: '2026-05-01',
      fecha_proximo_mantenimiento: fecha,
      establecimiento: {
        id: 10,
        nombre_establecimiento: 'Sucursal Centro',
        cliente: { id: 1, nombre: 'Cliente Demo' },
      },
    },
  }
}

// ---------------------------------------------------------------------
// Umbral y constantes
// ---------------------------------------------------------------------
await prueba('umbral por defecto: 30 días', async () => {
  const previo = process.env.ALERTAS_UMBRAL_DIAS
  delete process.env.ALERTAS_UMBRAL_DIAS
  igual(S.umbralDias(), 30)
  process.env.ALERTAS_UMBRAL_DIAS = '45'
  igual(S.umbralDias(), 45)
  process.env.ALERTAS_UMBRAL_DIAS = 'abc'
  igual(S.umbralDias(), 30)
  process.env.ALERTAS_UMBRAL_DIAS = '-5'
  igual(S.umbralDias(), 30)
  if (previo === undefined) delete process.env.ALERTAS_UMBRAL_DIAS
  else process.env.ALERTAS_UMBRAL_DIAS = previo
})

await prueba('el mensaje de la alerta sale de una única plantilla', async () => {
  igual(C.mensajeAlerta('2026-12-01'), 'Mantenimiento preventivo programado para el 2026-12-01.')
  igual(C.PLANTILLA_MENSAJE_ALERTA, 'Mantenimiento preventivo programado para el {fecha}.')
})

// ---------------------------------------------------------------------
// Urgencia con fechas reales
// ---------------------------------------------------------------------
await prueba('clasifica vencido / próximo / vigente / sin fecha', async () => {
  igual(S.urgenciaDe(sumarDias(HOY, -1), 30, HOY), 'VENCIDO')
  igual(S.urgenciaDe(HOY, 30, HOY), 'PROXIMO')
  igual(S.urgenciaDe(sumarDias(HOY, 30), 30, HOY), 'PROXIMO')
  igual(S.urgenciaDe(sumarDias(HOY, 31), 30, HOY), 'VIGENTE')
  igual(S.urgenciaDe(null, 30, HOY), 'SIN_FECHA')
})

await prueba('diasRestantes no usa la zona horaria del proceso', async () => {
  igual(S.diasRestantes(sumarDias(HOY, -10), HOY), -10)
  igual(S.diasRestantes(sumarDias(HOY, 15), HOY), 15)
  igual(S.diasRestantes(null, HOY), null)
})

// ---------------------------------------------------------------------
// Consulta y orden
// ---------------------------------------------------------------------
await prueba('lista pendientes, mapea datos y ordena por urgencia', async () => {
  const filas = [
    filaAlerta(4, null, { sistema: 104 }),
    filaAlerta(3, LEJANO, { sistema: 103 }),
    filaAlerta(1, VENCIDO, { sistema: 101 }),
    filaAlerta(2, PROXIMO, { sistema: 102 }),
  ]
  const db = dbFalsa(() => ({ data: filas, error: null }))
  const alertas = await S.listarAlertas(db, false)

  igual(alertas.map((a) => a.id), [1, 2, 3, 4])
  igual(alertas.map((a) => a.urgencia), ['VENCIDO', 'PROXIMO', 'VIGENTE', 'SIN_FECHA'])
  igual(alertas[0].cliente.nombre, 'Cliente Demo')
  igual(alertas[0].establecimiento.nombre, 'Sucursal Centro')
  igual(alertas[0].sistema.nombre, 'Sistema 1')
  igual(alertas[0].sistema.fecha_proximo_mantenimiento, VENCIDO)
  igual(alertas[0].dias_restantes, -10)

  const consulta = db.consultas[0]
  if (!consulta.filtros.some(([col, val]) => col === 'leido' && val === false))
    throw new Error('la consulta por defecto debe filtrar leido = false')
  igual(consulta.ordenes, [['fecha_alerta', { ascending: false }]])
})

await prueba('con incluirLeidas no filtra por leido', async () => {
  const db = dbFalsa(() => ({ data: [filaAlerta(1, PROXIMO, { leido: true })], error: null }))
  const alertas = await S.listarAlertas(db, true)
  igual(alertas.length, 1)
  igual(alertas[0].leido, true)
  afirma(!db.consultas[0].filtros.some(([col]) => col === 'leido'), 'no debe filtrar leido')
})

// ---------------------------------------------------------------------
// Generación (invocación de la RPC)
// ---------------------------------------------------------------------
await prueba('invoca fn_generar_alertas_preventivas con el umbral', async () => {
  const db = dbFalsa(() => ({
    data: { evaluadas: 3, creadas: 2, umbral_dias: 30, fecha_evaluacion: HOY },
    error: null,
  }))
  const r = await S.generarAlertasPreventivas(db, 30)
  igual(r, { evaluadas: 3, creadas: 2, umbral_dias: 30, fecha_evaluacion: HOY })
  igual(db.rpcs[0], { rpc: 'fn_generar_alertas_preventivas', args: { p_umbral_dias: 30 } })
})

await prueba('dos ejecuciones seguidas: la segunda no crea alertas', async () => {
  let llamadas = 0
  const db = dbFalsa(() => ({
    data: { evaluadas: 2, creadas: llamadas++ === 0 ? 2 : 0, umbral_dias: 30, fecha_evaluacion: HOY },
    error: null,
  }))
  igual((await S.generarAlertasPreventivas(db, 30)).creadas, 2)
  igual((await S.generarAlertasPreventivas(db, 30)).creadas, 0)
  igual(db.rpcs.length, 2)
})

await prueba('sin la migración aplicada: mensaje claro', async () => {
  const db = dbFalsa(() => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }))
  await rechaza(S.generarAlertasPreventivas(db, 30), 'migracion_cu19_alertas.sql')
})

// ---------------------------------------------------------------------
// Marcar como leída
// ---------------------------------------------------------------------
await prueba('id inválido: error de validación y sin consultas', async () => {
  const db = dbFalsa()
  await rechaza(S.marcarAlertaLeida(db, { alertaId: 0 }, 1), C.MSG_ALERTA_ID_INVALIDO)
  igual(db.consultas.length, 0)
})

await prueba('alerta inexistente: mensaje controlado', async () => {
  const db = dbFalsa(() => ({ data: null, error: null }))
  await rechaza(S.marcarAlertaLeida(db, { alertaId: 99 }, 1), C.MSG_ALERTA_NO_ENCONTRADA)
})

await prueba('ya leída: no reescribe ni audita de nuevo', async () => {
  const db = dbFalsa(() => ({ data: { id: 7, leido: true, mensaje: 'x' }, error: null }))
  const r = await S.marcarAlertaLeida(db, { alertaId: 7 }, 1, '190.181.25.10')
  igual(r, { id: 7, leido: true })
  igual(db.consultas.filter((c) => c.op === 'update').length, 0)
  igual(db.consultas.filter((c) => c.tabla === 'bitacora').length, 0)
})

await prueba('pendiente: actualiza con filtro leido=false y audita una vez', async () => {
  const db = dbFalsa((c) => {
    if (c.tabla === 'alerta_notificacion' && c.op === 'select')
      return { data: { id: 7, leido: false, mensaje: 'Mantenimiento preventivo programado para el 2026-11-20.' }, error: null }
    if (c.tabla === 'alerta_notificacion' && c.op === 'update')
      return { data: { id: 7, leido: true }, error: null }
    if (c.tabla === 'bitacora') return { data: { id: 1, ...c.payload }, error: null }
    return { data: null, error: null }
  })
  const r = await S.marcarAlertaLeida(db, { alertaId: 7 }, 1, '190.181.25.10')
  igual(r, { id: 7, leido: true })

  const update = db.consultas.find((c) => c.op === 'update')
  igual(update.payload, { leido: true })
  igual(update.filtros, [['id', 7], ['leido', false]])

  const bit = db.consultas.find((c) => c.tabla === 'bitacora')
  igual(bit.payload.accion, 'MARCAR_ALERTA_LEIDA')
  igual(bit.payload.usuario_id, 1)
  igual(bit.payload.ip, '190.181.25.10')
  afirma(bit.payload.descripcion.includes('alerta #7'), 'la bitácora debe identificar la alerta')
})

// ---------------------------------------------------------------------
// Server Actions: permisos
// ---------------------------------------------------------------------
await prueba('sin permiso ACTUALIZAR no se marca ninguna alerta', async () => {
  const db = dbFalsa()
  sesion(TECNICO, [], db)
  const r = await A.marcarAlertaLeidaAccion(7)
  igual(r.ok, false)
  afirma(r.error.includes('No autorizado'), r.error)
  igual(db.consultas.length, 0)
})

await prueba('sin permiso LEER no se listan alertas', async () => {
  const db = dbFalsa()
  sesion(TECNICO, [], db)
  const r = await A.listarAlertasAccion(true)
  igual(r.ok, false)
  afirma(r.error.includes('No autorizado'), r.error)
})

await prueba('con ACTUALIZAR marca y revalida /alertas y /', async () => {
  const db = dbFalsa((c) => {
    if (c.tabla === 'alerta_notificacion' && c.op === 'select')
      return { data: { id: 7, leido: false, mensaje: 'x' }, error: null }
    if (c.tabla === 'alerta_notificacion' && c.op === 'update')
      return { data: { id: 7, leido: true }, error: null }
    if (c.tabla === 'bitacora') return { data: { id: 1, ...c.payload }, error: null }
    return { data: null, error: null }
  })
  sesion(ADMIN, ['ALERTAS_PREVENTIVAS:LEER', 'ALERTAS_PREVENTIVAS:ACTUALIZAR'], db)
  const r = await A.marcarAlertaLeidaAccion(7)
  igual(r.ok, true)
  igual(globalThis.__cu16.revalidadas, ['/alertas', '/'])
})

// ---------------------------------------------------------------------
// Route Handler: CRON_SECRET
// ---------------------------------------------------------------------
const pedir = (autorizacion) =>
  new Request('http://localhost/api/cron/alertas', {
    headers: autorizacion ? { authorization: autorizacion } : {},
  })

await prueba('sin CRON_SECRET configurado: 401', async () => {
  const previo = process.env.CRON_SECRET
  delete process.env.CRON_SECRET
  const res = await R.GET(pedir('Bearer lo-que-sea'))
  igual(res.status, 401)
  if (previo === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = previo
})

await prueba('sin cabecera o con secreto incorrecto: 401', async () => {
  const previo = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'secreto-cu19'
  igual((await R.GET(pedir(null))).status, 401)
  igual((await R.GET(pedir('Bearer otro'))).status, 401)
  igual((await R.GET(pedir('secreto-cu19'))).status, 401)
  if (previo === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = previo
})

await prueba('con el secreto correcto ejecuta y devuelve el conteo', async () => {
  const previo = process.env.CRON_SECRET
  process.env.CRON_SECRET = 'secreto-cu19'
  let llamadas = 0
  const db = dbFalsa((c) =>
    c.rpc
      ? {
          data: {
            evaluadas: 2,
            creadas: llamadas++ === 0 ? 2 : 0,
            umbral_dias: 30,
            fecha_evaluacion: HOY,
          },
          error: null,
        }
      : { data: null, error: null },
  )
  sesion(ADMIN, [], db)

  const primera = await R.GET(pedir('Bearer secreto-cu19'))
  igual(primera.status, 200)
  const cuerpo1 = await primera.json()
  igual(cuerpo1.ok, true)
  igual(cuerpo1.creadas, 2)
  igual(db.rpcs[0].args.p_umbral_dias, 30)

  const segunda = await R.GET(pedir('Bearer secreto-cu19'))
  const cuerpo2 = await segunda.json()
  igual(segunda.status, 200)
  igual(cuerpo2.creadas, 0)
  igual(db.rpcs.length, 2)

  if (previo === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = previo
})

console.log(`\n${pasan} prueba(s) OK, ${fallan} fallo(s).`)
if (fallan > 0) process.exitCode = 1
