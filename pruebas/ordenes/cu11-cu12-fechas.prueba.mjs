// ============================================================
// Pruebas del BACKEND de CU11 / CU12: fechas en hora de Bolivia, días de la
// jornada y orden de la lista de asignación.
//
// Ejecuta el código TypeScript REAL con Node.js y un cliente Supabase FALSO.
// No usa red, Supabase ni base de datos. El proceso se repite con TZ=UTC y con
// TZ=America/La_Paz: el resultado no debe depender de la zona del servidor.
//
// Ejecutar desde la raíz:  node pruebas/ordenes/cu11-cu12-fechas.prueba.mjs
// ============================================================
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import '../inventario/cargador-ts.mjs'

if (!process.env.PRUEBA_TZ) {
  let codigo = 0
  for (const tz of ['UTC', 'America/La_Paz']) {
    console.log(`\n=== TZ=${tz} ===`)
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      env: { ...process.env, TZ: tz, PRUEBA_TZ: tz },
      stdio: 'inherit',
    })
    if (r.status !== 0) codigo = 1
  }
  process.exit(codigo)
}

const F = await import('@/lib/fechas')
const { parseDiasSemana, motivosJornada, aMs, horasEntre } = await import('@/backend/asignaciones/disponibilidad')
const { ordenarPorPendientes } = await import('@/backend/asignaciones/service')
const { ControlOrdenesTrabajo } = await import('@/backend/ordenes/control-ordenes-trabajo')
const A = await import('@/app/actions/ordenes-trabajo')

let pasan = 0
let fallan = 0
async function prueba(nombre, fn) {
  try {
    await fn()
    pasan++
    console.log(`PASA  | ${nombre}`)
  } catch (e) {
    fallan++
    console.log(`FALLA | ${nombre} | ${e.message}`)
  }
}
function igual(real, esperado) {
  const [a, b] = [JSON.stringify(real), JSON.stringify(esperado)]
  if (a !== b) throw new Error(`esperado ${b}, recibido ${a}`)
}
async function falla(fn, patron) {
  try {
    await fn()
  } catch (e) {
    if (patron.test(e.message)) return
    throw new Error(`mensaje inesperado: ${e.message}`)
  }
  throw new Error('NO falló')
}

/** Cliente Supabase falso: guarda lo que se inserta o actualiza en orden_trabajo. */
function dbFalsa(orden = {}) {
  const escrito = {}
  const db = {
    from(tabla) {
      let fila = null
      const q = {
        select: () => q,
        eq: () => q,
        like: () => q,
        insert(x) { Object.assign(escrito, x); fila = x; return q },
        update(x) { Object.assign(escrito, x); fila = x; return q },
        single: async () => ({ data: tabla === 'cotizacion' ? { id: 1, estado: 'APROBADA' } : { id: 99, ...orden, ...fila } }),
        maybeSingle: async () => ({ data: null }),
        then: (ok) => ok({ data: [] }),
      }
      return q
    },
  }
  return { db, escrito }
}
const convertir = (db, ventana) => ControlOrdenesTrabajo.convertirCotizacionAOrdenBD(db, 1, undefined, null, ventana)

await prueba(`La zona del proceso es ${process.env.PRUEBA_TZ}`, () => {
  igual(Intl.DateTimeFormat().resolvedOptions().timeZone, process.env.PRUEBA_TZ)
})

