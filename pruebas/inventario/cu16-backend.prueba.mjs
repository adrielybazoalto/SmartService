// ============================================================
// Pruebas del BACKEND de CU16 (Gestionar Inventario y Movimientos de Kárdex).
//
// Ejecuta el código TypeScript REAL de src/backend/inventario y
// src/app/actions/inventario.ts con Node.js (type stripping), usando dobles
// de prueba para la sesión, los permisos de ruta, next/* y un cliente Supabase
// FALSO que registra cada llamada. No usa red, Supabase ni base de datos.
//
// Las funciones SQL (fn_registrar_ajuste, etc.) se prueban aparte en
// pruebas/bd/cu15-cu16.prueba.mjs (PostgreSQL en memoria).
//
// Ejecutar desde la raíz:  node pruebas/inventario/cu16-backend.prueba.mjs
// ============================================================
import './cargador-ts.mjs'

const S = await import('@/backend/inventario/schema')
const R = await import('@/backend/inventario/reglas')
const E = await import('@/backend/inventario/errores')
const A = await import('@/app/actions/inventario')

// ------------------------------------------------------------ mini-framework
let pasan = 0
let fallan = 0
const errorOriginal = console.error
const warnOriginal = console.warn
async function prueba(nombre, fn) {
  const silenciados = []
  console.error = (...a) => silenciados.push(a)
  console.warn = (...a) => silenciados.push(a)
  try {
    await fn(silenciados)
    pasan++
    console.log(`PASA  | ${nombre}`)
  } catch (e) {
    fallan++
    console.log(`FALLA | ${nombre} | ${e.message}`)
  } finally {
    console.error = errorOriginal
    console.warn = warnOriginal
  }
}
function afirmar(condicion, detalle) {
  if (!condicion) throw new Error(detalle)
}
const json = (v) => JSON.stringify(v)
function errorZod(esquema, valor, patron) {
  const r = esquema.safeParse(valor)
  afirmar(!r.success, `debía fallar: ${json(valor)}`)
  const msg = r.error.issues.map((i) => i.message).join(' | ')
  afirmar(patron.test(msg), `mensaje inesperado: ${msg}`)
}

// ------------------------------------------------------- cliente Supabase falso
/** Registra cada consulta (tabla + cadena de métodos) y responde con `responder(reg)`. */
function dbFalsa(responder) {
  const llamadas = []
  return {
    llamadas,
    from(tabla) {
      const reg = { tabla, ops: [] }
      llamadas.push(reg)
      const proxy = new Proxy(function () {}, {
        get(_, prop) {
          if (prop === 'then') {
            return (ok, ko) => Promise.resolve().then(() => responder(reg)).then(ok, ko)
          }
          return (...args) => {
            reg.ops.push([prop, ...args])
            return proxy
          }
        },
      })
      return proxy
    },
    async rpc(fn, args) {
      const reg = { rpc: fn, args }
      llamadas.push(reg)
      return responder(reg)
    },
  }
}
const op = (reg, nombre) => reg.ops?.find((o) => o[0] === nombre)
const tiene = (reg, nombre) => Boolean(op(reg, nombre))
const ok = (data) => ({ data, error: null })
const falla = (error) => ({ data: null, error })

// --------------------------------------------------------- usuarios y permisos
const ADMIN = { id: 1, rol_id: 1, nombre: 'Admin', estado: true }
const ENCARGADO = { id: 2, rol_id: 2, nombre: 'Encargada', estado: true }
const TECNICO = { id: 3, rol_id: 3, nombre: 'Técnico', estado: true }
const INV = 'Catálogo e Inventario'
const MATRIZ = {
  1: ['LEER', 'CREAR', 'ACTUALIZAR', 'ELIMINAR', 'PROCESAR'].map((a) => ({ funcion: { nombre: INV }, accion: { nombre: a } })),
  2: [{ funcion: { nombre: INV }, accion: { nombre: 'LEER' } }, { funcion: { nombre: 'Compras' }, accion: { nombre: 'CREAR' } }],
  3: [{ funcion: { nombre: 'Órdenes de Trabajo' }, accion: { nombre: 'LEER' } }],
}
const PERMISOS_RUTA = { 1: ['USUARIOS', 'INVENTARIO'], 2: ['PERFIL', 'INVENTARIO'], 3: ['PERFIL'] }

