// ============================================================
// Pruebas de la lógica de la INTERFAZ de CU15 (FASE 6) — SIMULADAS.
//
// Node no ejecuta .tsx, así que aquí se prueba lo que decide QUÉ ve cada rol,
// QUÉ se envía al servidor y CÓMO se calculan y muestran los importes, con el
// mismo cargador y dobles que las pruebas de backend (sin Next.js, sin red,
// sin BD ni Supabase):
//   - src/app/compras/logica.ts   validación, cálculos, filtros, candado de envío
//   - src/app/compras/acceso.ts   capacidades por rol (botones visibles)
//   - Server Actions de CU15 con la entrada que arma el formulario
// El renderizado de los componentes NO se prueba aquí (ver informe).
//
// Ejecutar desde la raíz:  node pruebas/compras/cu15-frontend.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'

const L = await import('@/app/compras/logica')
const ACC = await import('@/app/compras/acceso')
const A = await import('@/app/actions/compras')
const F = await import('@/app/inventario/formato')
const R = await import('@/backend/compras/reglas')

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
const ok = (data) => ({ data, error: null })
const falla = (error) => ({ data: null, error })

// ------------------------------------------------------ sesión y BD falsas
const INV = 'Catálogo e Inventario'
const fila = (f, acc) => acc.map((a) => ({ funcion: { nombre: f }, accion: { nombre: a } }))
/** Igual a la matriz de migracion_cu16_inventario.sql + migracion_cu15_compras.sql. */
const MATRIZ = {
  1: [...fila(INV, ['LEER', 'CREAR', 'ACTUALIZAR', 'ELIMINAR', 'PROCESAR']), ...fila('Compras', ['LEER', 'CREAR', 'ACTUALIZAR', 'ELIMINAR', 'PROCESAR'])],
  2: [...fila(INV, ['LEER']), ...fila('Compras', ['CREAR', 'LEER'])],
  3: fila('Órdenes de Trabajo', ['LEER']),
}
const RUTAS = { 1: ['USUARIOS', 'INVENTARIO', 'COMPRAS'], 2: ['PERFIL', 'INVENTARIO', 'COMPRAS'], 3: ['PERFIL'] }
const ADMIN = { id: 1, rol_id: 1, nombre: 'Admin', estado: true }
const ENCARGADO = { id: 2, rol_id: 2, nombre: 'Encargada', estado: true }
const TECNICO = { id: 3, rol_id: 3, nombre: 'Técnico', estado: true }

function sesion(usuario, respuestas = {}) {
  const llamadas = []
  const responder = async (reg) => {
    if (reg.tabla === 'rol_funcion') return ok(MATRIZ[reg.ops.find((o) => o[0] === 'eq')[2]] ?? [])
    const r = reg.rpc ? respuestas[`rpc:${reg.rpc}`] : respuestas[reg.tabla]
    if (typeof r === 'function') return r(reg)
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
          if (prop === 'then') return (res, rej) => Promise.resolve().then(() => responder(reg)).then(res, rej)
          return (...args) => { reg.ops.push([prop, ...args]); return proxy }
        },
      })
      return proxy
    },
    async rpc(fn, args) {
      const reg = { rpc: fn, args }
      llamadas.push(reg)
      // Simula la latencia de la BD: deja pasar un segundo clic "simultáneo"
      await new Promise((r) => setTimeout(r, 5))
      return responder(reg)
    },
  }
  globalThis.__cu16 = { usuario, permisosRuta: RUTAS, db, cabeceras: {}, revalidadas: [] }
  return db
}
const soloPermisos = (db) => db.llamadas.every((l) => l.tabla === 'rol_funcion')