// ---------- Ventana programada ----------
await prueba('Convertir con 15:10–15:15 guarda 15:10:00 y 15:15:00', async () => {
  const { db, escrito } = dbFalsa()
  await convertir(db, { fecha_programada: '2026-11-02', hora_inicio: '15:10', hora_fin: '15:15' })
  igual(escrito.fecha_inicio_programada, '2026-11-02 15:10:00')
  igual(escrito.fecha_fin_programada, '2026-11-02 15:15:00')
})
await prueba('Convertir sin ventana se rechaza (sin "mañana 08:00–12:00")', async () => {
  const { db, escrito } = dbFalsa()
  await falla(() => convertir(db, undefined), /ventana horaria es obligatoria/)
  await falla(() => convertir(db, { fecha_programada: '', hora_inicio: '', hora_fin: '' }), /ventana horaria es obligatoria/)
  igual(escrito, {})
})
await prueba('Fin igual o anterior al inicio se rechaza', async () => {
  const { db } = dbFalsa()
  await falla(() => convertir(db, { fecha_programada: '2026-11-02', hora_inicio: '15:10', hora_fin: '15:10' }), /posterior a la hora de inicio/)
})
await prueba('ventanaBolivia guarda el mismo texto que escribió el usuario', () => {
  igual(F.ventanaBolivia('2026-12-31', '23:00', '23:59'), { inicio: '2026-12-31 23:00:00', fin: '2026-12-31 23:59:00' })
})
await prueba('aTimestampBolivia rechaza formatos inválidos', async () => {
  await falla(() => F.aTimestampBolivia('02/11/2026', '15:10'), /inválida/)
  await falla(() => F.aTimestampBolivia('2026-11-02', '25:00'), /inválida/)
})

// ---------- Marcas reales ----------
const ahoraEsperado = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')
const casi = (a, b) => { if (Math.abs(aMs(a) - aMs(b)) > 5000) throw new Error(`${a} lejos de ${b}`) }

await prueba('ahoraBolivia es UTC-4 con formato YYYY-MM-DD HH:mm:ss', () => {
  const a = F.ahoraBolivia()
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(a)) throw new Error(a)
  casi(a, ahoraEsperado())
})
await prueba('Marcar inicio guarda hora de Bolivia', async () => {
  const { db, escrito } = dbFalsa({ codigo_orden: 'OT-1', fecha_inicio_real: null })
  await ControlOrdenesTrabajo.registrarMarcaTiempoInicio(db, 1)
  casi(escrito.fecha_inicio_real, ahoraEsperado())
  igual(escrito.estado, 'EN_PROGRESO')
})
await prueba('Marcar fin guarda hora de Bolivia y calcula las horas', async () => {
  const inicio = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 19)
  const { db, escrito } = dbFalsa({ codigo_orden: 'OT-1', estado: 'EN_PROGRESO', fecha_inicio_real: inicio, fecha_fin_real: null })
  await ControlOrdenesTrabajo.registrarMarcaTiempoFin(db, 1)
  casi(escrito.fecha_fin_real, ahoraEsperado())
  igual(escrito.observaciones_tecnico, '[HORAS_TECNICAS: 2.00h]')
})

// ---------- Mostrar ----------
await prueba('formatearFechaHora muestra el texto tal cual', () => {
  igual(F.formatearFechaHora('2026-11-02T15:10:00'), '2026-11-02 15:10')
  igual(F.formatearFechaHora('2026-11-02 15:10:00'), '2026-11-02 15:10')
  igual(F.formatearFechaHora(null), '—')
})

// ---------- Días de la jornada (OPCIONES_DIAS del CU10) ----------
await prueba('Lunes a Viernes', () => igual(parseDiasSemana('Lunes a Viernes'), [1, 2, 3, 4, 5]))
await prueba('Lunes a Sábado', () => igual(parseDiasSemana('Lunes a Sábado'), [1, 2, 3, 4, 5, 6]))
await prueba('Lunes a Domingo', () => igual(parseDiasSemana('Lunes a Domingo'), [1, 2, 3, 4, 5, 6, 7]))
await prueba('Fines de Semana', () => igual(parseDiasSemana('Fines de Semana'), [6, 7]))
await prueba('fin de semana (singular y minúsculas)', () => igual(parseDiasSemana('fin de semana'), [6, 7]))
await prueba('Técnico de Fines de Semana: disponible el sábado, no el lunes', () => {
  const j = [{ dia_semana: 'Fines de Semana', hora_inicio: '08:00:00', hora_fin: '18:00:00' }]
  igual(motivosJornada(j, aMs('2026-11-07 09:00:00'), aMs('2026-11-07 12:00:00')), [])
  igual(motivosJornada(j, aMs('2026-11-02 09:00:00'), aMs('2026-11-02 12:00:00')).length, 1)
})

