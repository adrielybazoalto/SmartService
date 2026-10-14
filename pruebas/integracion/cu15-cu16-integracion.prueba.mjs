// ============================================================
// Pruebas de INTEGRACIÓN CU15 / CU16 (FASE 8) — PostgreSQL REAL en memoria (PGlite)
//
// Complementa pruebas/bd/cu15-cu16.prueba.mjs con escenarios entre módulos:
//   A. Orden de migraciones con las ramas de otros integrantes (CU07, CU06 IP).
//      Los .sql ajenos se LEEN con `git show origin/<rama>:<archivo>` (solo
//      lectura); si la referencia no existe localmente, la prueba se OMITE.
//   B. Flujos de stock: compra con varios productos, venta y compra del mismo
//      producto, stock insuficiente en salidas, ajustes, inventario inicial,
//      historial encadenado y reversión de transacciones.
//   C. Permisos por rol en la base de datos.
//
// Las "ventas" de B son SIMULADAS: el SQL real de CU09
// (20261012_cu09_ventas_caja.sql) no está en el repositorio. Se ejercitan
// las dos formas en que CU09 puede descontar stock:
//   [núcleo]  private.fn_kardex_aplicar(..., 'SALIDA', 'VENTA', ...)  (propuesta)
//   [directo] INSERT en movimiento_kardex + UPDATE de producto        (código de main)
//
// SEGURIDAD: bases efímeras en memoria; sin red, sin .env, sin Supabase.
// Ejecutar desde la raíz:  node pruebas/integracion/cu15-cu16-integracion.prueba.mjs
// ============================================================
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
const leer = (archivo) => readFileSync(join(RAIZ, archivo), 'utf8')
/** Archivo de otra rama (solo lectura). null si la rama no está disponible. */
function deRama(rama, archivo) {
  try {
    return execFileSync('git', ['show', `origin/${rama}:${archivo}`], { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

let pasan = 0, fallan = 0, omitidas = 0
async function prueba(nombre, fn) {
  try {
    const detalle = await fn()
    if (detalle === 'OMITIDA') { omitidas++; console.log(`OMITE | ${nombre}`); return }
    pasan++
    console.log(`PASA  | ${nombre}${detalle ? ' | ' + detalle : ''}`)
  } catch (e) {
    fallan++
    console.log(`FALLA | ${nombre} | ${e.message}`)
  }
}
const afirmar = (c, d) => { if (!c) throw new Error(d) }
async function esperaError(fn, patron) {
  try { await fn() } catch (e) {
    if (patron.test(e.message)) return e.message
    throw new Error(`mensaje inesperado: ${e.message}`)
  }
  throw new Error('debía fallar')
}

// ---------------------------------------------------------------- base
const ADMIN = 1, ENCARGADO = 2, TECNICO = 3 // seed.sql

async function baseMain({ antesDeMigrar = '', seed = leer('seed.sql') } = {}) {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE dueno NOLOGIN;
    GRANT CREATE ON DATABASE postgres TO dueno; ALTER SCHEMA public OWNER TO dueno; SET ROLE dueno;`)
  await db.exec(leer('schema.sql'))
  await db.exec('ALTER TABLE rol_permiso ADD COLUMN descripcion VARCHAR(255); -- = migracion_rbac.sql')
  await db.exec(seed)
  if (antesDeMigrar) await db.exec(antesDeMigrar)
  return db
}
async function migrar(db) {
  await db.exec(leer('migracion_cu16_inventario.sql'))
  await db.exec(leer('migracion_cu15_compras.sql'))
}
const DATOS = `
  INSERT INTO categoria_producto (id, nombre) VALUES (1, 'Cámaras'), (2, 'Cableado');
  INSERT INTO producto (id, categoria_id, nombre, unidad_medida, precio_compra_actual, stock_disponible, stock_minimo) VALUES
    (1, 1, 'Cámara IP', 'unidad', 90, 0, 5),
    (2, 2, 'Cable UTP', 'metro', 2, 0, 100),
    (3, 1, 'Sensor PIR', 'unidad', 30, 0, 2);
  SELECT setval(pg_get_serial_sequence('producto','id'), 3);
  INSERT INTO proveedor (id, razon_social, nit) VALUES (1, 'Distribuidora A', '1001'), (2, 'Mayorista B', '1002');
  SELECT setval(pg_get_serial_sequence('proveedor','id'), 2);`

const q1 = async (db, sql, p = []) => (await db.query(sql, p)).rows[0]
const hoy = async (db) => (await q1(db, `SELECT ((now() AT TIME ZONE 'America/La_Paz')::date)::text AS d`)).d
const compra = (db, u, prov, nro, items, tipo = 'FACTURA') =>
  q1(db, `SELECT public.fn_registrar_compra($1, $2, $3, $4, (now() AT TIME ZONE 'America/La_Paz')::date, $5::jsonb) AS r`,
    [u, prov, tipo, nro, JSON.stringify(items)]).then((x) => x.r)
const stock = async (db, id) => Number((await q1(db, 'SELECT stock_disponible s FROM producto WHERE id = $1', [id])).s)
const conteos = (db) => q1(db, `SELECT (SELECT count(*) FROM compra)::int c, (SELECT count(*) FROM detalle_compra)::int d,
  (SELECT count(*) FROM movimiento_kardex)::int k, (SELECT count(*) FROM bitacora)::int b,
  (SELECT string_agg(id || ':' || stock_disponible, ',' ORDER BY id) FROM producto) s`)
/** Venta SIMULADA por el núcleo del kárdex (forma propuesta para CU09). */
const ventaNucleo = (db, u, prod, cant, nro) =>
  q1(db, `SELECT * FROM private.fn_kardex_aplicar($1, $2, 'SALIDA', 'VENTA', $3, $4, 'venta:sim')`, [prod, u, cant, `NOTA DE VENTA ${nro}`])
/** Venta SIMULADA como lo hace el código de main (INSERT directo + UPDATE). */
async function ventaDirecta(db, u, prod, cant) {
  await db.exec('BEGIN')
  try {
    const s = await stock(db, prod)
    await db.query(`INSERT INTO movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, origen_movimiento)
                    VALUES ($1, $2, 'SALIDA', $3, $4, 'venta:sim')`, [prod, u, cant, s])
    await db.query('UPDATE producto SET stock_disponible = stock_disponible - $2 WHERE id = $1', [prod, cant])
    await db.exec('COMMIT')
  } catch (e) {
    await db.exec('ROLLBACK')
    throw e
  }
}

// ======================================== A. orden de migraciones entre ramas
const cu07 = deRama('dev-adriely', 'migracion_cu07.sql')
const seedCU07 = deRama('dev-adriely', 'seed.sql')
const ipCU06 = deRama('dev-anthony', 'migracion_bitacora_ip.sql')

await prueba('A1. CU07 (dev-adriely) ANTES de CU16/CU15: todo migra y los permisos no chocan', async () => {
  if (!cu07) return 'OMITIDA'
  const db = await baseMain({ antesDeMigrar: cu07 })
  await migrar(db)
  const p = await q1(db, `SELECT string_agg(id || ':' || nombre, ',' ORDER BY id) l FROM permiso WHERE id >= 9`)
  afirmar(/9:CLIENTES/.test(p.l) && /INVENTARIO/.test(p.l) && /COMPRAS/.test(p.l), p.l)
  return p.l
})

// El seed.sql integrado (Ciclo 2, rama prueba) reserva CLIENTES = 9 y
// SERVICIOS = 10, y PROVEEDORES/COMPRAS/INVENTARIO se insertan por nombre.
// El seed de main (Ciclo 1) no los reserva: allí CU16 toma el id 9.
const seedCiclo1 = deRama('main', 'seed.sql')
/** permisos con id >= 9 y los roles que los tienen: "9:CLIENTES[12] ..." */
const mapaPermisos = async (db) => (await q1(db, `SELECT string_agg(p.id || ':' || p.nombre || '[' ||
  coalesce((SELECT string_agg(rp.rol_id::text, '' ORDER BY rp.rol_id) FROM rol_permiso rp WHERE rp.permiso_id = p.id), '') || ']',
  ' ' ORDER BY p.id) l FROM permiso p WHERE p.id >= 9`)).l
/** Seguridad: el Técnico no recibe rutas de clientes, proveedores, compras ni inventario. */
async function afirmarTecnicoSinAcceso(db) {
  const t = await q1(db, `SELECT string_agg(p.nombre, ',') l FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id
    WHERE rp.rol_id = $1 AND p.nombre IN ('CLIENTES','PROVEEDORES','COMPRAS','INVENTARIO')`, [TECNICO])
  afirmar(t.l === null, `el Técnico recibió: ${t.l}`)
}

await prueba('A2. CU16/CU15 ANTES de CU07: con el seed integrado ya no choca; con el seed del Ciclo 1 el choque se sigue detectando', async () => {
  if (!cu07) return 'OMITIDA'
  const db = await baseMain()
  await migrar(db)
  const antes = await mapaPermisos(db)
  afirmar(/^9:CLIENTES\[12\] 10:SERVICIOS\[1\] /.test(antes), `CLIENTES/SERVICIOS deben conservar 9/10: ${antes}`)
  afirmar(/COMPRAS\[12\]/.test(antes) && /INVENTARIO\[12\]/.test(antes) && !/^(9|10):(COMPRAS|INVENTARIO)/.test(antes), antes)
  await db.exec(cu07)
  const despues = await mapaPermisos(db)
  afirmar(despues === antes, `CU07 alteró los permisos: ${antes} → ${despues}`)
  await afirmarTecnicoSinAcceso(db)
  // Una BD sembrada con el seed del Ciclo 1 sigue necesitando CU07 ANTES de CU16
  if (!seedCiclo1) return `${despues} (seed del Ciclo 1 no disponible)`
  const vieja = await baseMain({ seed: seedCiclo1 })
  await migrar(vieja)
  const inv = await q1(vieja, `SELECT id FROM permiso WHERE nombre = 'INVENTARIO'`)
  await esperaError(() => vieja.exec(cu07), /duplicate key value violates unique constraint "permiso_pkey"/)
  return `${despues} · seed Ciclo 1: INVENTARIO.id = ${inv.id} → CU07 choca (requiere orden CU07 → CU16)`
})

await prueba('A3. seed.sql de dev-adriely sobre una BD ya migrada: con el seed integrado no altera permisos; con el del Ciclo 1 choca', async () => {
  if (!seedCU07) return 'OMITIDA'
  const db = await baseMain()
  await migrar(db)
  const antes = await mapaPermisos(db)
  await db.exec(seedCU07)
  const despues = await mapaPermisos(db)
  afirmar(despues === antes, `el seed de CU07 alteró los permisos: ${antes} → ${despues}`)
  await afirmarTecnicoSinAcceso(db)
  if (!seedCiclo1) return `${despues} (seed del Ciclo 1 no disponible)`
  const vieja = await baseMain({ seed: seedCiclo1 })
  await migrar(vieja)
  await esperaError(() => vieja.exec(seedCU07), /duplicate key value violates unique constraint|permiso_pkey/)
  return `sin cambios: ${despues} · seed Ciclo 1 → choque por id 9`
})

await prueba('A4. Columna bitacora.ip de dev-anthony + CU16/CU15: migran y la compra registra la bitácora', async () => {
  if (!ipCU06) return 'OMITIDA'
  const db = await baseMain({ antesDeMigrar: ipCU06 + DATOS })
  await migrar(db)
  await q1(db, `SELECT public.fn_registrar_compra($1, 1, 'FACTURA', 'IP-1', (now() AT TIME ZONE 'America/La_Paz')::date,
    '[{"producto_id":1,"cantidad":1,"costo_unitario":10}]'::jsonb, NULL, '10.0.0.7') r`, [ENCARGADO])
  const b = await q1(db, `SELECT ip, descripcion FROM bitacora WHERE accion = 'NUEVA_COMPRA'`)
  afirmar(b && b.ip === null && /IP 10\.0\.0\.7/.test(b.descripcion), JSON.stringify(b))
  return 'la IP queda en la descripción y bitacora.ip = NULL (ajuste pendiente tras integrar CU06)'
})

await prueba('A5. CU07 + IP de CU06 + CU16/CU15 en el orden seguro: migraciones idempotentes al re-ejecutar', async () => {
  if (!cu07 || !ipCU06) return 'OMITIDA'
  const db = await baseMain({ antesDeMigrar: ipCU06 + cu07 })
  await migrar(db)
  const antes = await q1(db, `SELECT (SELECT count(*) FROM permiso)::int p, (SELECT count(*) FROM rol_permiso)::int rp, (SELECT count(*) FROM rol_funcion)::int rf`)
  await migrar(db)
  await db.exec(cu07)
  const despues = await q1(db, `SELECT (SELECT count(*) FROM permiso)::int p, (SELECT count(*) FROM rol_permiso)::int rp, (SELECT count(*) FROM rol_funcion)::int rf`)
  afirmar(JSON.stringify(antes) === JSON.stringify(despues), JSON.stringify([antes, despues]))
  return JSON.stringify(despues)
})

// ============================================================ B. flujos de stock
const db = await baseMain({ antesDeMigrar: DATOS })
await migrar(db)

await prueba('B1. Compra con 3 productos: stock aumenta en cada uno y hay 3 ENTRADAS/COMPRA', async () => {
  const r = await compra(db, ENCARGADO, 1, 'F-100', [
    { producto_id: 1, cantidad: 10, costo_unitario: 95.1 },
    { producto_id: 2, cantidad: 500, costo_unitario: 2.5 },
    { producto_id: 3, cantidad: 4, costo_unitario: 28 },
  ])
  const s = [await stock(db, 1), await stock(db, 2), await stock(db, 3)]
  const k = await q1(db, `SELECT count(*)::int n, sum(cantidad)::text t FROM movimiento_kardex WHERE compra_id = $1 AND motivo = 'COMPRA' AND tipo_movimiento = 'ENTRADA'`, [r.compra_id])
  afirmar(JSON.stringify(s) === '[10,500,4]' && k.n === 3 && r.total === 2313, JSON.stringify({ s, k, total: r.total }))
  return `stock ${s.join('/')} · total ${r.total}`
})

await prueba('B2. Venta [núcleo] y compra del mismo producto: stock y kárdex encadenados', async () => {
  const v = await ventaNucleo(db, ENCARGADO, 1, 3, 'NV-1')
  await compra(db, ENCARGADO, 2, 'N-7', [{ producto_id: 1, cantidad: 5, costo_unitario: 99 }], 'NOTA')
  const v2 = await ventaNucleo(db, ENCARGADO, 1, 2, 'NV-2')
  afirmar(Number(v.stock_anterior) === 10 && Number(v.stock_resultante) === 7, JSON.stringify(v))
  afirmar(Number(v2.stock_anterior) === 12 && Number(v2.stock_resultante) === 10 && (await stock(db, 1)) === 10, JSON.stringify(v2))
  return '10 → venta 3 → 7 → compra 5 → 12 → venta 2 → 10'
})

await prueba('B3. Venta [directo, código de main] y compra del mismo producto: trigger completa VENTA', async () => {
  await ventaDirecta(db, ENCARGADO, 2, 50)
  await compra(db, ENCARGADO, 1, 'F-101', [{ producto_id: 2, cantidad: 100, costo_unitario: 2.4 }])
  const ult = (await db.query(`SELECT motivo, stock_anterior::float a, stock_resultante::float r FROM movimiento_kardex WHERE producto_id = 2 ORDER BY id`)).rows
  afirmar(ult.map((m) => m.motivo).join(',') === 'COMPRA,VENTA,COMPRA' && (await stock(db, 2)) === 550, JSON.stringify(ult))
  return ult.map((m) => `${m.motivo} ${m.a}→${m.r}`).join(' · ')
})

await prueba('B4. Stock insuficiente en una salida [núcleo]: error y nada cambia', async () => {
  const antes = await conteos(db)
  const msg = await esperaError(() => ventaNucleo(db, ENCARGADO, 3, 999, 'NV-X'), /Stock insuficiente/)
  afirmar(JSON.stringify(antes) === JSON.stringify(await conteos(db)), 'cambió algo')
  return msg
})

await prueba('B5. Stock insuficiente en una salida [directo]: la restricción del kárdex la rechaza y se revierte', async () => {
  const antes = await conteos(db)
  const msg = await esperaError(() => ventaDirecta(db, ENCARGADO, 3, 999), /chk_kardex_resultante|chk_producto_stock|negativ/)
  afirmar(JSON.stringify(antes) === JSON.stringify(await conteos(db)), 'cambió algo')
  return msg
})

await prueba('B6. Ajuste positivo y negativo (Administrador) sobre un producto con compras y ventas', async () => {
  const s0 = await stock(db, 1)
  const p = (await q1(db, `SELECT public.fn_registrar_ajuste($1, 1, $2, 'Conteo físico: sobrante en almacén') r`, [ADMIN, s0 + 2])).r
  const n = (await q1(db, `SELECT public.fn_registrar_ajuste($1, 1, $2, 'Conteo físico: dos unidades dañadas') r`, [ADMIN, s0 - 1])).r
  afirmar(p.motivo === 'AJUSTE_POSITIVO' && n.motivo === 'AJUSTE_NEGATIVO' && (await stock(db, 1)) === s0 - 1, JSON.stringify([p, n]))
  return `${s0} → +2 → ${s0 + 2} → −3 → ${s0 - 1}`
})

await prueba('B7. Inventario inicial solo en producto sin movimientos; luego se puede comprar', async () => {
  await db.exec(`INSERT INTO producto (id, categoria_id, nombre, unidad_medida, precio_compra_actual) VALUES (4, 1, 'Switch PoE', 'unidad', 300)`)
  const r = (await q1(db, `SELECT public.fn_registrar_inventario_inicial($1, 4, 6, 'Conteo de apertura') r`, [ADMIN])).r
  await compra(db, ENCARGADO, 1, 'F-102', [{ producto_id: 4, cantidad: 2, costo_unitario: 310 }])
  const msg = await esperaError(() => q1(db, `SELECT public.fn_registrar_inventario_inicial($1, 4, 1) r`, [ADMIN]), /ya tiene movimientos/)
  afirmar(Number(r.stock_resultante) === 6 && (await stock(db, 4)) === 8, JSON.stringify(r))
  return `inicial 6 + compra 2 = 8 · repetir: ${msg}`
})

await prueba('B8. Historial: cada movimiento nuevo encadena con el anterior y el stock coincide con el último', async () => {
  const rotas = await q1(db, `SELECT count(*)::int n FROM (
      SELECT stock_anterior, lag(stock_resultante) OVER (PARTITION BY producto_id ORDER BY fecha_movimiento, id) prev
      FROM movimiento_kardex) x WHERE prev IS NOT NULL AND prev <> stock_anterior`)
  const desfase = await q1(db, `SELECT count(*)::int n FROM producto p JOIN LATERAL (
      SELECT stock_resultante FROM movimiento_kardex m WHERE m.producto_id = p.id ORDER BY fecha_movimiento DESC, id DESC LIMIT 1) u ON TRUE
      WHERE u.stock_resultante <> p.stock_disponible`)
  afirmar(rotas.n === 0 && desfase.n === 0, JSON.stringify({ rotas, desfase }))
  const tipos = await q1(db, `SELECT string_agg(DISTINCT motivo, ',' ORDER BY motivo) m FROM movimiento_kardex`)
  return tipos.m
})

await prueba('B9. Documento duplicado y proveedor inactivo: rechazados sin cambios parciales', async () => {
  const antes = await conteos(db)
  const dup = await esperaError(() => compra(db, ENCARGADO, 1, 'f 100', [{ producto_id: 3, cantidad: 1, costo_unitario: 1 }]), /Documento ya registrado/)
  await db.exec('UPDATE proveedor SET estado = FALSE WHERE id = 2')
  const ina = await esperaError(() => compra(db, ENCARGADO, 2, 'N-8', [{ producto_id: 3, cantidad: 1, costo_unitario: 1 }], 'NOTA'), /inactivo/)
  await db.exec('UPDATE proveedor SET estado = TRUE WHERE id = 2')
  afirmar(JSON.stringify(antes) === JSON.stringify(await conteos(db)), 'cambió algo')
  return `${dup} · ${ina}`
})

await prueba('B10. Reversión: compra con una línea inválida al final no deja compra, kárdex, stock ni bitácora', async () => {
  await db.exec(`UPDATE producto SET estado = FALSE WHERE id = 3`)
  const antes = await conteos(db)
  const msg = await esperaError(() => compra(db, ENCARGADO, 1, 'F-103', [
    { producto_id: 1, cantidad: 1, costo_unitario: 90 },
    { producto_id: 3, cantidad: 1, costo_unitario: 30 },
  ]), /inactivo/)
  await db.exec(`UPDATE producto SET estado = TRUE WHERE id = 3`)
  afirmar(JSON.stringify(antes) === JSON.stringify(await conteos(db)), 'quedaron cambios parciales')
  return msg
})

await prueba('B11. Una venta [núcleo] de un producto desactivado se rechaza', async () => {
  await db.exec(`UPDATE producto SET estado = FALSE WHERE id = 3`)
  const msg = await esperaError(() => ventaNucleo(db, ENCARGADO, 3, 1, 'NV-3'), /inactivo/)
  await db.exec(`UPDATE producto SET estado = TRUE WHERE id = 3`)
  return msg
})

await prueba('B12. Bitácora y trazabilidad: NUEVA_COMPRA, AJUSTE_INVENTARIO e INVENTARIO_INICIAL con su responsable', async () => {
  const r = (await db.query(`SELECT accion, usuario_id, count(*)::int n FROM bitacora
    WHERE accion IN ('NUEVA_COMPRA','AJUSTE_INVENTARIO','INVENTARIO_INICIAL') GROUP BY 1, 2 ORDER BY 1`)).rows
  const txt = r.map((x) => `${x.accion}:u${x.usuario_id}×${x.n}`).join(' ')
  afirmar(txt === 'AJUSTE_INVENTARIO:u1×2 INVENTARIO_INICIAL:u1×1 NUEVA_COMPRA:u2×4', txt)
  return txt
})

// ================================================================ C. permisos
await prueba('C1. Administrador registra compras', async () => {
  const r = await compra(db, ADMIN, 1, 'F-ADM', [{ producto_id: 1, cantidad: 1, costo_unitario: 90 }])
  afirmar(r.usuario_id === ADMIN, JSON.stringify(r))
})
await prueba('C2. Encargado: compra sí; ajuste e inventario inicial no', async () => {
  const a = await esperaError(() => q1(db, `SELECT public.fn_registrar_ajuste($1, 1, 0, 'Intento del encargado') r`, [ENCARGADO]), /No autorizado/)
  const i = await esperaError(() => q1(db, `SELECT public.fn_registrar_inventario_inicial($1, 1, 1) r`, [ENCARGADO]), /No autorizado/)
  return `${a} · ${i}`
})
await prueba('C3. Técnico: ni compras, ni ajustes, ni inventario inicial', async () => {
  await esperaError(() => compra(db, TECNICO, 1, 'F-TEC', [{ producto_id: 1, cantidad: 1, costo_unitario: 1 }]), /No autorizado/)
  await esperaError(() => q1(db, `SELECT public.fn_registrar_ajuste($1, 1, 0, 'Intento del técnico') r`, [TECNICO]), /No autorizado/)
  await esperaError(() => q1(db, `SELECT public.fn_registrar_inventario_inicial($1, 1, 1) r`, [TECNICO]), /No autorizado/)
})

console.log(`\nTOTAL: ${pasan} pasan, ${fallan} fallan, ${omitidas} omitidas`)
process.exitCode = fallan ? 1 : 0
