// ============================================================
// Pruebas del BACKEND del anticipo con tarjeta (CU08).
//
// Ejecuta el código TypeScript REAL con Node.js, con una pasarela y un cliente
// Supabase FALSOS. No usa red, Stripe, Supabase ni base de datos. La función
// SQL se prueba aparte en pruebas/bd/cu08-anticipo.prueba.mjs.
//
// Ejecutar desde la raíz:  node pruebas/ordenes/cu08-anticipo-tarjeta.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'

const T = await import('@/backend/cotizaciones/anticipo-tarjeta')
const { bsACentavosUsd } = await import('@/backend/pagos/pasarela-pago')

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

const COT = { id: 7, numero_cotizacion: 'COT-7', estado: 'PENDIENTE', total: '1000.00', fecha_vencimiento: '2999-12-31' }

function dbFalsa(cot = COT, errorRpc = null) {
  const rpc = []
  return {
    rpc,
    db: {
      from: () => {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: cot, error: null }) }
        return q
      },
      rpc: async (nombre, args) => {
        rpc.push({ nombre, args })
        return { data: {}, error: errorRpc }
      },
    },
  }
}
function pasarelaFalsa(pago) {
  const sesiones = []
  return {
    sesiones,
    crearSesionPago: async (p) => {
      sesiones.push(p)
      return { sessionId: 'cs_test_1', url: 'https://stripe.test/pago', montoUsd: 1 }
    },
    verificarPago: async () => pago,
  }
}
const pagoOk = (montoBs = '500.00') => ({
  pagado: true,
  sessionId: 'cs_test_1',
  montoUsd: bsACentavosUsd(Number(montoBs)) / 100,
  metadata: { tipo: 'ANTICIPO_COTIZACION', cotizacion_id: '7', monto_bs: montoBs },
})
const iniciar = (db, pasarela, monto) =>
  T.iniciarAnticipoTarjeta(db, pasarela, { cotizacionId: 7, monto }, 'http://localhost:3000')
const confirmar = (db, pasarela) => T.confirmarAnticipoTarjeta(db, pasarela, { sessionId: 'cs_test_1', usuarioId: 2, ip: '10.0.0.1' })

await prueba('Iniciar: crea la sesión con metadata y URLs de retorno', async () => {
  const p = pasarelaFalsa()
  const r = await iniciar(dbFalsa().db, p, 500)
  igual(r, { url: 'https://stripe.test/pago' })
  igual(p.sesiones[0].metadata, { tipo: 'ANTICIPO_COTIZACION', cotizacion_id: '7', monto_bs: '500.00' })
  igual(p.sesiones[0].montoBs, 500)
  igual(p.sesiones[0].urlRetorno, 'http://localhost:3000/cotizaciones?anticipo=exito')
  igual(p.sesiones[0].urlCancelacion, 'http://localhost:3000/cotizaciones?anticipo=cancelado')
})
await prueba('Iniciar: sin migración NO llama a Stripe y muestra el mensaje claro', async () => {
  for (const code of ['PGRST202', '42883']) {
    const p = pasarelaFalsa()
    const d = dbFalsa(COT, { code, message: 'Could not find the function in the schema cache' })
    await falla(() => iniciar(d.db, p, 500), /^Falta aplicar la migración del anticipo en la base de datos$/)
    igual(p.sesiones.length, 0)
  }
})
await prueba('Iniciar: la comprobación no aprueba nada (sesión vacía, id 0)', async () => {
  const d = dbFalsa()
  await iniciar(d.db, pasarelaFalsa(), 500)
  igual(d.rpc.length, 1)
  igual([d.rpc[0].args.p_session_id, d.rpc[0].args.p_cotizacion_id], ['', 0])
})
await prueba('Iniciar: el rechazo normal de la función no se confunde con falta de migración', async () => {
  const p = pasarelaFalsa()
  await iniciar(dbFalsa(COT, { code: 'P0001', message: 'Falta el código del pago con tarjeta' }).db, p, 500)
  igual(p.sesiones.length, 1)
})
await prueba('Confirmar: sin migración indica la causa y conserva el id del pago', async () => {
  const d = dbFalsa(COT, { code: 'PGRST202', message: 'schema cache' })
  await falla(() => confirmar(d.db, pasarelaFalsa(pagoOk())), /^Falta aplicar la migración del anticipo en la base de datos\. El pago cs_test_1 se cobró/)
})
await prueba('Iniciar: rechaza una cotización que no está PENDIENTE', async () => {
  const p = pasarelaFalsa()
  await falla(() => iniciar(dbFalsa({ ...COT, estado: 'APROBADA' }).db, p, 500), /estado PENDIENTE/)
  igual(p.sesiones.length, 0)
})
await prueba('Iniciar: rechaza una cotización vencida', async () => {
  await falla(() => iniciar(dbFalsa({ ...COT, fecha_vencimiento: '2020-03-09' }).db, pasarelaFalsa(), 500), /La cotización venció el 09\/03\/2020/)
})
await prueba('Iniciar: rechaza montos fuera de rango', async () => {
  await falla(() => iniciar(dbFalsa().db, pasarelaFalsa(), 0), /mayor a 0/)
  await falla(() => iniciar(dbFalsa().db, pasarelaFalsa(), 1000.01), /no superar el total/)
  await falla(() => iniciar(dbFalsa().db, pasarelaFalsa(), 10.123), /2 decimales/)
})
await prueba('Confirmar: aprueba con el monto de Stripe y el usuario de la sesión', async () => {
  const d = dbFalsa()
  await confirmar(d.db, pasarelaFalsa(pagoOk()))
  igual(d.rpc, [{
    nombre: 'fn_aprobar_cotizacion_tarjeta',
    args: { p_usuario_id: 2, p_cotizacion_id: 7, p_session_id: 'cs_test_1', p_monto_pagado: 500, p_ip: '10.0.0.1' },
  }])
})
await prueba('Confirmar: el 100 % no sufre redondeo al pasar por USD', async () => {
  const d = dbFalsa()
  await confirmar(d.db, pasarelaFalsa(pagoOk('1000.00')))
  igual(d.rpc[0].args.p_monto_pagado, 1000)
})
await prueba('Confirmar: pago no aprobado no toca la cotización', async () => {
  const d = dbFalsa()
  await falla(() => confirmar(d.db, pasarelaFalsa({ ...pagoOk(), pagado: false })), /no fue confirmado. La cotización sigue pendiente/)
  igual(d.rpc, [])
})
await prueba('Confirmar: rechaza un pago de otro tipo (CU09 o CU13)', async () => {
  const d = dbFalsa()
  await falla(() => confirmar(d.db, pasarelaFalsa({ ...pagoOk(), metadata: { tipo: 'VENTA' } })), /no corresponde a un anticipo/)
  igual(d.rpc, [])
})
await prueba('Confirmar: rechaza si lo cobrado no coincide con monto_bs', async () => {
  const d = dbFalsa()
  await falla(() => confirmar(d.db, pasarelaFalsa({ ...pagoOk(), montoUsd: 1 })), /no coincide/)
  igual(d.rpc, [])
})
await prueba('Confirmar: si la base rechaza, el mensaje identifica el pago cobrado', async () => {
  const d = dbFalsa(COT, { message: 'Solo se pueden aprobar cotizaciones en estado PENDIENTE' })
  await falla(() => confirmar(d.db, pasarelaFalsa(pagoOk())), /estado PENDIENTE\. El pago cs_test_1 se cobró/)
})

console.log(`TOTAL: ${pasan} pasan, ${fallan} fallan`)
process.exit(fallan ? 1 : 0)