const FILA = {
  id: 7, codigo: 'CAM-01', nombre: 'Cámara IP', descripcion_tecnica: null, unidad_medida: 'unidad',
  margen_ganancia: '30.00', precio_compra_actual: '95.00', stock_disponible: '3.00', stock_minimo: '5.00',
  estado: true, categoria_producto: { id: 1, nombre: 'Cámaras' },
}
const FILA_OK = { ...FILA, id: 8, codigo: 'UTP-1', nombre: 'Cable UTP', stock_disponible: 900, stock_minimo: 100 }

/** Prepara la "petición": sesión, permisos y cliente falso. */
function escenario(usuario, respuestas = {}, extra = {}) {
  const db = dbFalsa((reg) => {
    if (reg.tabla === 'rol_funcion') {
      if (extra.rolFuncionFalla) return falla({ message: 'timeout' })
      const rol = op(reg, 'eq')?.[2]
      return ok(MATRIZ[rol] ?? [])
    }
    if (reg.tabla === 'bitacora') {
      return extra.bitacoraFalla ? falla({ code: '23503', message: 'fk' }) : ok({ id: 99 })
    }
    const r = reg.rpc ? respuestas[`rpc:${reg.rpc}`] : respuestas[reg.tabla]
    if (typeof r === 'function') return r(reg)
    if (r) return r
    throw new Error(`consulta no prevista: ${reg.tabla ?? reg.rpc}`)
  })
  globalThis.__cu16 = {
    usuario,
    permisosRuta: PERMISOS_RUTA,
    db,
    cabeceras: { 'x-forwarded-for': '10.0.0.7, 172.16.0.1' },
    revalidadas: [],
  }
  return db
}
const escrituras = (db, tabla) => db.llamadas.filter((r) => r.tabla === tabla && (tiene(r, 'insert') || tiene(r, 'update') || tiene(r, 'delete')))
const eventos = (db) => db.llamadas.filter((r) => r.tabla === 'bitacora').map((r) => op(r, 'insert')[1])

// ======================================================= 1. Validación (Zod)
await prueba('Zod: alta válida normaliza el código y aplica valores por defecto', () => {
  const r = S.registrarProductoSchema.parse({ codigo: '  cam-02 ', nombre: ' Cámara PTZ ', unidad_medida: 'unidad', categoria_id: '1' })
  afirmar(r.codigo === 'CAM-02' && r.nombre === 'Cámara PTZ' && r.categoria_id === 1, json(r))
  afirmar(r.margen_ganancia === 0 && r.precio_compra_actual === 0 && r.stock_minimo === 0 && r.descripcion_tecnica === null, json(r))
})
await prueba('Zod: el alta RECHAZA stock_disponible (stock inicial siempre 0)', () =>
  errorZod(S.registrarProductoSchema, { codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 1, stock_disponible: 50 }, /stock_disponible|Unrecognized|no reconoc/i))
await prueba('Zod: el alta RECHAZA usuario_id (la identidad no viene del cliente)', () =>
  errorZod(S.registrarProductoSchema, { codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 1, usuario_id: 1 }, /usuario_id|Unrecognized/i))