// ------------------------------------------------------------- datos base
const HOY = R.fechaHoyNegocio()
const PRODUCTOS = [
  { id: 1, codigo: 'CAM-01', nombre: 'Cámara IP domo', unidadMedida: 'unidad', categoria: 'CCTV', precioCompraActual: 95.1, stockDisponible: 20, precioPactado: 90 },
  { id: 2, codigo: 'UTP-1', nombre: 'Cable UTP Cat6', unidadMedida: 'metro', categoria: 'Cableado', precioCompraActual: 2.5, stockDisponible: 800, precioPactado: null },
  { id: 3, codigo: null, nombre: 'Sensor de movimiento', unidadMedida: 'unidad', categoria: null, precioCompraActual: 0, stockDisponible: 0, precioPactado: null },
]
const valores = (cambios = {}) => ({
  proveedorId: '1',
  fechaCompra: HOY,
  tipoDocumento: 'FACTURA',
  nroDocumento: '001-2345',
  observacion: 'Reposición mensual',
  lineas: [
    { productoId: 1, cantidad: '3', costoUnitario: '95,10' },
    { productoId: 2, cantidad: '100', costoUnitario: '2.5' },
  ],
  ...cambios,
})
const RESPUESTA_FN = {
  compra_id: 12, proveedor_id: 1, proveedor: 'Distribuidora A', tipo_documento: 'FACTURA', nro_documento: '001-2345',
  fecha_compra: HOY, fecha_registro: `${HOY}T10:00:00-04:00`, usuario_id: 2, total: 535.3,
  lineas: [
    { producto_id: 1, producto: 'Cámara IP domo', cantidad: 3, costo_unitario: 95.1, subtotal: 285.3, stock_anterior: 20, stock_resultante: 23, movimiento_id: 40 },
    { producto_id: 2, producto: 'Cable UTP Cat6', cantidad: 100, costo_unitario: 2.5, subtotal: 250, stock_anterior: 800, stock_resultante: 900, movimiento_id: 41 },
  ],
}
const LECTURAS_COMPROBANTE = {
  compra: ok({
    id: 12, tipo_documento: 'FACTURA', nro_documento: '001-2345', fecha_compra: HOY, fecha_registro: `${HOY}T10:00:00-04:00`,
    total: '535.30', observacion: 'Reposición mensual', proveedor_id: 1, usuario_id: 2,
    proveedor: { razon_social: 'Distribuidora A', nit: '1001' }, usuario: { nombre: 'Encargada' },
  }),
  detalle_compra: ok([
    { producto_id: 1, cantidad: '3.00', costo_unitario: '95.10', subtotal: '285.30', producto: { codigo: 'CAM-01', nombre: 'Cámara IP domo', unidad_medida: 'unidad' } },
    { producto_id: 2, cantidad: '100.00', costo_unitario: '2.50', subtotal: '250.00', producto: { codigo: 'UTP-1', nombre: 'Cable UTP Cat6', unidad_medida: 'metro' } },
  ]),
  movimiento_kardex: ok([
    { id: 40, producto_id: 1, stock_anterior: '20.00', stock_resultante: '23.00' },
    { id: 41, producto_id: 2, stock_anterior: '800.00', stock_resultante: '900.00' },
  ]),
}

