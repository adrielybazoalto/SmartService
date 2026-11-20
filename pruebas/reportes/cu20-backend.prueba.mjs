// ============================================================
// Pruebas del BACKEND del CU20 (Reportes de Gestión).
//
// Ejecuta el TypeScript REAL (reglas, ServicioReportes, datos y
// Server Actions) con Node.js y un cliente Supabase FALSO. Sin red ni BD.
// Las funciones SQL fn_reporte_* se prueban aparte en Supabase/Postgres.
//
// Ejecutar desde la raíz:  node pruebas/reportes/cu20-backend.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'

const R = await import('@/backend/reportes/reglas')
const A = await import('@/app/actions/reportes')

let pasan = 0
let fallan = 0
const errorOriginal = console.error
async function prueba(nombre, fn) {
  console.error = () => {}
  try {
    await fn()
    pasan++
    console.log(`PASA  | ${nombre}`)
  } catch (e) {
    fallan++
    console.log(`FALLA | ${nombre} | ${e.message}`)
  } finally {
    console.error = errorOriginal
  }
}
function igual(real, esperado, msg = '') {
  const a = JSON.stringify(real)
  const b = JSON.stringify(esperado)
  if (a !== b) throw new Error(`${msg} esperado ${b}, llegó ${a}`)
}

// ---------------- Cliente Supabase falso ----------------
// rpc(nombre) devuelve lo que diga `respuestas`; from(tabla) devuelve filas fijas.
function crearDb(respuestas = {}) {
  const llamadas = { rpc: [], bitacora: [] }
  const tablas = {
    rol: [{ id: 3, nombre: 'TECNICO' }],
    usuario: [{ id: 7, nombre: 'Ana Técnica', rol_id: 3, estado: true }, { id: 8, nombre: 'Inactivo', rol_id: 3, estado: false }],
    categoria_producto: [{ id: 2, nombre: 'Cámaras' }],
  }
  function consulta(tabla) {
    let filas = [...(tablas[tabla] ?? [])]
    const q = {
      select: () => q,
      eq: (col, val) => { filas = filas.filter((f) => f[col] === val); return q },
      order: () => q,
      maybeSingle: async () => ({ data: filas[0] ?? null, error: null }),
      insert: (fila) => {
        llamadas.bitacora.push(fila)
        return { select: () => ({ single: async () => ({ data: { id: 1, ...fila }, error: null }) }) }
      },
      then: (ok) => Promise.resolve({ data: filas, error: null }).then(ok),
    }
    return q
  }
  return {
    llamadas,
    from: consulta,
    rpc: async (nombre, params) => {
      llamadas.rpc.push({ nombre, params })
      return { data: respuestas[nombre] ?? null, error: null }
    },
  }
}

function sesion({ acciones = ['REPORTES:LEER', 'REPORTES:PROCESAR'], db = crearDb() } = {}) {
  globalThis.__cu16 = {
    usuario: { id: 1, nombre: 'Admin', estado: true, rol: { nombre: 'ADMINISTRADOR' } },
    accionesPermitidas: acciones,
    db,
  }
  return db
}

const hoy = R.hoyBolivia()
const inicioMes = `${hoy.slice(0, 7)}-01`

// ---------------- Pruebas ----------------
await prueba('Sin sesión: mensaje de sesión expirada', async () => {
  globalThis.__cu16 = { usuario: null, accionesPermitidas: [], db: crearDb() }
  const r = await A.generarReporte({ tipo: 'INGRESOS', desde: inicioMes, hasta: hoy })
  igual(r, { ok: false, error: 'Su sesión ha expirado. Inicie sesión nuevamente.' })
})

await prueba('Rol sin permiso REPORTES: no genera', async () => {
  sesion({ acciones: [] })
  const r = await A.generarReporte({ tipo: 'INGRESOS', desde: inicioMes, hasta: hoy })
  igual(r, { ok: false, error: 'No tiene permiso para generar reportes.' })
})

await prueba('Opciones de filtro: solo técnicos activos y categorías', async () => {
  sesion()
  const r = await A.cargarFiltros()
  igual(r, { ok: true, data: { tecnicos: [{ id: 7, nombre: 'Ana Técnica' }], categorias: [{ id: 2, nombre: 'Cámaras' }] } })
})

