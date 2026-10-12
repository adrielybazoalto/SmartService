// ============================================================
// Pruebas de la lógica de la INTERFAZ de CU16 (FASE 5) — SIMULADAS.
//
// Node no ejecuta .tsx, así que aquí se prueba lo que decide QUÉ ve cada rol y
// CÓMO se muestran los números, con el mismo cargador y dobles que
// cu16-backend.prueba.mjs (sin Next.js, sin red, sin BD):
//   - src/app/inventario/acceso.ts   capacidades por rol (botones visibles)
//   - src/app/inventario/formato.ts  formato determinista de cifras y motivos
//   - Server Actions con los parámetros que arma la página (URL / kárdex)
// El renderizado de los componentes NO se prueba aquí (ver informe).
//
// Ejecutar desde la raíz:  node pruebas/inventario/cu16-frontend.prueba.mjs
// ============================================================
import './cargador-ts.mjs'

const ACC = await import('@/app/inventario/acceso')
const F = await import('@/app/inventario/formato')
const A = await import('@/app/actions/inventario')

let pasan = 0
let fallan = 0
async function prueba(nombre, fn) {
  const err = console.error
  const warn = console.warn
  console.error = () => {}
  console.warn = () => {}
  try {
    await fn()
    pasan++
    console.log(`PASA  | [SIM] ${nombre}`)
  } catch (e) {
    fallan++
    console.log(`FALLA | [SIM] ${nombre} | ${e.message}`)
  } finally {
    console.error = err
    console.warn = warn
  }
}
const afirmar = (c, d) => { if (!c) throw new Error(d) }
const json = JSON.stringify

const INV = 'Catálogo e Inventario'
const fila = (f, acc) => acc.map((a) => ({ funcion: { nombre: f }, accion: { nombre: a } }))
const MATRIZ = {
  1: [...fila(INV, ['LEER', 'CREAR', 'ACTUALIZAR', 'ELIMINAR', 'PROCESAR']), ...fila('Compras', ['LEER', 'CREAR'])],
  2: [...fila(INV, ['LEER']), ...fila('Compras', ['CREAR', 'LEER'])],
  3: fila('Órdenes de Trabajo', ['LEER']),
}
const RUTAS = { 1: ['INVENTARIO', 'COMPRAS'], 2: ['INVENTARIO', 'COMPRAS'], 3: ['PERFIL'] }
const ADMIN = { id: 1, rol_id: 1, nombre: 'Admin', estado: true }
const ENCARGADO = { id: 2, rol_id: 2, nombre: 'Encargada', estado: true }
const TECNICO = { id: 3, rol_id: 3, nombre: 'Técnico', estado: true }

function sesion(usuario, respuestas = {}) {
  const llamadas = []
  const responder = (reg) => {
    if (reg.tabla === 'rol_funcion') return { data: MATRIZ[reg.ops.find((o) => o[0] === 'eq')[2]] ?? [], error: null }
    const r = reg.rpc ? respuestas[`rpc:${reg.rpc}`] : respuestas[reg.tabla]
    if (r) return r
    throw new Error(`consulta no prevista: ${reg.tabla ?? reg.rpc}`)
  }
  const db = {
    llamadas,
    from(tabla) {
      const reg = { tabla, ops: [] }
      llamadas.push(reg)
      const proxy = new Proxy(function () {}, {
        get(_, prop) {
          if (prop === 'then') return (ok, ko) => Promise.resolve().then(() => responder(reg)).then(ok, ko)
          return (...args) => { reg.ops.push([prop, ...args]); return proxy }
        },
      })
      return proxy
    },
  }
  globalThis.__cu16 = { usuario, permisosRuta: RUTAS, db, cabeceras: {}, revalidadas: [] }
  return db
}