for (const [codigo, re] of [['A', /al menos 2/], ['CAM 01', /solo admite/], ['-CAM', /solo admite/], ['ÑANDÚ', /solo admite/], ['X'.repeat(51), /50 caracteres/]]) {
  await prueba(`Zod: código inválido «${codigo.slice(0, 12)}»`, () =>
    errorZod(S.registrarProductoSchema, { codigo, nombre: 'Prod', unidad_medida: 'u', categoria_id: 1 }, re))
}
await prueba('Zod: precio negativo', () => errorZod(S.registrarProductoSchema, { codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 1, precio_compra_actual: -1 }, /negativo/))
await prueba('Zod: precio con 3 decimales', () => errorZod(S.registrarProductoSchema, { codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 1, precio_compra_actual: 1.005 }, /2 decimales/))
await prueba('Zod: precio vacío "" NO se convierte en 0', () => errorZod(S.registrarProductoSchema, { codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 1, precio_compra_actual: '' }, /obligatorio/))
await prueba('Zod: precio texto no numérico', () => errorZod(S.registrarProductoSchema, { codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 1, precio_compra_actual: 'abc' }, /número/))
await prueba('Zod: margen > 100 %', () => errorZod(S.registrarProductoSchema, { codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 1, margen_ganancia: 150 }, /100/))
await prueba('Zod: categoría inválida', () => errorZod(S.registrarProductoSchema, { codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 0 }, /categoría/))
await prueba('Zod: modificar sin cambios', () => errorZod(S.modificarProductoSchema, { producto_id: 7 }, /No hay cambios/))
await prueba('Zod: modificar RECHAZA stock_disponible', () => errorZod(S.modificarProductoSchema, { producto_id: 7, stock_disponible: 10 }, /stock_disponible|Unrecognized/i))
await prueba('Zod: ajuste con justificación corta', () => errorZod(S.registrarAjusteSchema, { producto_id: 7, stock_contado: 3, justificacion: 'corto' }, /mínimo 10/))
await prueba('Zod: ajuste con stock contado negativo', () => errorZod(S.registrarAjusteSchema, { producto_id: 7, stock_contado: -1, justificacion: 'conteo físico mensual' }, /negativo/))
await prueba('Zod: inventario inicial con cantidad 0', () => errorZod(S.registrarInventarioInicialSchema, { producto_id: 7, cantidad: 0 }, /mayor a 0/))
await prueba('Zod: categoría con nombre de 1 carácter', () => errorZod(S.registrarCategoriaSchema, { nombre: 'A' }, /obligatorio/))
await prueba('Zod: búsqueda de más de 100 caracteres', () => errorZod(S.filtrosProductosSchema, { texto: 'x'.repeat(101) }, /100/))