await prueba('Validación: fecha hasta posterior a hoy', async () => {
  sesion()
  const r = await A.generarReporte({ tipo: 'INGRESOS', desde: inicioMes, hasta: '2999-01-01' })
  igual(r, { ok: false, error: 'La fecha hasta no puede ser posterior a hoy.' })
})

await prueba('Técnico inactivo: excepción del paso 7', async () => {
  sesion()
  const r = await A.generarReporte({ tipo: 'RENDIMIENTO_TECNICO', desde: inicioMes, hasta: hoy, tecnicoId: 8 })
  igual(r, { ok: false, error: 'El técnico seleccionado no existe o está inactivo.' })
})

await prueba('Categoría inexistente: excepción del paso 7', async () => {
  sesion()
  const r = await A.generarReporte({ tipo: 'INVENTARIO_CRITICO', categoriaId: 99 })
  igual(r, { ok: false, error: 'La categoría seleccionada no existe.' })
})

await prueba('Sin datos en el período: mensaje y SIN bitácora', async () => {
  const db = sesion({ db: crearDb({ fn_reporte_ingresos: { total: 0, cantidad: 0, por_metodo: [], por_origen: [], serie: [] } }) })
  const r = await A.generarReporte({ tipo: 'INGRESOS', desde: inicioMes, hasta: hoy })
  igual(r, { ok: false, error: 'No se encontraron datos para el período seleccionado.' })
  igual(db.llamadas.bitacora.length, 0)
})

await prueba('Ingresos: llama fn_reporte_ingresos y registra la consulta', async () => {
  const db = sesion({ db: crearDb({ fn_reporte_ingresos: {
    total: 1830, cantidad: 9,
    por_metodo: [{ metodo: 'EFECTIVO', monto: 1630, cantidad: 6 }],
    por_origen: [{ origen: 'COBRO_ORDEN', monto: 920, cantidad: 6 }],
    serie: [{ periodo: inicioMes, monto: 1830, cantidad: 9 }],
  } }) })
  const r = await A.generarReporte({ tipo: 'INGRESOS', desde: inicioMes, hasta: hoy })
  if (!r.ok) throw new Error(r.error)
  igual(r.data.datos.total, 1830)
  igual(r.data.agrupacion, 'DIA')
  igual(r.data.titulo, 'Ingresos por período')
  igual(db.llamadas.rpc[0], { nombre: 'fn_reporte_ingresos', params: { p_desde: inicioMes, p_hasta: hoy } })
  igual(db.llamadas.bitacora[0].accion, 'GENERAR_REPORTE')
})

await prueba('Resumen general: balance = ingresos - compras y cumplimiento promedio', async () => {
  sesion({ db: crearDb({ fn_reporte_resumen_general: {
    agrupacion: 'DIA', total_ingresos: 1830, total_compras: 500, ordenes_finalizadas: 3, productos_criticos: 1,
    top_servicios: [], top_materiales: [],
    rendimiento: [{ tecnico_id: 7, tecnico: 'Ana', ordenes_finalizadas: 2, ordenes_a_tiempo: 1, horas_programadas: 6, horas_reales: 6.05 }],
    serie: [{ periodo: inicioMes, ingresos: 1830, compras: 500 }],
  } }) })
  const r = await A.generarReporte({ tipo: 'RESUMEN_GENERAL', desde: inicioMes, hasta: hoy })
  if (!r.ok) throw new Error(r.error)
  igual(r.data.datos.balance, 1330)
  igual(r.data.datos.cumplimiento_promedio, 99.2)
  igual(r.data.datos.serie[0].balance, 1330)
})

await prueba('Rendimiento: % cumplimiento = programadas ÷ reales × 100', async () => {
  sesion({ db: crearDb({ fn_reporte_rendimiento: [
    { tecnico_id: 7, tecnico: 'Ana Técnica', ordenes_finalizadas: 2, ordenes_a_tiempo: 2, horas_programadas: 8, horas_reales: 10 },
  ] }) })
  const r = await A.generarReporte({ tipo: 'RENDIMIENTO_TECNICO', desde: inicioMes, hasta: hoy, tecnicoId: 7 })
  if (!r.ok) throw new Error(r.error)
  igual(r.data.datos[0].cumplimiento, 80)
  igual(r.data.filtrosTexto, ['Técnico: Ana Técnica'])
})