// ---------- Lista de asignación ----------
await prueba('Primero sin cuadrilla (id desc), después con cuadrilla en el orden recibido', () => {
  const fila = (id, totalTecnicos) => ({ orden: { id }, totalTecnicos, liderNombre: null })
  const r = ordenarPorPendientes([fila(3, 2), fila(5, 0), fila(1, 1), fila(9, 0), fila(4, 0)])
  igual(r.map((x) => x.orden.id), [9, 5, 4, 3, 1])
})

// ---------- Acciones de la lista de órdenes ----------
/** Cliente falso de cancelación: el UPDATE solo afecta a filas en el estado indicado. */
function dbCancelar(estado) {
  const llamadas = { updates: [], bitacora: [] }
  const orden = { id: 7, codigo_orden: 'OT-7', estado: 'CANCELADA' }
  const db = {
    from(tabla) {
      const filtros = {}
      const q = {
        select: () => q,
        eq(c, v) { filtros[c] = v; return q },
        update(x) { llamadas.updates.push(x); return q },
        insert(x) { llamadas.bitacora.push(x); return q },
        single: async () => ({ data: orden, error: null }),
        maybeSingle: async () => ({ data: tabla === 'orden_trabajo' && filtros.estado === estado ? orden : null, error: null }),
        then: (ok) => ok({ data: null, error: null }),
      }
      return q
    },
  }
  return { db, llamadas }
}
const sesion = (db, rutasPermitidas) => {
  globalThis.__cu16 = { db, rutasPermitidas, usuario: { id: 2, rol: { nombre: 'ENCARGADO' } } }
}
const GESTION = ['/ordenes-trabajo', '/asignar-tecnicos']

await prueba('Cancelar: pasa a CANCELADA y deja bitácora', async () => {
  const { db, llamadas } = dbCancelar('PROGRAMADA')
  sesion(db, GESTION)
  igual((await A.cancelarOrdenAccion(7)).ok, true)
  igual(llamadas.updates, [{ estado: 'CANCELADA' }])
  igual(llamadas.bitacora[0].accion, 'CANCELAR_ORDEN_TRABAJO')
})
await prueba('Cancelar: se rechaza si la orden ya no está PROGRAMADA', async () => {
  const { db, llamadas } = dbCancelar('EN_PROGRESO')
  sesion(db, GESTION)
  igual(await A.cancelarOrdenAccion(7), { ok: false, error: 'Solo se pueden cancelar órdenes en estado Programada' })
  igual(llamadas.bitacora.length, 0)
})
await prueba('Cancelar: quien solo tiene el módulo de órdenes (Técnico) no puede', async () => {
  const { db, llamadas } = dbCancelar('PROGRAMADA')
  sesion(db, ['/ordenes-trabajo'])
  const r = await A.cancelarOrdenAccion(7)
  igual(r.ok, false)
  if (!/No autorizado/.test(r.error)) throw new Error(r.error)
  igual(llamadas.updates, [])
})
await prueba('Detalle: sin permiso del módulo se rechaza', async () => {
  const { db } = dbCancelar('PROGRAMADA')
  sesion(db, [])
  const r = await A.obtenerOrdenTrabajoDetalleAccion(7)
  igual(r.ok, false)
  if (!/No autorizado/.test(r.error)) throw new Error(r.error)
})
await prueba('horasEntre redondea como la liquidación', () => {
  igual(horasEntre('2026-11-01T15:28:52', '2026-11-01T15:30:29.427503'), 0.03)
  igual(horasEntre(null, '2026-11-01T15:30:29'), null)
})

console.log(`TOTAL: ${pasan} pasan, ${fallan} fallan`)
process.exit(fallan ? 1 : 0)