// ===================================================== 2. Reglas de negocio
await prueba('Regla: stock crítico (stock <= mínimo)', () => {
  afirmar(R.esStockCritico(5, 5) && R.esStockCritico(3, 5) && R.esStockCritico(0, 0) && !R.esStockCritico(6, 5), 'casos de stock crítico')
})
await prueba('Regla: sentido del movimiento por motivo y por tipo (histórico)', () => {
  const casos = [['ENTRADA', 'COMPRA', 1], ['AJUSTE', 'AJUSTE_POSITIVO', 1], ['AJUSTE', 'AJUSTE_NEGATIVO', -1], ['SALIDA', 'VENTA', -1], ['ENTRADA', null, 1], ['SALIDA', null, -1], ['AJUSTE', null, null], ['AJUSTE', 'HISTORICO', null]]
  for (const [t, m, s] of casos) afirmar(R.sentidoMovimiento(t, m) === s, `${t}/${m} → ${R.sentidoMovimiento(t, m)}`)
})
await prueba('Regla: la búsqueda elimina caracteres de inyección de filtros', () => {
  const r = R.sanitizarBusqueda('cam,estado.eq.false),(id.gt.0*%"\\')
  afirmar(!/[,()"\\*%]/.test(r), r)
  afirmar(R.sanitizarBusqueda('cable 1.5mm') === 'cable 1.5mm', 'debe conservar el punto')
})
await prueba('Regla: acceso exige permiso de ruta Y acción', () => {
  afirmar(R.evaluarAccesoInventario(true, ['LEER'], 'LEER'), 'ruta+acción')
  afirmar(!R.evaluarAccesoInventario(false, ['LEER'], 'LEER'), 'sin ruta')
  afirmar(!R.evaluarAccesoInventario(true, ['LEER'], 'CREAR'), 'sin acción')
})

// ================================================= 3. Traducción de errores
await prueba('Errores: código duplicado (23505 uq_producto_codigo)', () => {
  const e = E.traducirErrorBD({ code: '23505', message: 'duplicate key value violates unique constraint "uq_producto_codigo"' }, 'X')
  afirmar(/Código duplicado/.test(e.message), e.message)
})
await prueba('Errores: categoría duplicada', () => {
  const e = E.traducirErrorBD({ code: '23505', message: 'duplicate key value violates unique constraint "categoria_producto_nombre_key"' }, 'X')
  afirmar(/categoría con ese nombre/.test(e.message), e.message)
})
await prueba('Errores: mensajes de las funciones SQL pasan tal cual (42501, 22023, P0002)', () => {
  for (const [code, message] of [['42501', 'No autorizado: su rol no tiene el permiso PROCESAR'], ['22023', 'No hay diferencia que ajustar'], ['P0002', 'El producto 9 no existe']]) {
    afirmar(E.traducirErrorBD({ code, message }, 'X').message === message, code)
  }
})
await prueba('Errores: 23514 lanzado ("Stock insuficiente") vs. CHECK nativo', () => {
  afirmar(/Stock insuficiente/.test(E.traducirErrorBD({ code: '23514', message: 'Stock insuficiente para «A»' }, 'X').message), 'raise')
  afirmar(/Código de producto inválido/.test(E.traducirErrorBD({ code: '23514', message: 'new row for relation "producto" violates check constraint "chk_producto_codigo"' }, 'X').message), 'check')
})
await prueba('Errores: migración no aplicada (PGRST202 / PGRST204)', () => {
  afirmar(/migracion_cu16_inventario\.sql pendiente/.test(E.traducirErrorBD({ code: 'PGRST202', message: 'Could not find the function' }, 'X').message), '202')
  afirmar(/columnas de CU16/.test(E.traducirErrorBD({ code: 'PGRST204', message: "Could not find the 'codigo' column" }, 'X').message), '204')
})
await prueba('Errores: error interno NO filtra detalles al usuario', () => {
  const e = E.traducirErrorBD({ code: 'XX000', message: 'relation "secreta" at 10.1.2.3 failed' }, 'No se pudo cargar')
  afirmar(e.message === 'No se pudo cargar. Intente nuevamente.' && !/secreta|10\.1/.test(e.message), e.message)
})

// ============================================ 4. Permisos en el servidor
await prueba('Permisos: sin sesión → rechazado, sin consultar datos', async () => {
  const db = escenario(null)
  const r = await A.obtenerCatalogoAction()
  afirmar(!r.ok && /inicia sesión/.test(r.mensaje), json(r))
  afirmar(!db.llamadas.some((l) => l.tabla === 'producto'), 'no debía leer productos')
})
await prueba('Permisos: Técnico NO consulta el catálogo (sin acceso al módulo)', async () => {
  const db = escenario(TECNICO)
  const r = await A.obtenerCatalogoAction()
  afirmar(!r.ok && /no tiene acceso al módulo de Inventario/.test(r.mensaje), json(r))
  afirmar(!db.llamadas.some((l) => l.tabla === 'producto'), 'no debía leer productos')
})
await prueba('Permisos: Técnico NO consulta el kárdex', async () => {
  escenario(TECNICO)
  const r = await A.obtenerKardexAction({ producto_id: 7 })
  afirmar(!r.ok && /No autorizado/.test(r.mensaje), json(r))
})
await prueba('Permisos: Encargado SÍ consulta catálogo (DTO, crítico marcado)', async () => {
  escenario(ENCARGADO, { producto: ok([FILA, FILA_OK]) })
  const r = await A.obtenerCatalogoAction()
  afirmar(r.ok && r.data.length === 2, json(r))
  const [a, b] = r.data
  afirmar(a.critico === true && b.critico === false && a.stockDisponible === 3 && a.categoria.nombre === 'Cámaras', json(r.data))
  afirmar(!('categoria_id' in a) && !('stock_disponible' in a), 'debe devolver DTO, no la fila cruda')
})
for (const [nombre, llamar] of [
  ['registrar producto', () => A.registrarProductoAction({ codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 1 })],
  ['modificar producto', () => A.modificarProductoAction({ producto_id: 7, nombre: 'Nuevo' })],
  ['desactivar producto', () => A.desactivarProductoAction({ producto_id: 7 })],
  ['registrar categoría', () => A.registrarCategoriaAction({ nombre: 'Alarmas' })],
  ['registrar ajuste', () => A.registrarAjusteAction({ producto_id: 7, stock_contado: 9, justificacion: 'conteo físico mensual' })],
  ['inventario inicial', () => A.registrarInventarioInicialAction({ producto_id: 7, cantidad: 5 })],
]) {
  await prueba(`Permisos: Encargado NO puede ${nombre} (y no se toca la BD)`, async () => {
    const db = escenario(ENCARGADO)
    const r = await llamar()
    afirmar(!r.ok && /no tiene permiso para esta operación/.test(r.mensaje), json(r))
    afirmar(db.llamadas.every((l) => l.tabla === 'rol_funcion'), `consultas indebidas: ${json(db.llamadas.map((l) => l.tabla ?? l.rpc))}`)
  })
}
await prueba('Permisos: la matriz se filtra por FUNCIÓN (CREAR de Compras no habilita inventario)', async () => {
  escenario(ENCARGADO)
  const r = await A.registrarProductoAction({ codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 1 })
  afirmar(!r.ok, 'el CREAR de Compras no debe servir para Inventario')
})
await prueba('Permisos: si no se puede leer ROL_FUNCION, se deniega (fail-closed)', async () => {
  escenario(ADMIN, {}, { rolFuncionFalla: true })
  const r = await A.obtenerCatalogoAction()
  afirmar(!r.ok && /No autorizado/.test(r.mensaje), json(r))
})

// ================================================ 5. Acciones del Administrador
await prueba('Alta: stock 0, código en mayúsculas, bitácora con el usuario de la SESIÓN', async () => {
  const db = escenario(ADMIN, { producto: (reg) => ok({ ...FILA, id: 20, codigo: 'PTZ-9', stock_disponible: '0.00', ...{ nombre: op(reg, 'insert')[1].nombre } }) })
  const r = await A.registrarProductoAction({ codigo: ' ptz-9 ', nombre: 'Cámara PTZ', unidad_medida: 'unidad', categoria_id: 1, precio_compra_actual: '120.5' })
  afirmar(r.ok && r.data.stockDisponible === 0, json(r))
  const ins = op(escrituras(db, 'producto')[0], 'insert')[1]
  afirmar(ins.stock_disponible === '0.00' && ins.codigo === 'PTZ-9' && ins.precio_compra_actual === '120.50' && ins.estado === true, json(ins))
  const [ev] = eventos(db)
  afirmar(ev.accion === 'NUEVO_PRODUCTO' && ev.usuario_id === ADMIN.id, json(ev))
  afirmar(globalThis.__cu16.revalidadas.includes('/inventario'), 'debe revalidar /inventario')
})
await prueba('Alta: intentar enviar stock_disponible → rechazado sin escribir', async () => {
  const db = escenario(ADMIN)
  const r = await A.registrarProductoAction({ codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 1, stock_disponible: 50 })
  afirmar(!r.ok, json(r))
  afirmar(escrituras(db, 'producto').length === 0, 'no debía insertar')
})
await prueba('Alta: código duplicado → "Código duplicado"', async () => {
  escenario(ADMIN, { producto: falla({ code: '23505', message: 'duplicate key value violates unique constraint "uq_producto_codigo"' }) })
  const r = await A.registrarProductoAction({ codigo: 'CAM-01', nombre: 'Otra', unidad_medida: 'u', categoria_id: 1 })
  afirmar(!r.ok && /Código duplicado/.test(r.mensaje), json(r))
})
await prueba('Alta: si la bitácora falla, la operación NO se pierde (se registra en el servidor)', async (log) => {
  escenario(ADMIN, { producto: ok({ ...FILA, id: 21 }) }, { bitacoraFalla: true })
  const r = await A.registrarProductoAction({ codigo: 'Z9', nombre: 'Prod Z', unidad_medida: 'u', categoria_id: 1 })
  afirmar(r.ok, json(r))
  afirmar(log.some((l) => String(l[0]).includes('[CU16]')), 'debía dejar traza en el servidor')
})
await prueba('Modificar precio → CAMBIO_PRECIO (antes → después); el stock no se envía', async () => {
  const db = escenario(ADMIN, {
    producto: (reg) => tiene(reg, 'update')
      ? ok({ ...FILA, precio_compra_actual: '99.90' })
      : ok({ id: 7, nombre: 'Cámara IP', precio_compra_actual: '95.00', margen_ganancia: '30.00' }),
  })
  const r = await A.modificarProductoAction({ producto_id: 7, precio_compra_actual: 99.9 })
  afirmar(r.ok && r.data.precioCompraActual === 99.9, json(r))
  const upd = op(escrituras(db, 'producto')[0], 'update')[1]
  afirmar(json(upd) === json({ precio_compra_actual: '99.90' }), json(upd))
  const [ev] = eventos(db)
  afirmar(ev.accion === 'CAMBIO_PRECIO' && /95\.00 → 99\.90/.test(ev.descripcion), json(ev))
})
await prueba('Modificar datos sin precio → MODIFICAR_PRODUCTO', async () => {
  const db = escenario(ADMIN, { producto: (reg) => tiene(reg, 'update') ? ok({ ...FILA, nombre: 'Cámara IP v2' }) : ok({ id: 7, nombre: 'Cámara IP', precio_compra_actual: '95.00', margen_ganancia: '30.00' }) })
  const r = await A.modificarProductoAction({ producto_id: 7, nombre: 'Cámara IP v2' })
  afirmar(r.ok && eventos(db)[0].accion === 'MODIFICAR_PRODUCTO', json(eventos(db)))
})
await prueba('Modificar producto inexistente → "El producto no existe"', async () => {
  escenario(ADMIN, { producto: ok(null) })
  const r = await A.modificarProductoAction({ producto_id: 999, nombre: 'X y' })
  afirmar(!r.ok && r.mensaje === 'El producto no existe', json(r))
})
await prueba('Desactivar: UPDATE estado=false solo si estaba activo; no borra', async () => {
  const db = escenario(ADMIN, { producto: ok({ ...FILA, estado: false }) })
  const r = await A.desactivarProductoAction({ producto_id: 7 })
  afirmar(r.ok && r.data.activo === false, json(r))
  const w = escrituras(db, 'producto')[0]
  afirmar(json(op(w, 'update')[1]) === json({ estado: false }) && w.ops.some((o) => o[0] === 'eq' && o[1] === 'estado' && o[2] === true), json(w.ops))
  afirmar(!db.llamadas.some((l) => tiene(l, 'delete')), 'no debe haber DELETE')
  afirmar(eventos(db)[0].accion === 'DESACTIVAR_PRODUCTO', 'evento')
})
await prueba('Desactivar: ya inactivo / inexistente', async () => {
  escenario(ADMIN, { producto: (reg) => (tiene(reg, 'update') ? ok(null) : ok({ id: 7 })) })
  const r1 = await A.desactivarProductoAction({ producto_id: 7 })
  escenario(ADMIN, { producto: ok(null) })
  const r2 = await A.desactivarProductoAction({ producto_id: 999 })
  afirmar(r1.mensaje === 'El producto ya está inactivo' && r2.mensaje === 'El producto no existe', json([r1, r2]))
})
await prueba('Categoría: alta + bitácora NUEVA_CATEGORIA; duplicada → mensaje', async () => {
  const db = escenario(ADMIN, { categoria_producto: ok({ id: 3, nombre: 'Alarmas', descripcion: null }) })
  const r = await A.registrarCategoriaAction({ nombre: ' Alarmas ' })
  afirmar(r.ok && op(escrituras(db, 'categoria_producto')[0], 'insert')[1].nombre === 'Alarmas' && eventos(db)[0].accion === 'NUEVA_CATEGORIA', json(r))
  escenario(ADMIN, { categoria_producto: falla({ code: '23505', message: 'duplicate key value violates unique constraint "categoria_producto_nombre_key"' }) })
  const r2 = await A.registrarCategoriaAction({ nombre: 'Alarmas' })
  afirmar(!r2.ok && /categoría con ese nombre/.test(r2.mensaje), json(r2))
})
await prueba('Consultar categorías (Encargado)', async () => {
  escenario(ENCARGADO, { categoria_producto: ok([{ id: 1, nombre: 'Cámaras', descripcion: null }]) })
  const r = await A.listarCategoriasAction()
  afirmar(r.ok && r.data[0].nombre === 'Cámaras', json(r))
})
await prueba('Búsqueda: usa el texto saneado en el filtro .or() y excluye inactivos', async () => {
  const db = escenario(ENCARGADO, { producto: ok([]) })
  await A.obtenerCatalogoAction({ texto: 'cam,estado.eq.false' })
  const reg = db.llamadas.find((l) => l.tabla === 'producto')
  const filtro = op(reg, 'or')[1]
  afirmar(filtro === 'nombre.ilike.%cam estado.eq.false%,codigo.ilike.%cam estado.eq.false%', filtro)
  afirmar(reg.ops.some((o) => o[0] === 'eq' && o[1] === 'estado' && o[2] === true), 'debe filtrar activos')
})
await prueba('Stock crítico: solo productos con stock <= mínimo', async () => {
  escenario(ENCARGADO, { producto: ok([FILA, FILA_OK]) })
  const r = await A.listarStockCriticoAction()
  afirmar(r.ok && r.data.length === 1 && r.data[0].id === 7, json(r))
})

// ========================================================== 6. Kárdex
await prueba('Kárdex: orden cronológico, stock anterior/resultante, motivo, documento y responsable', async () => {
  const db = escenario(ENCARGADO, {
    producto: ok({ id: 7, codigo: 'CAM-01', nombre: 'Cámara IP', stock_disponible: '23.00', estado: true }),
    movimiento_kardex: ok([
      { id: 1, fecha_movimiento: '2026-09-06T12:57:05', tipo_movimiento: 'ENTRADA', motivo: null, cantidad: '20.00', stock_anterior: '0.00', stock_resultante: null, documento: null, origen_movimiento: 'COMPRA', observacion: 'histórico', usuario_id: 1, usuario: { nombre: 'Admin' } },
      { id: 9, fecha_movimiento: '2026-10-12T10:00:00', tipo_movimiento: 'ENTRADA', motivo: 'COMPRA', cantidad: 3, stock_anterior: 20, stock_resultante: 23, documento: 'FACTURA 001-2345', origen_movimiento: 'compra:1', observacion: null, usuario_id: 2, usuario: { nombre: 'Encargada' } },
    ]),
  })
  const r = await A.obtenerKardexAction({ producto_id: '7' })
  afirmar(r.ok && r.data.movimientos.length === 2, json(r))
  const [h, c] = r.data.movimientos
  afirmar(h.stockResultante === null && h.sentido === 1 && h.motivo === null, json(h))
  afirmar(c.stockAnterior === 20 && c.stockResultante === 23 && c.documento === 'FACTURA 001-2345' && c.responsable.nombre === 'Encargada' && c.sentido === 1, json(c))
  const reg = db.llamadas.find((l) => l.tabla === 'movimiento_kardex')
  afirmar(json(reg.ops.filter((o) => o[0] === 'order').map((o) => [o[1], o[2].ascending])) === json([['fecha_movimiento', true], ['id', true]]), 'orden cronológico')
})
await prueba('Kárdex: producto inexistente', async () => {
  escenario(ENCARGADO, { producto: ok(null) })
  const r = await A.obtenerKardexAction({ producto_id: 999 })
  afirmar(!r.ok && r.mensaje === 'El producto no existe', json(r))
})

// ======================================== 7. Ajustes e inventario inicial (RPC)
await prueba('Ajuste: llama a fn_registrar_ajuste con el usuario de la SESIÓN y la IP', async () => {
  const db = escenario(ADMIN, { 'rpc:fn_registrar_ajuste': ok({ movimiento_id: 31, producto_id: 7, producto: 'Cámara IP', motivo: 'AJUSTE_POSITIVO', cantidad: 2, stock_anterior: 23, stock_resultante: 25 }) })
  const r = await A.registrarAjusteAction({ producto_id: 7, stock_contado: '25', justificacion: 'conteo físico mensual' })
  afirmar(r.ok && r.data.motivo === 'AJUSTE_POSITIVO' && r.data.stockResultante === 25, json(r))
  const llamada = db.llamadas.find((l) => l.rpc)
  afirmar(llamada.rpc === 'fn_registrar_ajuste' && json(llamada.args) === json({ p_usuario_id: 1, p_producto_id: 7, p_stock_contado: 25, p_justificacion: 'conteo físico mensual', p_ip: '172.16.0.1' }), json(llamada))
  afirmar(escrituras(db, 'producto').length === 0 && escrituras(db, 'movimiento_kardex').length === 0, 'el backend NO debe escribir stock ni kárdex directamente')
})
await prueba('Ajuste: errores de la función SQL llegan al usuario (sin diferencia / no autorizado)', async () => {
  escenario(ADMIN, { 'rpc:fn_registrar_ajuste': falla({ code: '22023', message: 'No hay diferencia que ajustar: el stock de «Cámara IP» ya es 25.00' }) })
  const r1 = await A.registrarAjusteAction({ producto_id: 7, stock_contado: 25, justificacion: 'conteo físico mensual' })
  escenario(ADMIN, { 'rpc:fn_registrar_ajuste': falla({ code: '42501', message: 'No autorizado: su rol no tiene el permiso PROCESAR sobre Catálogo e Inventario' }) })
  const r2 = await A.registrarAjusteAction({ producto_id: 7, stock_contado: 20, justificacion: 'conteo físico mensual' })
  afirmar(/No hay diferencia/.test(r1.mensaje) && /PROCESAR/.test(r2.mensaje), json([r1, r2]))
})
await prueba('Ajuste: migración no aplicada (PGRST202) → mensaje claro', async () => {
  escenario(ADMIN, { 'rpc:fn_registrar_ajuste': falla({ code: 'PGRST202', message: 'Could not find the function public.fn_registrar_ajuste' }) })
  const r = await A.registrarAjusteAction({ producto_id: 7, stock_contado: 20, justificacion: 'conteo físico mensual' })
  afirmar(!r.ok && /migracion_cu16_inventario\.sql pendiente/.test(r.mensaje), json(r))
})
await prueba('Ajuste: respuesta malformada de la BD → error controlado', async () => {
  escenario(ADMIN, { 'rpc:fn_registrar_ajuste': ok({ inesperado: true }) })
  const r = await A.registrarAjusteAction({ producto_id: 7, stock_contado: 20, justificacion: 'conteo físico mensual' })
  afirmar(!r.ok && /Respuesta inesperada/.test(r.mensaje), json(r))
})
await prueba('Inventario inicial: llama a fn_registrar_inventario_inicial; IP inválida → null', async () => {
  const db = escenario(ADMIN, { 'rpc:fn_registrar_inventario_inicial': ok({ movimiento_id: 40, producto_id: 9, producto: 'Sensor', cantidad: 15, stock_anterior: 0, stock_resultante: 15 }) })
  globalThis.__cu16.cabeceras = { 'x-forwarded-for': '<script>' }
  const r = await A.registrarInventarioInicialAction({ producto_id: 9, cantidad: 15, observacion: ' carga inicial ' })
  afirmar(r.ok && r.data.motivo === 'INVENTARIO_INICIAL' && r.data.stockResultante === 15, json(r))
  const llamada = db.llamadas.find((l) => l.rpc)
  afirmar(json(llamada.args) === json({ p_usuario_id: 1, p_producto_id: 9, p_cantidad: 15, p_observacion: 'carga inicial', p_ip: null }), json(llamada.args))
})
await prueba('Inventario inicial repetido → mensaje de la función SQL', async () => {
  escenario(ADMIN, { 'rpc:fn_registrar_inventario_inicial': falla({ code: '22023', message: 'El producto «Sensor» ya tiene movimientos; use un ajuste por conteo físico' }) })
  const r = await A.registrarInventarioInicialAction({ producto_id: 9, cantidad: 5 })
  afirmar(!r.ok && /ya tiene movimientos/.test(r.mensaje), json(r))
})
await prueba('Error inesperado (excepción del cliente) → mensaje genérico sin detalles', async () => {
  escenario(ADMIN, { producto: () => { throw new Error('ECONNRESET 10.0.0.9:5432') } })
  const r = await A.obtenerCatalogoAction()
  afirmar(!r.ok && r.mensaje === 'No se pudo cargar el catálogo.' && !/ECONNRESET/.test(r.mensaje), json(r))
})

console.log(`\nTOTAL: ${pasan} pasan, ${fallan} fallan`)
process.exitCode = fallan === 0 ? 0 : 1