// ------------------------------------------------- capacidades (botones por rol)
await prueba('Administrador: ve crear, editar, desactivar, inventario inicial y ajustes', async () => {
  sesion(ADMIN)
  const c = await ACC.obtenerCapacidadesInventario()
  afirmar(json(c) === json({ crear: true, actualizar: true, eliminar: true, procesar: true }), json(c))
})
await prueba('Encargado: solo consulta (ningún botón de gestión)', async () => {
  sesion(ENCARGADO)
  const c = await ACC.obtenerCapacidadesInventario()
  afirmar(json(c) === json({ crear: false, actualizar: false, eliminar: false, procesar: false }), json(c))
})
await prueba('Encargado: el CREAR de Compras no muestra «Nuevo producto»', async () => {
  sesion(ENCARGADO)
  afirmar((await ACC.obtenerCapacidadesInventario()).crear === false, 'crear')
})
await prueba('Técnico y sin sesión: ninguna capacidad', async () => {
  sesion(TECNICO)
  const t = await ACC.obtenerCapacidadesInventario()
  sesion(null)
  const s = await ACC.obtenerCapacidadesInventario()
  afirmar(Object.values(t).every((v) => !v) && Object.values(s).every((v) => !v), json([t, s]))
})
await prueba('Aunque la interfaz mostrara el botón, el servidor rechaza al Encargado', async () => {
  const db = sesion(ENCARGADO)
  const r = await A.registrarAjusteAction({ producto_id: 1, stock_contado: 5, justificacion: 'conteo físico mensual' })
  afirmar(!r.ok && /No autorizado/.test(r.mensaje) && db.llamadas.every((l) => l.tabla === 'rol_funcion'), json(r))
})

// ------------------------------------------- parámetros que arma la página
await prueba('Kárdex con id no numérico en la URL → mensaje de validación, sin consultar la BD', async () => {
  const db = sesion(ENCARGADO)
  const r = await A.obtenerKardexAction({ producto_id: 'abc' })
  afirmar(!r.ok && /producto inválido/i.test(r.mensaje), json(r))
  afirmar(!db.llamadas.some((l) => l.tabla === 'producto'), 'no debía consultar productos')
})
await prueba('Filtros de la URL → obtenerCatalogoAction (categoría como texto, inactivos, críticos)', async () => {
  const fila = { id: 1, codigo: 'A1', nombre: 'A', descripcion_tecnica: null, unidad_medida: 'u', margen_ganancia: 0, precio_compra_actual: 0, stock_disponible: 0, stock_minimo: 1, estado: true, categoria_producto: null }
  const db = sesion(ENCARGADO, { producto: { data: [fila], error: null } })
  const r = await A.obtenerCatalogoAction({ texto: 'cam', categoria_id: '2', incluir_inactivos: true, solo_criticos: true })
  afirmar(r.ok && r.data.length === 1 && r.data[0].critico, json(r))
  const reg = db.llamadas.find((l) => l.tabla === 'producto')
  afirmar(reg.ops.some((o) => o[0] === 'eq' && o[1] === 'categoria_id' && o[2] === 2), 'categoría')
  afirmar(!reg.ops.some((o) => o[0] === 'eq' && o[1] === 'estado'), 'con inactivos no filtra estado')
})

// ----------------------------------------------------------------- formato
await prueba('Formato: miles con punto, decimales con coma, negativo y Bs', () => {
  afirmar(F.formatoNumero(1234567.5) === '1.234.567,50' && F.formatoNumero(-3) === '−3,00' && F.formatoBs(0) === 'Bs 0,00', 'números')
  afirmar(F.formatoCantidad(12) === '12' && F.formatoCantidad(2.5) === '2,50' && F.formatoCantidad(1000) === '1.000', 'cantidades')
})
await prueba('Formato: precio de venta referencial = costo × (1 + margen)', () => {
  afirmar(F.precioVentaReferencial(95, 30) === 123.5 && F.precioVentaReferencial(19.99, 15) === 22.99 && F.precioVentaReferencial(10, 0) === 10, 'precio venta')
})
await prueba('Formato: etiquetas de motivo e histórico sin motivo', () => {
  afirmar(F.etiquetaMovimiento('ENTRADA', 'COMPRA') === 'Compra' && F.etiquetaMovimiento('AJUSTE', 'AJUSTE_NEGATIVO') === 'Ajuste negativo', 'motivos')
  afirmar(F.etiquetaMovimiento('SALIDA', null) === 'Salida (histórico)', F.etiquetaMovimiento('SALIDA', null))
})

console.log(`\nTOTAL: ${pasan} pasan, ${fallan} fallan`)
process.exitCode = fallan ? 1 : 0