// ===================================================== 1. Validación del formulario
await prueba('Formulario vacío: proveedor, tipo, número y productos obligatorios con mensajes claros', () => {
  const r = L.validarCompra(valores({ proveedorId: '', tipoDocumento: '', nroDocumento: '  ', lineas: [] }))
  afirmar(!r.ok, 'debía fallar')
  afirmar(r.errores.proveedor_id === 'Seleccione un proveedor', r.errores.proveedor_id)
  afirmar(/factura o nota/i.test(r.errores.tipo_documento), r.errores.tipo_documento)
  afirmar(/obligatorio/i.test(r.errores.nro_documento), r.errores.nro_documento)
  afirmar(r.errores.items === 'Agregue al menos un producto a la compra', r.errores.items)
})
await prueba('Compra válida: la entrada solo lleva campos del esquema (sin usuario, total ni stock)', () => {
  const r = L.validarCompra(valores())
  afirmar(r.ok, json(r))
  afirmar(json(Object.keys(r.entrada).sort()) === json(['fecha_compra', 'items', 'nro_documento', 'observacion', 'proveedor_id', 'tipo_documento']), json(Object.keys(r.entrada)))
  afirmar(json(r.entrada.items[0]) === json({ producto_id: 1, cantidad: '3', costo_unitario: '95.10' }), 'coma decimal → punto')
})
await prueba('Línea: cantidad 0, costo vacío y costo con 3 decimales → error en la línea correcta', () => {
  const r = L.validarCompra(valores({ lineas: [
    { productoId: 1, cantidad: '0', costoUnitario: '' },
    { productoId: 2, cantidad: '5', costoUnitario: '1.234' },
  ] }))
  afirmar(!r.ok, 'debía fallar')
  afirmar(/mayor a 0/.test(r.errores['items.0.cantidad']), json(r.errores))
  afirmar(/obligatorio/.test(r.errores['items.0.costo_unitario']), json(r.errores))
  afirmar(/2 decimales/.test(r.errores['items.1.costo_unitario']), json(r.errores))
})
await prueba('Fecha futura, fecha inexistente y número de documento con caracteres no permitidos', () => {
  const r1 = L.validarCompra(valores({ fechaCompra: '2999-01-01' }))
  afirmar(!r1.ok && /futura/.test(r1.errores.fecha_compra), json(r1))
  const r2 = L.validarCompra(valores({ fechaCompra: '2026-02-30' }))
  afirmar(!r2.ok && /no es válida/.test(r2.errores.fecha_compra), json(r2))
  const r3 = L.validarCompra(valores({ nroDocumento: '001#2345' }))
  afirmar(!r3.ok && /no válido/.test(r3.errores.nro_documento), json(r3))
})
await prueba('Producto repetido y observación de más de 1000 caracteres', () => {
  const r = L.validarCompra(valores({
    observacion: 'x'.repeat(1001),
    lineas: [{ productoId: 1, cantidad: '1', costoUnitario: '1' }, { productoId: 1, cantidad: '2', costoUnitario: '1' }],
  }))
  afirmar(!r.ok && /repetidos/.test(r.errores.items) && /1000/.test(r.errores.observacion), json(r))
})
await prueba('Observación vacía o con espacios → null', () => {
  afirmar(L.construirEntradaCompra(valores({ observacion: '   ' })).observacion === null, 'observación')
})

// ===================================================== 2. Cálculos e importes
await prueba('Subtotal por línea y total con las reglas del backend (redondeo en centavos)', () => {
  const r = L.resumenFormulario([
    { productoId: 1, cantidad: '3', costoUnitario: '95,10' },
    { productoId: 2, cantidad: '2.5', costoUnitario: '10.01' },
    { productoId: 3, cantidad: '1', costoUnitario: '0.1' },
    { productoId: 4, cantidad: '1', costoUnitario: '0.2' },
  ])
  afirmar(json(r.subtotales) === json([285.3, 25.03, 0.1, 0.2]), json(r.subtotales))
  afirmar(r.total === 310.63 && r.completas === 4, json(r))
})
await prueba('Líneas incompletas no suman al total y muestran subtotal vacío', () => {
  const r = L.resumenFormulario([
    { productoId: 1, cantidad: '', costoUnitario: '10' },
    { productoId: 2, cantidad: '2', costoUnitario: 'abc' },
    { productoId: 3, cantidad: '2', costoUnitario: '7.5' },
  ])
  afirmar(json(r.subtotales) === json([null, null, 15]) && r.total === 15 && r.completas === 1, json(r))
})
await prueba('El total del formulario coincide con el que valida el servidor (calcularResumenCompraAction)', async () => {
  sesion(ENCARGADO)
  const v = valores()
  const local = L.resumenFormulario(v.lineas).total
  const r = await A.calcularResumenCompraAction({ items: L.construirEntradaCompra(v).items })
  afirmar(r.ok && r.data.total === local && local === 535.3, json([r, local]))
})
await prueba('Formato de importes en Bs y fechas deterministas (sin zona horaria)', () => {
  afirmar(F.formatoBs(535.3) === 'Bs 535,30' && F.formatoBs(1234567.5) === 'Bs 1.234.567,50' && F.formatoBs(0) === 'Bs 0,00', 'Bs')
  afirmar(L.formatoFechaCompra('2026-10-05') === '05/10/2026' && L.formatoFechaCompra('raro') === 'raro', 'fecha')
  afirmar(L.sumaImportes([0.1, 0.2, 535.3]) === 535.6, String(L.sumaImportes([0.1, 0.2, 535.3])))
  afirmar(L.etiquetaTipoDocumento('FACTURA') === 'Factura' && L.etiquetaTipoDocumento('NOTA') === 'Nota', 'tipo')
})
await prueba('Costo sugerido: precio pactado → último costo → vacío', () => {
  afirmar(L.costoSugerido(PRODUCTOS[0]) === '90.00' && L.costoSugerido(PRODUCTOS[1]) === '2.50' && L.costoSugerido(PRODUCTOS[2]) === '', 'sugerido')
})
await prueba('Lectura de importes escritos: coma, punto, negativos y más de 2 decimales', () => {
  afirmar(L.leerImporte('12,5') === 12.5 && L.leerImporte(' 7 ') === 7, 'válidos')
  afirmar([L.leerImporte('0'), L.leerImporte('-3'), L.leerImporte('1.234'), L.leerImporte('1e3'), L.leerImporte('')].every((x) => x === null), 'inválidos')
})
await prueba('Búsqueda de productos sin tildes, por código y con máximo de resultados', () => {
  afirmar(json(L.filtrarProductos(PRODUCTOS, 'camara').map((p) => p.id)) === json([1]), 'tilde')
  afirmar(json(L.filtrarProductos(PRODUCTOS, 'utp').map((p) => p.id)) === json([2]), 'código')
  afirmar(L.filtrarProductos(PRODUCTOS, 'zzz').length === 0 && L.filtrarProductos(PRODUCTOS, '', 2).length === 2, 'vacío / máximo')
})