await prueba('Inventario crítico: sin período y con categoría', async () => {
  const db = sesion({ db: crearDb({ fn_reporte_inventario_critico: [
    { producto_id: 1, codigo: 'CAM1', producto: 'Cámara', categoria: 'Cámaras', unidad: 'UND', stock_actual: 1, stock_minimo: 5, faltante: 4 },
  ] }) })
  const r = await A.generarReporte({ tipo: 'INVENTARIO_CRITICO', categoriaId: 2 })
  if (!r.ok) throw new Error(r.error)
  igual(r.data.agrupacion, null)
  igual(db.llamadas.rpc[0].params, { p_categoria_id: 2 })
})

await prueba('Exportar: exige PROCESAR', async () => {
  sesion({ acciones: ['REPORTES:LEER'] })
  const r = await A.registrarDescarga({ tipo: 'INVENTARIO_CRITICO' }, 'PDF')
  igual(r, { ok: false, error: 'No tiene permiso para exportar reportes.' })
})

await prueba('Exportar: formato inválido', async () => {
  sesion()
  const r = await A.registrarDescarga({ tipo: 'INVENTARIO_CRITICO' }, 'WORD')
  igual(r, { ok: false, error: 'Seleccione el formato de exportación: PDF o Excel.' })
})

await prueba('Exportar: registra EXPORTAR_REPORTE en la bitácora', async () => {
  const db = sesion()
  const r = await A.registrarDescarga({ tipo: 'SERVICIOS', desde: inicioMes, hasta: hoy }, 'EXCEL')
  igual(r, { ok: true, data: null })
  igual(db.llamadas.bitacora[0].accion, 'EXPORTAR_REPORTE')
  if (!db.llamadas.bitacora[0].descripcion.includes('Exportación EXCEL')) throw new Error('descripción sin formato')
})

// ---------------- S4 Rotación de inventario y S7 Proveedores ----------------
const C = await import('@/app/reportes/_lib/contenido')

await prueba('RN7 · clasificarRotacion: sin salidas, alta y baja', async () => {
  igual(
    [R.clasificarRotacion(0, 10), R.clasificarRotacion(10, 10), R.clasificarRotacion(12, 3), R.clasificarRotacion(3, 12), R.clasificarRotacion(4, 0)],
    ['SIN_MOVIMIENTO', 'ALTA', 'ALTA', 'BAJA', 'ALTA'],
  )
})

await prueba('RN8 · calcularMargenPorcentaje', async () => {
  igual([R.calcularMargenPorcentaje(134.35, 598), R.calcularMargenPorcentaje(-10, 100), R.calcularMargenPorcentaje(5, 0)], [22.5, -10, null])
})

const filaRotacion = (id, producto, total, stock, valor, ultima = null) => ({
  producto_id: id, codigo: null, producto, categoria: 'Cámaras', unidad: 'UND',
  en_ordenes: 0, en_ventas: total, total, stock_actual: stock, costo_unitario: 10, valor_stock: valor, ultima_salida: ultima,
})

await prueba('Rotación: llama fn_reporte_rotacion con categoría y clasifica cada producto', async () => {
  const db = sesion({ db: crearDb({ fn_reporte_rotacion: [
    filaRotacion(1, 'Cámara A', 5, 5, 500, inicioMes), filaRotacion(2, 'Cable B', 3, 40, 400, inicioMes),
    filaRotacion(3, 'Cámara C', 0, 4, 800),
  ] }) })
  const r = await A.generarReporte({ tipo: 'ROTACION_INVENTARIO', desde: inicioMes, hasta: hoy, categoriaId: 2 })
  if (!r.ok) throw new Error(r.error)
  igual(db.llamadas.rpc[0], { nombre: 'fn_reporte_rotacion', params: { p_desde: inicioMes, p_hasta: hoy, p_categoria_id: 2 } })
  igual(r.data.datos.map((p) => p.rotacion), ['ALTA', 'BAJA', 'SIN_MOVIMIENTO'])
  igual(r.data.titulo, 'Rotación de inventario')
  igual(r.data.filtrosTexto, ['Categoría: Cámaras'])
})

