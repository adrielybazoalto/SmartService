// ============================================================
// Pruebas del BACKEND de CU15 (Registrar Compras de Equipos e Insumos).
//
// Ejecuta el código TypeScript REAL de src/backend/compras y
// src/app/actions/compras.ts con Node.js (type stripping), con el mismo
// cargador y dobles que CU16 (pruebas/inventario/): sesión, permisos de ruta,
// next/* y un cliente Supabase FALSO.
//
// Dos tipos de prueba, marcados en la salida:
//   [SIM] SIMULADAS: cliente Supabase falso que registra cada llamada y
//         responde lo que fija la prueba. Sin red ni base de datos.
//   [BD]  PostgreSQL REAL en memoria (PGlite) con schema.sql + seed.sql y las
//         migraciones de CU16 y CU15: la llamada .rpc('fn_registrar_compra', …)
//         que arma el backend se ejecuta contra la función SQL real. NO es
//         Supabase: no pasa por PostgREST ni supabase-js (ver pruebas/bd/README.md).
//
// Ninguna prueba usa Supabase, red, .env ni claves.
// Ejecutar desde la raíz:  node pruebas/compras/cu15-backend.prueba.mjs
// ============================================================
import '../inventario/cargador-ts.mjs'
import { existsSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const S = await import('@/backend/compras/schema')
const R = await import('@/backend/compras/reglas')
const E = await import('@/backend/compras/errores')
const C = await import('@/backend/compras/control-registrar-compra')
const A = await import('@/app/actions/compras')
const AI = await import('@/app/actions/inventario')
const RI = await import('@/backend/inventario/reglas')

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
const sim = (nombre, fn) => prueba(`[SIM] ${nombre}`, fn)
const bd = (nombre, fn) => prueba(`[BD]  ${nombre}`, fn)
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
const ops = (reg, nombre) => reg.ops?.filter((o) => o[0] === nombre) ?? []
const tiene = (reg, nombre) => Boolean(op(reg, nombre))
const eqDe = (reg, col) => ops(reg, 'eq').find((o) => o[1] === col)?.[2]
const ok = (data) => ({ data, error: null })
const falla = (error) => ({ data: null, error })

// --------------------------------------------------------- usuarios y permisos
const ADMIN = { id: 1, rol_id: 1, nombre: 'Jaime Garnica Soria', estado: true }
const ENCARGADO = { id: 2, rol_id: 2, nombre: 'Mariela Morales Vega', estado: true }
const TECNICO = { id: 3, rol_id: 3, nombre: 'Juan Carlos Pérez', estado: true }
const INV = 'Catálogo e Inventario'
const fila = (funcion, acciones) => acciones.map((a) => ({ funcion: { nombre: funcion }, accion: { nombre: a } }))
const TODAS = ['LEER', 'CREAR', 'ACTUALIZAR', 'ELIMINAR', 'PROCESAR']
/** Igual a la matriz que dejan migracion_cu16_inventario.sql + migracion_cu15_compras.sql. */
const MATRIZ = {
  1: [...fila(INV, TODAS), ...fila('Compras', TODAS)],
  2: [...fila(INV, ['LEER']), ...fila('Compras', ['CREAR', 'LEER'])],
  3: fila('Órdenes de Trabajo', ['LEER']),
}
const PERMISOS_RUTA = { 1: ['USUARIOS', 'INVENTARIO', 'COMPRAS'], 2: ['PERFIL', 'INVENTARIO', 'COMPRAS'], 3: ['PERFIL'] }

/** Prepara la "petición": sesión, permisos y cliente falso. */
function escenario(usuario, respuestas = {}, extra = {}) {
  const db = dbFalsa(async (reg) => {
    if (reg.tabla === 'rol_funcion') {
      if (extra.rolFuncionFalla) return falla({ message: 'timeout' })
      return ok((extra.matriz ?? MATRIZ)[eqDe(reg, 'rol_id')] ?? [])
    }
    const r = reg.rpc ? respuestas[`rpc:${reg.rpc}`] : respuestas[reg.tabla]
    if (typeof r === 'function') return r(reg)
    if (r) return r
    throw new Error(`consulta no prevista: ${reg.tabla ?? reg.rpc}`)
  })
  globalThis.__cu16 = {
    usuario,
    permisosRuta: extra.permisosRuta ?? PERMISOS_RUTA,
    db,
    cabeceras: { 'x-forwarded-for': '10.0.0.7, 172.16.0.1' },
    revalidadas: [],
  }
  return db
}
const escrituras = (db) => db.llamadas.filter((r) => r.tabla && (tiene(r, 'insert') || tiene(r, 'update') || tiene(r, 'upsert') || tiene(r, 'delete')))

// ---------------------------------------------------------------- datos base
const HOY = R.fechaHoyNegocio()
const MANANA = R.fechaHoyNegocio(new Date(Date.now() + 36 * 3600 * 1000))
const COMPRA_OK = {
  proveedor_id: 1,
  tipo_documento: ' factura ',
  nro_documento: '  001-2345  ',
  fecha_compra: HOY,
  observacion: '  Reposición mensual ',
  items: [
    { producto_id: '2', cantidad: '100', costo_unitario: '2.50' },
    { producto_id: 1, cantidad: 3, costo_unitario: 95.1 },
  ],
}
const RESPUESTA_FN = {
  compra_id: 12, proveedor_id: 1, proveedor: 'Distribuidora A', tipo_documento: 'FACTURA', nro_documento: '001-2345',
  fecha_compra: HOY, fecha_registro: `${HOY}T10:00:00-04:00`, usuario_id: 2, total: 535.3,
  lineas: [
    { producto_id: 1, producto: 'Cámara IP', cantidad: 3, costo_unitario: 95.1, subtotal: 285.3, stock_anterior: 20, stock_resultante: 23, movimiento_id: 40 },
    { producto_id: 2, producto: 'Cable UTP', cantidad: 100, costo_unitario: 2.5, subtotal: 250, stock_anterior: 800, stock_resultante: 900, movimiento_id: 41 },
  ],
}
const LECTURAS_COMPROBANTE = {
  compra: ok({
    id: 12, tipo_documento: 'FACTURA', nro_documento: '001-2345', fecha_compra: HOY, fecha_registro: `${HOY}T10:00:00-04:00`,
    total: '535.30', observacion: 'Reposición mensual', proveedor_id: 1, usuario_id: 2,
    proveedor: { razon_social: 'Distribuidora A', nit: '1001' }, usuario: { nombre: 'Mariela Morales Vega' },
  }),
  detalle_compra: ok([
    { producto_id: 1, cantidad: '3.00', costo_unitario: '95.10', subtotal: '285.30', producto: { codigo: 'CAM-01', nombre: 'Cámara IP', unidad_medida: 'unidad' } },
    { producto_id: 2, cantidad: '100.00', costo_unitario: '2.50', subtotal: '250.00', producto: { codigo: 'UTP-1', nombre: 'Cable UTP', unidad_medida: 'metro' } },
  ]),
  movimiento_kardex: ok([
    { id: 40, producto_id: 1, stock_anterior: '20.00', stock_resultante: '23.00' },
    { id: 41, producto_id: 2, stock_anterior: '800.00', stock_resultante: '900.00' },
  ]),
}

// ======================================================= 1. Validación (Zod)
await sim('Zod: compra válida normaliza tipo, número, observación, ids y números', () => {
  const r = S.registrarCompraSchema.parse(COMPRA_OK)
  afirmar(r.tipo_documento === 'FACTURA' && r.nro_documento === '001-2345' && r.observacion === 'Reposición mensual', json(r))
  afirmar(json(r.items) === json([{ producto_id: 2, cantidad: 100, costo_unitario: 2.5 }, { producto_id: 1, cantidad: 3, costo_unitario: 95.1 }]), json(r.items))
})
await sim('Zod: número de documento con espacios internos se compacta («001   2345» → «001 2345»)', () => {
  afirmar(S.registrarCompraSchema.parse({ ...COMPRA_OK, nro_documento: '001   2345' }).nro_documento === '001 2345', 'espacios')
})
await sim('Zod: compra RECHAZA usuario_id (la identidad sale de la sesión)', () =>
  errorZod(S.registrarCompraSchema, { ...COMPRA_OK, usuario_id: 1 }, /usuario_id|Unrecognized/i))
await sim('Zod: compra RECHAZA total enviado por el cliente (lo calcula la BD)', () =>
  errorZod(S.registrarCompraSchema, { ...COMPRA_OK, total: 1 }, /total|Unrecognized/i))
await sim('Zod: línea RECHAZA subtotal/stock enviados por el cliente', () =>
  errorZod(S.registrarCompraSchema, { ...COMPRA_OK, items: [{ producto_id: 1, cantidad: 1, costo_unitario: 1, subtotal: 1 }] }, /subtotal|Unrecognized/i))
const casosInvalidos = [
  ['compra sin productos (lista vacía)', { items: [] }, /al menos un producto/],
  ['compra sin productos (sin campo items)', { items: undefined }, /al menos un producto/],
  ['más de 100 líneas', { items: Array.from({ length: 101 }, (_, i) => ({ producto_id: i + 1, cantidad: 1, costo_unitario: 1 })) }, /100 líneas/],
  ['cantidad cero', { items: [{ producto_id: 1, cantidad: 0, costo_unitario: 1 }] }, /cantidad debe ser mayor a 0/i],
  ['cantidad negativa', { items: [{ producto_id: 1, cantidad: -5, costo_unitario: 1 }] }, /cantidad debe ser mayor a 0/i],
  ['cantidad vacía ""', { items: [{ producto_id: 1, cantidad: '', costo_unitario: 1 }] }, /cantidad es obligatori/i],
  ['cantidad con 3 decimales', { items: [{ producto_id: 1, cantidad: 1.005, costo_unitario: 1 }] }, /2 decimales/],
  ['costo cero (D3)', { items: [{ producto_id: 1, cantidad: 1, costo_unitario: 0 }] }, /costo unitario debe ser mayor a 0/i],
  ['costo negativo', { items: [{ producto_id: 1, cantidad: 1, costo_unitario: -1 }] }, /costo unitario debe ser mayor a 0/i],
  ['costo no numérico', { items: [{ producto_id: 1, cantidad: 1, costo_unitario: 'abc' }] }, /número/],
  ['costo excede NUMERIC(12,2)', { items: [{ producto_id: 1, cantidad: 1, costo_unitario: 1e11 }] }, /máximo permitido/],
  ['total excede NUMERIC(12,2)', { items: [{ producto_id: 1, cantidad: 9_999_999, costo_unitario: 9_999_999 }] }, /importe de la compra excede/],
  ['subtotal redondea a 0', { items: [{ producto_id: 1, cantidad: 0.01, costo_unitario: 0.01 }] }, /subtotal resulta 0/],
  ['productos repetidos', { items: [{ producto_id: 1, cantidad: 1, costo_unitario: 1 }, { producto_id: '1', cantidad: 2, costo_unitario: 1 }] }, /productos repetidos/],
  ['producto inválido', { items: [{ producto_id: 0, cantidad: 1, costo_unitario: 1 }] }, /producto inválido/],
  ['tipo de documento inválido', { tipo_documento: 'RECIBO' }, /FACTURA o NOTA/],
  ['número de documento vacío', { nro_documento: '   ' }, /número de factura o nota es obligatorio/],
  ['número de documento con caracteres no permitidos', { nro_documento: '001#2345' }, /no válido/],
  ['número de documento que empieza con guion', { nro_documento: '-12' }, /no válido/],
  ['número de documento de 51 caracteres', { nro_documento: '1'.repeat(51) }, /50 caracteres/],
  ['proveedor ausente', { proveedor_id: undefined }, /proveedor es obligatorio/i],
  ['fecha futura', { fecha_compra: MANANA }, /no puede ser futura/],
  ['fecha inexistente (2026-02-30)', { fecha_compra: '2026-02-30' }, /no es válida/],
  ['fecha en otro formato', { fecha_compra: '12/10/2026' }, /no es válida/],
  ['observación de más de 1000 caracteres', { observacion: 'x'.repeat(1001) }, /1000 caracteres/],
]
for (const [nombre, cambio, patron] of casosInvalidos) {
  await sim(`Zod: ${nombre}`, () => errorZod(S.registrarCompraSchema, { ...COMPRA_OK, ...cambio }, patron))
}
await sim('Zod: filtros de compras con rango invertido', () => errorZod(S.filtrosComprasSchema, { desde: '2026-10-10', hasta: '2026-10-01' }, /posterior/))

// ===================================================== 2. Reglas de negocio
await sim('Regla: subtotal y total sin errores de coma flotante (0.1 × 3, 1.15 × 3, 19.99 × 3)', () => {
  afirmar(R.calcularSubtotal(3, 0.1) === 0.3 && R.calcularSubtotal(3, 1.15) === 3.45 && R.calcularSubtotal(3, 19.99) === 59.97, 'subtotales')
  const r = R.calcularResumenCompra([{ producto_id: 1, cantidad: 3, costo_unitario: 0.1 }, { producto_id: 2, cantidad: 1, costo_unitario: 0.2 }])
  afirmar(r.total === 0.5 && r.lineas[0].subtotal === 0.3, json(r))
})
await sim('Regla: subtotal = round(cantidad × costo, 2) como la BD (2.55 × 1.5 = 3.825 → 3.83)', () => {
  afirmar(R.calcularSubtotal(1.5, 2.55) === 3.83, String(R.calcularSubtotal(1.5, 2.55)))
})
await sim('Regla: normalización del documento = columna generada de la BD', () => {
  afirmar(R.normalizarNroDocumento('001-2345') === '0012345' && R.normalizarNroDocumento('001 23.4/5') === '0012345', 'separadores')
  afirmar(R.normalizarNroDocumento('ab-12') === 'AB12' && R.normalizarNroDocumento('12345') !== R.normalizarNroDocumento('0012345'), 'mayúsculas y ceros')
})
await sim('Regla: fecha de calendario y "hoy" en America/La_Paz (UTC−4)', () => {
  afirmar(R.esFechaCalendario('2024-02-29') && !R.esFechaCalendario('2026-02-29') && !R.esFechaCalendario('2026-13-01'), 'calendario')
  afirmar(R.fechaHoyNegocio(new Date('2026-10-13T03:30:00Z')) === '2026-10-12', 'a las 23:30 de La Paz sigue siendo el 12')
})
await sim('Regla: productos repetidos', () => {
  afirmar(json(R.productosRepetidos([{ producto_id: 1 }, { producto_id: 2 }, { producto_id: 1 }])) === '[1]', 'repetidos')
})
await sim('Regla: acceso exige permiso de ruta COMPRAS Y acción de Compras', () => {
  afirmar(R.evaluarAccesoCompras(true, ['CREAR'], 'CREAR'), 'ruta+acción')
  afirmar(!R.evaluarAccesoCompras(false, ['CREAR'], 'CREAR') && !R.evaluarAccesoCompras(true, ['LEER'], 'CREAR'), 'falta uno')
})

// ================================================= 3. Traducción de errores
await sim('Errores: documento duplicado lanzado por la función (23505 sin restricción) pasa tal cual', () => {
  const m = 'Documento ya registrado: FACTURA 001-2345 del proveedor «Distribuidora A»'
  afirmar(E.traducirErrorBDCompras({ code: '23505', message: m }, 'X').message === m, 'mensaje')
})
await sim('Errores: índice único nativo uq_compra_documento → "Documento ya registrado"', () => {
  const e = E.traducirErrorBDCompras({ code: '23505', message: 'duplicate key value violates unique constraint "uq_compra_documento"' }, 'X')
  afirmar(/Documento ya registrado/.test(e.message), e.message)
})
await sim('Errores: mensajes de negocio de la función (42501, 22023, P0002, 22003) pasan tal cual', () => {
  for (const [code, message] of [['42501', 'No autorizado: su rol no tiene el permiso CREAR sobre Compras'], ['22023', 'El proveedor «Proveedor C» está inactivo'], ['P0002', 'El proveedor 99 no existe'], ['22003', 'El importe de la compra excede el máximo permitido']]) {
    afirmar(E.traducirErrorBDCompras({ code, message }, 'X').message === message, code)
  }
})
await sim('Errores: migración CU15 no aplicada (PGRST202 / PGRST205)', () => {
  afirmar(/migracion_cu15_compras\.sql pendiente/.test(E.traducirErrorBDCompras({ code: 'PGRST202', message: 'Could not find the function' }, 'X').message), '202')
  afirmar(/tablas o columnas de compras/.test(E.traducirErrorBDCompras({ code: 'PGRST205', message: "Could not find the table 'public.compra'" }, 'X').message), '205')
})
await sim('Errores: error interno NO filtra detalles al usuario', () => {
  const e = E.traducirErrorBDCompras({ code: 'XX000', message: 'relation "secreta" at 10.1.2.3 failed' }, 'No se pudo registrar la compra')
  afirmar(e.message === 'No se pudo registrar la compra. Intente nuevamente.' && !/secreta|10\.1/.test(e.message), e.message)
})

// ============================================ 4. Autenticación y autorización
await sim('Permisos: sin sesión → rechazado, sin consultar datos ni llamar a la función', async () => {
  const db = escenario(null)
  const r = await A.registrarCompraAction(COMPRA_OK)
  afirmar(!r.ok && /inicia sesión/.test(r.mensaje), json(r))
  afirmar(db.llamadas.length === 0, json(db.llamadas))
})
for (const [nombre, llamar] of [
  ['registrar compras', () => A.registrarCompraAction(COMPRA_OK)],
  ['listar compras', () => A.listarComprasAction()],
  ['ver proveedores', () => A.listarProveedoresCompraAction()],
  ['ver el comprobante', () => A.obtenerComprobanteIngresoAction({ compra_id: 12 })],
]) {
  await sim(`Permisos: Técnico NO puede ${nombre} (sin acceso al módulo)`, async () => {
    const db = escenario(TECNICO)
    const r = await llamar()
    afirmar(!r.ok && /no tiene acceso al módulo de Compras/.test(r.mensaje), json(r))
    afirmar(db.llamadas.every((l) => l.tabla === 'rol_funcion'), json(db.llamadas.map((l) => l.tabla ?? l.rpc)))
  })
}
await sim('Permisos: Encargado (actor iniciador) SÍ registra compras', async () => {
  escenario(ENCARGADO, { 'rpc:fn_registrar_compra': ok(RESPUESTA_FN), ...LECTURAS_COMPROBANTE })
  const r = await A.registrarCompraAction(COMPRA_OK)
  afirmar(r.ok, json(r))
})
await sim('Permisos: Administrador SÍ registra compras', async () => {
  escenario(ADMIN, { 'rpc:fn_registrar_compra': ok({ ...RESPUESTA_FN, usuario_id: 1 }), ...LECTURAS_COMPROBANTE })
  const r = await A.registrarCompraAction(COMPRA_OK)
  afirmar(r.ok, json(r))
})
await sim('Permisos: rol con LEER pero sin CREAR en Compras → no registra', async () => {
  const db = escenario(ENCARGADO, {}, { matriz: { 2: fila('Compras', ['LEER']) } })
  const r = await A.registrarCompraAction(COMPRA_OK)
  afirmar(!r.ok && /no tiene permiso para esta operación de compras/.test(r.mensaje), json(r))
  afirmar(!db.llamadas.some((l) => l.rpc), 'no debía llamar a la función')
})
await sim('Permisos: acción de Compras sin permiso de ruta COMPRAS → rechazado', async () => {
  escenario(ENCARGADO, {}, { permisosRuta: { 2: ['INVENTARIO'] } })
  const r = await A.listarComprasAction()
  afirmar(!r.ok && /no tiene acceso al módulo de Compras/.test(r.mensaje), json(r))
})
await sim('Permisos: si no se puede leer ROL_FUNCION, se deniega (fail-closed)', async () => {
  escenario(ADMIN, {}, { rolFuncionFalla: true })
  const r = await A.listarComprasAction()
  afirmar(!r.ok && /No autorizado/.test(r.mensaje), json(r))
})

// ============================================== 5. Registro (invocación SQL)
await sim('Registro: UNA llamada a fn_registrar_compra con el usuario de la SESIÓN, la IP y números JSON', async () => {
  const db = escenario(ENCARGADO, { 'rpc:fn_registrar_compra': ok(RESPUESTA_FN), ...LECTURAS_COMPROBANTE })
  await A.registrarCompraAction(COMPRA_OK)
  const rpcs = db.llamadas.filter((l) => l.rpc)
  afirmar(rpcs.length === 1 && rpcs[0].rpc === 'fn_registrar_compra', json(rpcs))
  const esperado = {
    p_usuario_id: 2, p_proveedor_id: 1, p_tipo_documento: 'FACTURA', p_nro_documento: '001-2345', p_fecha_compra: HOY,
    p_items: [{ producto_id: 2, cantidad: 100, costo_unitario: 2.5 }, { producto_id: 1, cantidad: 3, costo_unitario: 95.1 }],
    p_observacion: 'Reposición mensual', p_ip: '10.0.0.7',
  }
  afirmar(json(rpcs[0].args) === json(esperado), json(rpcs[0].args))
  afirmar(rpcs[0].args.p_items.every((i) => typeof i.cantidad === 'number' && typeof i.costo_unitario === 'number'), 'cantidades como number')
})
await sim('Registro: el backend NO escribe tablas (stock, kárdex, compra, precios: solo la función)', async () => {
  const db = escenario(ADMIN, { 'rpc:fn_registrar_compra': ok(RESPUESTA_FN), ...LECTURAS_COMPROBANTE })
  await A.registrarCompraAction(COMPRA_OK)
  afirmar(escrituras(db).length === 0, json(escrituras(db)))
  afirmar(!db.llamadas.some((l) => l.tabla === 'bitacora'), 'la bitácora la registra la función SQL')
})
await sim('Registro: devuelve el comprobante de ingreso completo (proveedor, NIT, responsable, kárdex por línea)', async () => {
  escenario(ENCARGADO, { 'rpc:fn_registrar_compra': ok(RESPUESTA_FN), ...LECTURAS_COMPROBANTE })
  const r = await A.registrarCompraAction(COMPRA_OK)
  afirmar(r.ok && r.data.compraId === 12 && r.data.documento === 'FACTURA 001-2345' && r.data.total === 535.3, json(r))
  afirmar(r.data.proveedor.nit === '1001' && r.data.responsable.nombre === 'Mariela Morales Vega', json(r.data))
  const [l1, l2] = r.data.lineas
  afirmar(l1.codigo === 'CAM-01' && l1.stockAnterior === 20 && l1.stockResultante === 23 && l1.movimientoId === 40, json(l1))
  afirmar(l2.unidadMedida === 'metro' && l2.subtotal === 250 && l2.stockResultante === 900, json(l2))
  afirmar(!('compra_id' in r.data) && !('stock_disponible' in l1), 'DTO, no filas crudas')
})
await sim('Registro: revalida /compras y /inventario', async () => {
  escenario(ENCARGADO, { 'rpc:fn_registrar_compra': ok(RESPUESTA_FN), ...LECTURAS_COMPROBANTE })
  await A.registrarCompraAction(COMPRA_OK)
  const rev = globalThis.__cu16.revalidadas
  afirmar(rev.includes('/compras') && rev.includes('/inventario'), json(rev))
})
await sim('Registro: si falla la lectura posterior, devuelve el comprobante de la función (la compra NO se pierde)', async (log) => {
  escenario(ENCARGADO, { 'rpc:fn_registrar_compra': ok(RESPUESTA_FN), compra: falla({ code: 'XX000', message: 'timeout' }), detalle_compra: ok([]), movimiento_kardex: ok([]) })
  const r = await A.registrarCompraAction(COMPRA_OK)
  afirmar(r.ok && r.data.compraId === 12 && r.data.lineas.length === 2 && r.data.lineas[1].stockResultante === 900, json(r))
  afirmar(r.data.observacion === 'Reposición mensual', 'observación')
  afirmar(log.some((l) => String(l[0]).includes('[CU15]')), 'debía dejar traza en el servidor')
})
await sim('Registro: datos inválidos → NO se llama a la función', async () => {
  const db = escenario(ENCARGADO)
  const r = await A.registrarCompraAction({ ...COMPRA_OK, items: [] })
  afirmar(!r.ok && /al menos un producto/.test(r.mensaje), json(r))
  afirmar(!db.llamadas.some((l) => l.rpc), 'no debía llamar a la función')
})
await sim('Registro: documento duplicado → mensaje de la función', async () => {
  escenario(ENCARGADO, { 'rpc:fn_registrar_compra': falla({ code: '23505', message: 'Documento ya registrado: FACTURA 001-2345 del proveedor «Distribuidora A»' }) })
  const r = await A.registrarCompraAction(COMPRA_OK)
  afirmar(!r.ok && r.mensaje === 'Documento ya registrado: FACTURA 001-2345 del proveedor «Distribuidora A»', json(r))
})
await sim('Registro: proveedor inactivo / producto inexistente / sin permiso en BD → mensaje de la función', async () => {
  for (const [code, message] of [
    ['22023', 'El proveedor «Proveedor C» está inactivo'],
    ['22023', 'La compra incluye productos que no existen en el catálogo'],
    ['42501', 'No autorizado: su rol no tiene el permiso CREAR sobre Compras'],
  ]) {
    escenario(ENCARGADO, { 'rpc:fn_registrar_compra': falla({ code, message }) })
    const r = await A.registrarCompraAction(COMPRA_OK)
    afirmar(!r.ok && r.mensaje === message, json(r))
  }
})
await sim('Registro: migración CU15 no aplicada (PGRST202) → mensaje claro', async () => {
  escenario(ENCARGADO, { 'rpc:fn_registrar_compra': falla({ code: 'PGRST202', message: 'Could not find the function public.fn_registrar_compra' }) })
  const r = await A.registrarCompraAction(COMPRA_OK)
  afirmar(!r.ok && /migracion_cu15_compras\.sql pendiente/.test(r.mensaje), json(r))
})
await sim('Registro: respuesta malformada de la BD → error controlado que pide revisar el listado', async () => {
  escenario(ENCARGADO, { 'rpc:fn_registrar_compra': ok({ inesperado: true }) })
  const r = await A.registrarCompraAction(COMPRA_OK)
  afirmar(!r.ok && /Consulte el listado de compras/.test(r.mensaje), json(r))
})
await sim('Registro: excepción inesperada del cliente → mensaje genérico sin detalles', async () => {
  escenario(ENCARGADO, { 'rpc:fn_registrar_compra': () => { throw new Error('socket hang up 10.9.9.9') } })
  const r = await A.registrarCompraAction(COMPRA_OK)
  afirmar(!r.ok && r.mensaje === 'No se pudo registrar la compra.', json(r))
})

// ======================================================= 6. Consultas y DTOs
await sim('Proveedores: solo activos, ordenados, como DTO', async () => {
  const db = escenario(ENCARGADO, { proveedor: ok([{ id: 1, razon_social: 'Distribuidora A', nit: '1001', contacto: null, telefono: '700' }]) })
  const r = await A.listarProveedoresCompraAction()
  afirmar(r.ok && r.data[0].razonSocial === 'Distribuidora A' && !('razon_social' in r.data[0]), json(r))
  const reg = db.llamadas.find((l) => l.tabla === 'proveedor')
  afirmar(eqDe(reg, 'estado') === true && op(reg, 'order')[1] === 'razon_social', json(reg.ops))
})
await sim('Productos: solo activos, búsqueda saneada y precio pactado del proveedor', async () => {
  const db = escenario(ENCARGADO, {
    producto: ok([
      { id: 1, codigo: 'CAM-01', nombre: 'Cámara IP', unidad_medida: 'unidad', precio_compra_actual: '90.00', stock_disponible: '20.00', categoria_producto: { nombre: 'Cámaras' } },
      { id: 2, codigo: 'UTP-1', nombre: 'Cable UTP', unidad_medida: 'metro', precio_compra_actual: '2.00', stock_disponible: '800.00', categoria_producto: null },
    ]),
    producto_proveedor: ok([{ producto_id: 1, precio_compra: '88.50' }]),
  })
  const r = await A.listarProductosCompraAction({ texto: 'cam,estado.eq.false', proveedor_id: '1' })
  afirmar(r.ok && r.data[0].precioPactado === 88.5 && r.data[1].precioPactado === null && r.data[0].stockDisponible === 20, json(r))
  const reg = db.llamadas.find((l) => l.tabla === 'producto')
  afirmar(eqDe(reg, 'estado') === true && op(reg, 'or')[1] === 'nombre.ilike.%cam estado.eq.false%,codigo.ilike.%cam estado.eq.false%', json(reg.ops))
  afirmar(eqDe(db.llamadas.find((l) => l.tabla === 'producto_proveedor'), 'proveedor_id') === 1, 'precio pactado del proveedor 1')
})
await sim('Productos: sin proveedor no consulta precios pactados', async () => {
  const db = escenario(ENCARGADO, { producto: ok([]) })
  const r = await A.listarProductosCompraAction()
  afirmar(r.ok && !db.llamadas.some((l) => l.tabla === 'producto_proveedor'), json(db.llamadas.map((l) => l.tabla)))
})
await sim('Documento: verificación con la clave NORMALIZADA (igual que el índice único)', async () => {
  const db = escenario(ENCARGADO, { compra: ok({ id: 12 }) })
  const r = await A.verificarDocumentoCompraAction({ proveedor_id: 1, tipo_documento: 'factura', nro_documento: '001 23.45' })
  afirmar(r.ok && r.data.disponible === false && r.data.compraId === 12, json(r))
  const reg = db.llamadas.find((l) => l.tabla === 'compra')
  afirmar(eqDe(reg, 'nro_documento_normalizado') === '0012345' && eqDe(reg, 'tipo_documento') === 'FACTURA' && eqDe(reg, 'proveedor_id') === 1, json(reg.ops))
})
await sim('Documento: libre → disponible', async () => {
  escenario(ENCARGADO, { compra: ok(null) })
  const r = await A.verificarDocumentoCompraAction({ proveedor_id: 1, tipo_documento: 'NOTA', nro_documento: '77' })
  afirmar(r.ok && r.data.disponible === true && r.data.compraId === null, json(r))
})
await sim('Resumen: subtotal por línea y total sin tocar la BD', async () => {
  const db = escenario(ENCARGADO)
  const r = await A.calcularResumenCompraAction({ items: [{ producto_id: 1, cantidad: '3', costo_unitario: '95.10' }, { producto_id: 2, cantidad: 100, costo_unitario: 2.5 }] })
  afirmar(r.ok && r.data.total === 535.3 && r.data.lineas[0].subtotal === 285.3, json(r))
  afirmar(db.llamadas.every((l) => l.tabla === 'rol_funcion'), 'sin consultas de datos')
})
await sim('Listado: filtros, orden más reciente primero, búsqueda solo [A-Z0-9] y DTO', async () => {
  const db = escenario(ENCARGADO, {
    compra: ok([{ id: 12, tipo_documento: 'FACTURA', nro_documento: '001-2345', fecha_compra: HOY, fecha_registro: 'x', total: '535.30', proveedor_id: 1, usuario_id: 2, proveedor: { razon_social: 'Distribuidora A' }, usuario: { nombre: 'Mariela Morales Vega' }, detalle_compra: [{ count: 2 }] }]),
  })
  const r = await A.listarComprasAction({ proveedor_id: 1, tipo_documento: 'factura', nro_documento: "001-23%,'x", desde: '2026-10-01', hasta: HOY, limite: 20 })
  afirmar(r.ok && r.data[0].total === 535.3 && r.data[0].cantidadLineas === 2 && r.data[0].responsable.nombre === 'Mariela Morales Vega', json(r))
  const reg = db.llamadas.find((l) => l.tabla === 'compra')
  afirmar(json(ops(reg, 'order').map((o) => [o[1], o[2].ascending])) === json([['fecha_compra', false], ['id', false]]), 'orden')
  afirmar(op(reg, 'ilike')[2] === '%00123X%' && op(reg, 'limit')[1] === 20, json(reg.ops))
  afirmar(op(reg, 'gte')[2] === '2026-10-01' && op(reg, 'lte')[2] === HOY && eqDe(reg, 'tipo_documento') === 'FACTURA', json(reg.ops))
})
await sim('Comprobante: compra inexistente → "La compra no existe"', async () => {
  escenario(ENCARGADO, { compra: ok(null), detalle_compra: ok([]), movimiento_kardex: ok([]) })
  const r = await A.obtenerComprobanteIngresoAction({ compra_id: 999 })
  afirmar(!r.ok && r.mensaje === 'La compra no existe', json(r))
})
await sim('Comprobante: lee solo los movimientos ENTRADA/COMPRA de esa compra', async () => {
  const db = escenario(ENCARGADO, LECTURAS_COMPROBANTE)
  const r = await A.obtenerComprobanteIngresoAction({ compra_id: '12' })
  afirmar(r.ok && r.data.lineas.length === 2, json(r))
  const reg = db.llamadas.find((l) => l.tabla === 'movimiento_kardex')
  afirmar(eqDe(reg, 'compra_id') === 12 && eqDe(reg, 'motivo') === 'COMPRA', json(reg.ops))
})

// ===================================================== 7. Compatibilidad CU16
await sim('CU16: el CREAR de Compras del Encargado NO habilita alta de productos', async () => {
  escenario(ENCARGADO)
  const r = await AI.registrarProductoAction({ codigo: 'X1', nombre: 'Prod', unidad_medida: 'u', categoria_id: 1 })
  afirmar(!r.ok && /no tiene permiso para esta operación/.test(r.mensaje), json(r))
})
await sim('CU16: el permiso de Inventario NO habilita registrar compras', async () => {
  escenario(ENCARGADO, {}, { matriz: { 2: fila(INV, TODAS) } })
  const r = await A.registrarCompraAction(COMPRA_OK)
  afirmar(!r.ok && /operación de compras/.test(r.mensaje), json(r))
})
await sim('CU16: el Encargado sigue consultando el catálogo con la matriz que agrega CU15', async () => {
  escenario(ENCARGADO, { producto: ok([]) })
  const r = await AI.obtenerCatalogoAction()
  afirmar(r.ok, json(r))
})
await sim('CU16: el kárdex clasifica la ENTRADA/COMPRA generada por CU15 como entrada (+1)', () => {
  afirmar(RI.sentidoMovimiento('ENTRADA', 'COMPRA') === 1, 'sentido')
})
await sim('CU16: el kárdex muestra el documento con el formato que deja la compra', async () => {
  escenario(ENCARGADO, {
    producto: ok({ id: 1, codigo: 'CAM-01', nombre: 'Cámara IP', stock_disponible: '23.00', estado: true }),
    movimiento_kardex: ok([{ id: 40, fecha_movimiento: `${HOY}T10:00:00`, tipo_movimiento: 'ENTRADA', motivo: 'COMPRA', cantidad: '3.00', stock_anterior: '20.00', stock_resultante: '23.00', documento: 'FACTURA 001-2345', origen_movimiento: 'compra:12', observacion: null, usuario_id: 2, usuario: { nombre: 'Mariela Morales Vega' } }]),
  })
  const r = await AI.obtenerKardexAction({ producto_id: 1 })
  afirmar(r.ok && r.data.movimientos[0].documento === 'FACTURA 001-2345' && r.data.movimientos[0].sentido === 1, json(r))
})

// ============================ 8. Integración backend → función SQL REAL (PGlite)
const RAIZ = new URL('../../', import.meta.url)
const DIRS_SQL = ['', 'db', 'db/seeds', 'db/migrations', 'db/legacy', 'db/diagnostics']
const leer = (archivo) => {
  for (const dir of DIRS_SQL) {
    const ruta = new URL(`${dir}/${archivo}`, RAIZ)
    if (existsSync(ruta)) return readFileSync(ruta, 'utf8')
  }
  throw new Error(`No se encontró el archivo SQL: ${archivo}`)
}

async function nuevaBD() {
  const pg = new PGlite()
  await pg.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE dueno NOLOGIN;
    GRANT CREATE ON DATABASE postgres TO dueno; ALTER SCHEMA public OWNER TO dueno; SET ROLE dueno;`)
  await pg.exec(leer('schema.sql'))
  await pg.exec(`ALTER TABLE rol_permiso ADD COLUMN descripcion VARCHAR(255);`)
  await pg.exec(leer('seed.sql'))
  await pg.exec(`
    INSERT INTO categoria_producto (id, nombre) VALUES (1, 'Cámaras'), (2, 'Cableado');
    INSERT INTO producto (id, categoria_id, nombre, unidad_medida, precio_compra_actual, stock_disponible) VALUES
      (1, 1, 'Cámara IP', 'unidad', 90, 20), (2, 2, 'Cable UTP', 'metro', 2, 800);
    SELECT setval(pg_get_serial_sequence('producto','id'), 2);
    INSERT INTO proveedor (id, razon_social, nit) VALUES (1, 'Distribuidora A', '1001'), (2, 'Mayorista B', '1002');
    SELECT setval(pg_get_serial_sequence('proveedor','id'), 2);`)
  await pg.exec(leer('migracion_cu16_inventario.sql'))
  await pg.exec(leer('migracion_cu15_compras.sql'))
  await pg.exec(`UPDATE producto SET codigo = 'CAM-01' WHERE id = 1; UPDATE producto SET codigo = 'UTP-1' WHERE id = 2;`)
  return pg
}

const CASTS = { p_fecha_compra: '::date', p_items: '::jsonb' }
/**
 * Cliente "Supabase" respaldado por PGlite:
 *  - .rpc(fn, args): llama a la función SQL REAL con los argumentos POR NOMBRE
 *    (como PostgREST), como service_role y con el claim de PostgREST.
 *  - .from(tabla): solo las lecturas del comprobante y de documento duplicado,
 *    resueltas con SQL equivalente (no emula PostgREST en general).
 */
function dbPGlite(pg) {
  return dbFalsa(async (reg) => {
    if (reg.tabla === 'rol_funcion') return ok(MATRIZ[eqDe(reg, 'rol_id')] ?? [])
    if (reg.rpc) {
      const nombres = Object.keys(reg.args)
      const sql = `SELECT public.${reg.rpc}(${nombres.map((n, i) => `${n} => $${i + 1}${CASTS[n] ?? ''}`).join(', ')}) AS r`
      const valores = nombres.map((n) => (n === 'p_items' ? JSON.stringify(reg.args[n]) : reg.args[n]))
      await pg.exec(`SET ROLE service_role; SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);`)
      try {
        return ok((await pg.query(sql, valores)).rows[0].r)
      } catch (e) {
        return falla({ code: e.code, message: e.message })
      } finally {
        await pg.exec(`RESET ROLE; SET ROLE dueno; SELECT set_config('request.jwt.claims', '', false);`)
      }
    }
    const q = async (sql, p) => (await pg.query(sql, p)).rows
    if (reg.tabla === 'compra' && eqDe(reg, 'nro_documento_normalizado') !== undefined) {
      const [c] = await q(`SELECT id FROM compra WHERE proveedor_id = $1 AND tipo_documento = $2 AND nro_documento_normalizado = $3 LIMIT 1`,
        [eqDe(reg, 'proveedor_id'), eqDe(reg, 'tipo_documento'), eqDe(reg, 'nro_documento_normalizado')])
      return ok(c ?? null)
    }
    if (reg.tabla === 'compra') {
      const [c] = await q(`SELECT c.id, c.tipo_documento, c.nro_documento, c.fecha_compra::text, c.fecha_registro::text, c.total::text,
          c.observacion, c.proveedor_id, c.usuario_id,
          json_build_object('razon_social', p.razon_social, 'nit', p.nit) AS proveedor, json_build_object('nombre', u.nombre) AS usuario
        FROM compra c JOIN proveedor p ON p.id = c.proveedor_id JOIN usuario u ON u.id = c.usuario_id WHERE c.id = $1`, [eqDe(reg, 'id')])
      return ok(c ?? null)
    }
    if (reg.tabla === 'detalle_compra') {
      return ok(await q(`SELECT d.producto_id, d.cantidad::text, d.costo_unitario::text, d.subtotal::text,
          json_build_object('codigo', p.codigo, 'nombre', p.nombre, 'unidad_medida', p.unidad_medida) AS producto
        FROM detalle_compra d JOIN producto p ON p.id = d.producto_id WHERE d.compra_id = $1 ORDER BY d.producto_id`, [eqDe(reg, 'compra_id')]))
    }
    if (reg.tabla === 'movimiento_kardex') {
      return ok(await q(`SELECT id, producto_id, stock_anterior::text, stock_resultante::text FROM movimiento_kardex
        WHERE compra_id = $1 AND motivo = $2`, [eqDe(reg, 'compra_id'), eqDe(reg, 'motivo')]))
    }
    throw new Error(`consulta no prevista: ${reg.tabla}`)
  })
}
function sesionPGlite(pg, usuario) {
  const db = dbPGlite(pg)
  globalThis.__cu16 = { usuario, permisosRuta: PERMISOS_RUTA, db, cabeceras: { 'x-forwarded-for': '10.0.0.7' }, revalidadas: [] }
  return db
}
const fila1 = async (pg, sql, p = []) => (await pg.query(sql, p)).rows[0]

let pg = null
try {
  pg = await nuevaBD()
} catch (e) {
  await bd('PGlite: base en memoria con schema + seed + migraciones CU16 y CU15', () => { throw e })
}
if (pg) {
  await bd('Registro real: el Encargado compra 2 productos → stock, kárdex, costos, precio pactado y bitácora', async () => {
    sesionPGlite(pg, ENCARGADO)
    const r = await A.registrarCompraAction(COMPRA_OK)
    afirmar(r.ok, json(r))
    const c = r.data
    afirmar(c.total === 535.3 && c.documento === 'FACTURA 001-2345' && c.responsable.nombre === 'Mariela Morales Vega' && c.proveedor.nit === '1001', json(c))
    const [cam, utp] = c.lineas
    afirmar(cam.codigo === 'CAM-01' && cam.stockAnterior === 20 && cam.stockResultante === 23 && cam.subtotal === 285.3, json(cam))
    afirmar(utp.stockAnterior === 800 && utp.stockResultante === 900 && utp.subtotal === 250, json(utp))
    const p = await fila1(pg, `SELECT string_agg(id||':'||stock_disponible||':'||precio_compra_actual, ',' ORDER BY id) s FROM producto`)
    afirmar(p.s === '1:23.00:95.10,2:900.00:2.50', p.s)
    const k = await fila1(pg, `SELECT count(*)::int n, min(usuario_id) u, min(documento) d FROM movimiento_kardex WHERE compra_id = $1 AND tipo_movimiento = 'ENTRADA' AND motivo = 'COMPRA'`, [c.compraId])
    afirmar(k.n === 2 && k.u === 2 && k.d === 'FACTURA 001-2345', json(k))
    const pp = await fila1(pg, `SELECT count(*)::int n FROM producto_proveedor WHERE proveedor_id = 1`)
    afirmar(pp.n === 2, json(pp))
    const b = await fila1(pg, `SELECT usuario_id, descripcion FROM bitacora WHERE accion = 'NUEVA_COMPRA' ORDER BY id DESC LIMIT 1`)
    afirmar(b.usuario_id === 2 && /Total Bs 535\.30/.test(b.descripcion), json(b))
  })
  await bd('Documento duplicado real: «001 2345» = «001-2345» para el mismo proveedor → rechazado y sin cambios', async () => {
    sesionPGlite(pg, ENCARGADO)
    const antes = await fila1(pg, `SELECT (SELECT count(*) FROM compra)::int c, (SELECT string_agg(stock_disponible::text, ',' ORDER BY id) FROM producto) s`)
    const pre = await A.verificarDocumentoCompraAction({ proveedor_id: 1, tipo_documento: 'FACTURA', nro_documento: '001 2345' })
    afirmar(pre.ok && pre.data.disponible === false, json(pre))
    const r = await A.registrarCompraAction({ ...COMPRA_OK, nro_documento: '001 2345' })
    afirmar(!r.ok && /Documento ya registrado: FACTURA 001 2345 del proveedor «Distribuidora A»/.test(r.mensaje), json(r))
    const despues = await fila1(pg, `SELECT (SELECT count(*) FROM compra)::int c, (SELECT string_agg(stock_disponible::text, ',' ORDER BY id) FROM producto) s`)
    afirmar(json(antes) === json(despues), json([antes, despues]))
  })
  await bd('Mismo número con otro proveedor u otro tipo → permitido (D1)', async () => {
    sesionPGlite(pg, ADMIN)
    const r1 = await A.registrarCompraAction({ ...COMPRA_OK, proveedor_id: 2, items: [{ producto_id: 1, cantidad: 1, costo_unitario: 99 }] })
    const r2 = await A.registrarCompraAction({ ...COMPRA_OK, tipo_documento: 'NOTA', items: [{ producto_id: 1, cantidad: 1, costo_unitario: 99 }] })
    afirmar(r1.ok && r2.ok && r1.data.responsable.id === 1, json([r1, r2]))
  })
  await bd('Permiso en la BD (defensa en profundidad): Técnico rechazado por fn_verificar_permiso aunque se salte el guard', async () => {
    const db = dbPGlite(pg)
    let msg = ''
    try {
      await C.ControlRegistrarCompra.registrarCompra(db, TECNICO.id, { ...COMPRA_OK, nro_documento: 'T-1' })
    } catch (e) { msg = e.message }
    afirmar(/No autorizado/.test(msg), msg)
  })
  await bd('Proveedor inactivo real → mensaje de la función', async () => {
    await pg.exec(`UPDATE proveedor SET estado = false WHERE id = 2`)
    sesionPGlite(pg, ENCARGADO)
    const r = await A.registrarCompraAction({ ...COMPRA_OK, proveedor_id: 2, nro_documento: 'INACT-1' })
    afirmar(!r.ok && /Mayorista B.*inactivo/.test(r.mensaje), json(r))
  })
  await bd('Producto inexistente real → toda la compra se revierte (atomicidad)', async () => {
    sesionPGlite(pg, ENCARGADO)
    const antes = await fila1(pg, `SELECT (SELECT count(*) FROM compra)::int c, (SELECT count(*) FROM movimiento_kardex)::int k`)
    const r = await A.registrarCompraAction({ ...COMPRA_OK, nro_documento: 'ATOM-1', items: [{ producto_id: 1, cantidad: 1, costo_unitario: 1 }, { producto_id: 999, cantidad: 1, costo_unitario: 1 }] })
    afirmar(!r.ok && /no existen en el catálogo/.test(r.mensaje), json(r))
    const despues = await fila1(pg, `SELECT (SELECT count(*) FROM compra)::int c, (SELECT count(*) FROM movimiento_kardex)::int k`)
    afirmar(json(antes) === json(despues), json([antes, despues]))
  })
  await bd('Fecha anterior (D2): no pisa el último costo de una compra más reciente', async () => {
    sesionPGlite(pg, ENCARGADO)
    const r = await A.registrarCompraAction({ ...COMPRA_OK, nro_documento: 'OLD-1', fecha_compra: '2026-01-15', items: [{ producto_id: 2, cantidad: 10, costo_unitario: 1.75 }] })
    afirmar(r.ok, json(r))
    const p = await fila1(pg, `SELECT precio_compra_actual::text v, stock_disponible::text s FROM producto WHERE id = 2`)
    afirmar(p.v === '2.50' && p.s === '910.00', json(p))
  })
  await bd('Comprobante real consultado después: coincide con el devuelto al registrar', async () => {
    sesionPGlite(pg, ENCARGADO)
    const r = await A.obtenerComprobanteIngresoAction({ compra_id: 1 })
    afirmar(r.ok && r.data.compraId === 1 && r.data.lineas.length === 2 && r.data.observacion === 'Reposición mensual', json(r))
    afirmar(r.data.lineas.every((l) => l.movimientoId !== null && l.stockResultante > l.stockAnterior), json(r.data.lineas))
  })
  await pg.close()
}

console.log(`\nTOTAL: ${pasan} pasan, ${fallan} fallan`)
console.log('[SIM] = cliente Supabase simulado · [BD] = función SQL real en PGlite (no es Supabase)')
process.exitCode = fallan ? 1 : 0