// ========================================================= 3. Permisos por rol
await prueba('Administrador: registrar compras y ver kárdex', async () => {
  sesion(ADMIN)
  const c = await ACC.obtenerCapacidadesCompras()
  afirmar(json(c) === json({ registrar: true, verKardex: true }), json(c))
})
await prueba('Encargado: registrar compras y ver kárdex (según la matriz de permisos)', async () => {
  sesion(ENCARGADO)
  const c = await ACC.obtenerCapacidadesCompras()
  afirmar(json(c) === json({ registrar: true, verKardex: true }), json(c))
})
await prueba('Técnico y sin sesión: ninguna capacidad', async () => {
  sesion(TECNICO)
  const t = await ACC.obtenerCapacidadesCompras()
  sesion(null)
  const s = await ACC.obtenerCapacidadesCompras()
  afirmar(!t.registrar && !t.verKardex && !s.registrar && !s.verKardex, json([t, s]))
})
await prueba('Técnico: el servidor rechaza listar, consultar y registrar sin tocar compras', async () => {
  const db = sesion(TECNICO)
  const rs = [
    await A.listarComprasAction(),
    await A.obtenerComprobanteIngresoAction({ compra_id: 1 }),
    await A.registrarCompraAction(L.construirEntradaCompra(valores())),
  ]
  afirmar(rs.every((r) => !r.ok && /No autorizado/.test(r.mensaje)), json(rs))
  afirmar(soloPermisos(db), json(db.llamadas.map((l) => l.tabla ?? l.rpc)))
})
await prueba('El responsable sale de la sesión: un usuario_id enviado por el navegador se rechaza', async () => {
  const db = sesion(ENCARGADO, { 'rpc:fn_registrar_compra': ok(RESPUESTA_FN), ...LECTURAS_COMPROBANTE })
  const manipulada = { ...L.construirEntradaCompra(valores()), usuario_id: 1, total: 1 }
  const r = await A.registrarCompraAction(manipulada)
  afirmar(!r.ok && !db.llamadas.some((l) => l.rpc), json(r))
  const r2 = await A.registrarCompraAction(L.construirEntradaCompra(valores()))
  const rpc = db.llamadas.find((l) => l.rpc)
  afirmar(r2.ok && rpc.args.p_usuario_id === ENCARGADO.id, json(rpc?.args))
})

