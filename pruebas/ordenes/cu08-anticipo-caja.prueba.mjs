// ============================================================
// Pruebas del BACKEND: el anticipo de la cotización (CU08) queda en caja.
//
// Ejecuta el código TypeScript REAL con Node.js y un cliente Supabase FALSO.
// No usa red ni base de datos. La parte SQL (fn_aprobar_cotizacion con el
// recibo RECIBO_ANTICIPO) se prueba en pruebas/bd/cu08-anticipo-caja.prueba.sql.
//
// Ejecutar desde la raíz:  node pruebas/ordenes/cu08-anticipo-caja.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'

const C = await import('@/backend/cotizaciones/anticipo-caja')
const { resumirCaja } = await import('@/backend/ventas/service')

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

/** Cliente falso: from('caja').select().eq().eq().order().limit().maybeSingle() */
function dbFalsa(fila, error = null) {
  const filtros = []
  const q = {
    select: () => q,
    eq: (c, v) => (filtros.push([c, v]), q),
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: fila, error }),
  }
  return { filtros, from: (t) => (t === 'caja' ? q : null) }
}

// ---------- mensajeAprobacion ----------
await prueba('Mensaje: sin anticipo', () => {
  igual(C.mensajeAprobacion({ anticipo_monto: 0 }), 'Cotización aprobada sin anticipo.')
})
await prueba('Mensaje: con recibo indica el número y el turno de caja', () => {
  igual(
    C.mensajeAprobacion({ anticipo_monto: '500.00', recibo_nro: 'RC-2026-00012', recibo_caja_id: 7 }),
    'Cotización aprobada. Anticipo de Bs. 500.00 registrado en caja (turno #7) con el recibo RC-2026-00012.',
  )
})
await prueba('Mensaje: tarjeta sin caja avisa que no hubo recibo', () => {
  const m = C.mensajeAprobacion({ anticipo_monto: 250, anticipo_metodo: 'TARJETA', recibo_nro: null })
  if (!m.includes('no había turno de caja abierto')) throw new Error(m)
})
await prueba('Mensaje: respuesta vacía no rompe', () => {
  igual(C.mensajeAprobacion(null), 'Cotización aprobada sin anticipo.')
})

// ---------- consultarCajaAbierta ----------
await prueba('Caja: abierta devuelve su id y filtra por usuario y estado', async () => {
  const db = dbFalsa({ id: 9 })
  igual(await C.consultarCajaAbierta(db, 2), { abierta: true, cajaId: 9 })
  igual(db.filtros, [['usuario_id', 2], ['estado', 'ABIERTA']])
})
await prueba('Caja: sin turno abierto', async () => {
  igual(await C.consultarCajaAbierta(dbFalsa(null), 2), { abierta: false, cajaId: null })
})
await prueba('Caja: error de base se informa', async () => {
  try {
    await C.consultarCajaAbierta(dbFalsa(null, { message: 'caída' }), 2)
  } catch (e) {
    if (/No se pudo verificar la caja: caída/.test(e.message)) return
    throw e
  }
  throw new Error('NO falló')
})

// ---------- resumirCaja (arqueo) ----------
const caja = { id: 1, usuario_id: 2, monto_inicial: 100, estado: 'ABIERTA' }
const v = (id, tipo, pago, total, estado = 'EMITIDA') => ({
  id, tipo_comprobante: tipo, tipo_pago: pago, total, estado, items: 0,
})
await prueba('Arqueo: el anticipo en efectivo entra al efectivo esperado', () => {
  const r = resumirCaja(caja, [
    v(1, 'NOTA_VENTA', 'EFECTIVO', 50),
    v(2, 'RECIBO_ANTICIPO', 'EFECTIVO', 500),
    v(3, 'RECIBO_ABONO', 'QR', 80),
    v(4, 'RECIBO_ANTICIPO', 'TARJETA', 200),
  ])
  igual(r.efectivo_esperado, 650)
  igual(r.anticipos_cotizaciones, 700)
  igual(r.cobros_ordenes, 80)
  igual(r.total_electronico, 280)
})
await prueba('Arqueo: un recibo anulado no suma', () => {
  const r = resumirCaja(caja, [v(1, 'RECIBO_ANTICIPO', 'EFECTIVO', 500, 'ANULADA')])
  igual([r.efectivo_esperado, r.anticipos_cotizaciones, r.cantidad_anuladas], [100, 0, 1])
})

console.log(`TOTAL: ${pasan} pasan, ${fallan} fallan`)
process.exit(fallan ? 1 : 0)