await prueba('Rotación: indicadores de valor inmovilizado y tabla de sin movimiento', async () => {
  sesion({ db: crearDb({ fn_reporte_rotacion: [filaRotacion(1, 'Cámara A', 5, 5, 500), filaRotacion(3, 'Cámara C', 0, 4, 1500)] }) })
  const r = await A.generarReporte({ tipo: 'ROTACION_INVENTARIO', desde: inicioMes, hasta: hoy })
  if (!r.ok) throw new Error(r.error)
  const c = C.armarContenido(r.data)
  const ind = Object.fromEntries(c.indicadores.map((i) => [i.etiqueta, i.valor]))
  igual([ind['Valor del inventario'], ind['Valor inmovilizado (sin movimiento)'], ind['Inventario que no rota'], ind['Sin movimiento']], [2000, 1500, 75, 1])
  igual(c.tablas[1].filas, [['Cámara C', 4, 1500, 'Nunca']])
  igual(c.grafico.barras.map((b) => b.etiqueta), ['Cámara A'])
})

await prueba('Rotación: sin productos activos da su propio mensaje', async () => {
  sesion({ db: crearDb({ fn_reporte_rotacion: [] }) })
  const r = await A.generarReporte({ tipo: 'ROTACION_INVENTARIO', desde: inicioMes, hasta: hoy })
  igual(r, { ok: false, error: 'No hay productos activos para los filtros seleccionados.' })
})

await prueba('Proveedores: margen % por proveedor y producto, y nota de margen estimado', async () => {
  const db = sesion({ db: crearDb({ fn_reporte_proveedores: {
    proveedores: [{ proveedor_id: 1, proveedor: 'Prov Uno', compras: 1, monto_comprado: 920, productos_comprados: 1, productos_vendidos: 1, ingreso: 598, costo: 463.65, margen: 134.35 }],
    productos: [{ producto_id: 1, producto: 'Cámara A', unidad: 'UND', proveedor_id: 1, proveedor: 'Prov Uno', cantidad: 5, ingreso: 598, costo_unitario: 92.73, origen_costo: 'COMPRAS_PERIODO', costo: 463.65, margen: 134.35 }],
  } }) })
  const r = await A.generarReporte({ tipo: 'PROVEEDORES', desde: inicioMes, hasta: hoy })
  if (!r.ok) throw new Error(r.error)
  igual(db.llamadas.rpc[0], { nombre: 'fn_reporte_proveedores', params: { p_desde: inicioMes, p_hasta: hoy } })
  igual([r.data.datos.proveedores[0].margen_pct, r.data.datos.productos[0].margen_pct], [22.5, 22.5])
  const c = C.armarContenido(r.data)
  if (!c.nota || !c.nota.startsWith('Margen estimado')) throw new Error('falta la nota del margen estimado')
  igual(c.tablas[1].filas[0][5], 'Compras del período')
})

await prueba('Proveedores: período sin compras ni ventas = sin datos', async () => {
  sesion({ db: crearDb({ fn_reporte_proveedores: { proveedores: [], productos: [] } }) })
  const r = await A.generarReporte({ tipo: 'PROVEEDORES', desde: inicioMes, hasta: hoy })
  igual(r, { ok: false, error: 'No se encontraron datos para el período seleccionado.' })
})

await prueba('Proveedores: no usa filtro de categoría ni de técnico', async () => {
  const db = sesion({ db: crearDb({ fn_reporte_proveedores: { proveedores: [{ proveedor_id: 1, proveedor: 'P', compras: 1, monto_comprado: 1, productos_comprados: 1, productos_vendidos: 0, ingreso: 0, costo: 0, margen: 0 }], productos: [] } }) })
  const r = await A.generarReporte({ tipo: 'PROVEEDORES', desde: inicioMes, hasta: hoy, categoriaId: 99, tecnicoId: 8 })
  if (!r.ok) throw new Error(r.error)
  igual(r.data.filtrosTexto, [])
  igual(db.llamadas.rpc.length, 1)
})

console.log(`\n${pasan} pasan, ${fallan} fallan`)
if (fallan > 0) process.exit(1)