// ============================================== 4. Envíos duplicados y documento
await prueba('Candado: un segundo envío se ignora; tras un error se permite reintentar', () => {
  const c = L.crearCandadoEnvio()
  afirmar(c.tomar() === true && c.tomar() === false && c.ocupado, 'segundo clic')
  c.liberar()
  afirmar(c.tomar() === true, 'reintento tras error')
  c.finalizar()
  afirmar(c.tomar() === false && c.finalizado, 'compra ya registrada')
})
await prueba('Doble clic en «Confirmar y registrar»: una sola llamada a fn_registrar_compra', async () => {
  const db = sesion(ENCARGADO, { 'rpc:fn_registrar_compra': ok(RESPUESTA_FN), ...LECTURAS_COMPROBANTE })
  const candado = L.crearCandadoEnvio()
  const entrada = L.construirEntradaCompra(valores())
  // Mismo flujo que confirmarRegistro() del formulario
  const enviar = () => {
    if (!candado.tomar()) return Promise.resolve(null)
    return A.registrarCompraAction(entrada).then((r) => {
      if (r.ok) candado.finalizar()
      else candado.liberar()
      return r
    })
  }
  const [r1, r2] = await Promise.all([enviar(), enviar()])
  const r3 = await enviar()
  afirmar(r1?.ok && r1.data.compraId === 12 && r2 === null && r3 === null, json([r1, r2, r3]))
  afirmar(db.llamadas.filter((l) => l.rpc).length === 1, 'una sola llamada')
})
await prueba('Aviso de duplicado: solo se verifica con datos completos y con la misma normalización de la BD', () => {
  afirmar(L.documentoAVerificar({ proveedorId: '', tipoDocumento: 'FACTURA', nroDocumento: '1' }) === null, 'sin proveedor')
  afirmar(L.documentoAVerificar({ proveedorId: '1', tipoDocumento: '', nroDocumento: '1' }) === null, 'sin tipo')
  const a = L.documentoAVerificar({ proveedorId: '1', tipoDocumento: 'FACTURA', nroDocumento: ' 001-23 45 ' })
  const b = L.documentoAVerificar({ proveedorId: 1, tipoDocumento: 'FACTURA', nroDocumento: '0012345' })
  afirmar(a && b && a.clave === b.clave && a.clave === '1|FACTURA|0012345', json([a, b]))
})
await prueba('verificarDocumentoCompraAction: documento existente → no disponible con la compra que lo usa', async () => {
  sesion(ENCARGADO, { compra: ok({ id: 7 }) })
  const r = await A.verificarDocumentoCompraAction(L.documentoAVerificar(valores()).entrada)
  afirmar(r.ok && r.data.disponible === false && r.data.compraId === 7, json(r))
})
await prueba('Documento duplicado detectado por la BD al registrar → mensaje que el formulario reconoce', async () => {
  sesion(ENCARGADO, { 'rpc:fn_registrar_compra': falla({ code: '23505', message: 'Documento ya registrado: FACTURA 001-2345 del proveedor «Distribuidora A»' }) })
  const r = await A.registrarCompraAction(L.construirEntradaCompra(valores()))
  afirmar(!r.ok && /documento ya registrado/i.test(r.mensaje), json(r))
})

// ===================================================== 5. Navegación y errores
await prueba('Filtros de la URL: valores mal formados se descartan; tipo en minúsculas se normaliza', () => {
  const { valores: v, filtros } = L.leerFiltrosCompras({ proveedor: 'abc', tipo: 'factura', nro: ['A-1', 'B'], desde: '2026-02-30', hasta: '2026-10-01' })
  afirmar(json(v) === json({ proveedor: '', tipo: 'FACTURA', nro: 'A-1', desde: '', hasta: '2026-10-01' }), json(v))
  afirmar(json(filtros) === json({ limite: L.LIMITE_LISTADO, tipo_documento: 'FACTURA', nro_documento: 'A-1', hasta: '2026-10-01' }), json(filtros))
  afirmar(L.queryFiltrosCompras(v) === 'tipo=FACTURA&nro=A-1&hasta=2026-10-01' && L.hayFiltrosCompras(v), L.queryFiltrosCompras(v))
  afirmar(!L.hayFiltrosCompras(L.leerFiltrosCompras({}).valores), 'sin filtros')
})
await prueba('Listado con filtros de la URL → consulta con proveedor, documento y rango de fechas', async () => {
  const db = sesion(ENCARGADO, { compra: ok([]) })
  const { filtros } = L.leerFiltrosCompras({ proveedor: '3', tipo: 'NOTA', nro: '00-12', desde: '2026-01-01', hasta: '2026-06-30' })
  const r = await A.listarComprasAction(filtros)
  const reg = db.llamadas.find((l) => l.tabla === 'compra')
  const eq = (c) => reg.ops.find((o) => o[0] === 'eq' && o[1] === c)?.[2]
  afirmar(r.ok && r.data.length === 0, json(r))
  afirmar(eq('proveedor_id') === 3 && eq('tipo_documento') === 'NOTA', 'eq')
  afirmar(reg.ops.some((o) => o[0] === 'gte' && o[2] === '2026-01-01') && reg.ops.some((o) => o[0] === 'lte' && o[2] === '2026-06-30'), 'fechas')
  afirmar(reg.ops.some((o) => o[0] === 'ilike' && o[2] === '%0012%'), 'número normalizado')
})
await prueba('Rango de fechas invertido → mensaje de validación sin consultar compras', async () => {
  const db = sesion(ENCARGADO)
  const r = await A.listarComprasAction({ desde: '2026-06-01', hasta: '2026-01-01', limite: 10 })
  afirmar(!r.ok && /posterior/.test(r.mensaje) && soloPermisos(db), json(r))
})
await prueba('Detalle: id no numérico → validación sin consultar la BD; compra inexistente → mensaje', async () => {
  const db = sesion(ENCARGADO)
  const r1 = await A.obtenerComprobanteIngresoAction({ compra_id: 'abc' })
  afirmar(!r1.ok && soloPermisos(db), json(r1))
  sesion(ENCARGADO, { compra: ok(null), detalle_compra: ok([]), movimiento_kardex: ok([]) })
  const r2 = await A.obtenerComprobanteIngresoAction({ compra_id: '999' })
  afirmar(!r2.ok && r2.mensaje === 'La compra no existe', json(r2))
})
await prueba('Detalle: comprobante con líneas, costos, subtotales e ingreso a almacén', async () => {
  sesion(ENCARGADO, LECTURAS_COMPROBANTE)
  const r = await A.obtenerComprobanteIngresoAction({ compra_id: '12' })
  afirmar(r.ok && r.data.total === 535.3 && r.data.proveedor.nit === '1001' && r.data.responsable.nombre === 'Encargada', json(r))
  const l = r.data.lineas[0]
  afirmar(l.subtotal === 285.3 && l.movimientoId === 40 && l.stockAnterior === 20 && l.stockResultante === 23, json(l))
  afirmar(L.sumaImportes(r.data.lineas.map((x) => x.subtotal)) === r.data.total, 'suma de subtotales = total')
})
await prueba('Error interno de la BD → mensaje genérico, sin detalles internos', async () => {
  sesion(ENCARGADO, { compra: falla({ code: 'XX000', message: 'connection reset by peer at 10.0.0.3' }) })
  const r = await A.listarComprasAction()
  afirmar(!r.ok && !/10\.0\.0\.3|connection/.test(r.mensaje) && /Intente nuevamente/.test(r.mensaje), json(r))
})
await prueba('Registro exitoso revalida /compras y /inventario (stock y kárdex cambiaron)', async () => {
  sesion(ENCARGADO, { 'rpc:fn_registrar_compra': ok(RESPUESTA_FN), ...LECTURAS_COMPROBANTE })
  const r = await A.registrarCompraAction(L.construirEntradaCompra(valores()))
  const rev = globalThis.__cu16.revalidadas
  afirmar(r.ok && rev.includes('/compras') && rev.includes('/inventario'), json(rev))
})

console.log(`\nTOTAL: ${pasan} pasan, ${fallan} fallan`)
process.exitCode = fallan ? 1 : 0
