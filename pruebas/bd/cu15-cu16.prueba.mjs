// ============================================================
// Pruebas de base de datos CU15 / CU16 — PGlite (PostgreSQL en memoria)
//
// SEGURIDAD: crea bases PostgreSQL EFÍMERAS en memoria (new PGlite() sin
// directorio de datos). No lee .env, no usa claves, no abre conexiones de
// red y no toca Supabase. Solo LEE los .sql de la carpeta db/ del repositorio.
//
// Ejecutar desde la raíz:  node pruebas/bd/cu15-cu16.prueba.mjs
// Detalles: pruebas/bd/README.md
// ============================================================
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

// Raíz del repo = dos niveles por encima de este archivo.
// SMARTSERVICE_RAIZ (opcional) permite apuntar a otra copia del repositorio.
const RAIZ = process.env.SMARTSERVICE_RAIZ ?? fileURLToPath(new URL('../../', import.meta.url));
// Los .sql viven en db/ (raíz, seeds, migrations, legacy, diagnostics).
const DIRS_SQL = ['', 'db', 'db/seeds', 'db/migrations', 'db/legacy', 'db/diagnostics'];
const leer = (archivo) => {
  for (const dir of DIRS_SQL) {
    const ruta = join(RAIZ, dir, archivo);
    if (existsSync(ruta)) return readFileSync(ruta, 'utf8');
  }
  throw new Error(`No se encontró el archivo SQL: ${archivo}`);
};

let ok = 0, fallos = 0;
const log = [];
function resultado(nombre, paso, detalle) {
  if (paso) ok++; else fallos++;
  log.push(`${paso ? 'PASA ' : 'FALLA'} | ${nombre}${detalle ? ' | ' + detalle : ''}`);
}

async function nuevaBD({ cu14Extra = '' } = {}) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE dueno NOLOGIN;               -- emula 'postgres' de Supabase (no superusuario)
    GRANT CREATE ON DATABASE postgres TO dueno;
    ALTER SCHEMA public OWNER TO dueno;
    SET ROLE dueno;`);
  await db.exec(leer('schema.sql'));
  // Privilegios por defecto de Supabase (peor caso: aplican a objetos nuevos)
  await db.exec(`
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER TABLE rol_permiso ADD COLUMN descripcion VARCHAR(255);   -- = migracion_rbac.sql`);
  await db.exec(leer('seed.sql'));
  await db.exec(`
    INSERT INTO categoria_producto (id, nombre) VALUES (1, 'Cámaras'), (2, 'Cableado');
    INSERT INTO producto (id, categoria_id, nombre, unidad_medida, precio_compra_actual, stock_disponible) VALUES
      (1, 1, 'Cámara IP', 'unidad', 90, 20),
      (2, 2, 'Cable UTP', 'metro', 2, 800),
      (3, 1, 'Sensor PIR', 'unidad', 0, 0),
      (4, 1, 'Switch PoE', 'unidad', 300, 5),
      (5, 1, 'Detector humo', 'unidad', 50, 0),
      (6, 2, 'Conector RJ45', 'unidad', 0, 0);
    SELECT setval(pg_get_serial_sequence('producto','id'), 6);
    INSERT INTO proveedor (id, razon_social, nit) VALUES
      (1, 'Distribuidora A', '1001'), (2, 'Mayorista B', '1002'), (3, 'Proveedor C', '1003');
    SELECT setval(pg_get_serial_sequence('proveedor','id'), 3);
    INSERT INTO producto_proveedor (producto_id, proveedor_id, precio_compra, codigo_item_proveedor)
      VALUES (1, 1, 90, 'CAM-01');
    INSERT INTO movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, origen_movimiento, observacion) VALUES
      (1, 1, 'ENTRADA', 20, 0, 'COMPRA', 'histórico'),
      (2, 1, 'ENTRADA', 1000, 0, 'COMPRA', 'histórico'),
      (2, 2, 'SALIDA', 200, 1000, 'ORDEN_TRABAJO', 'histórico'),
      (2, 1, 'AJUSTE', 800, 800, 'AJUSTE', null);
    ${cu14Extra}`);
  return db;
}

async function como(db, rol, claims, sql, params = []) {
  await db.exec(`RESET ROLE; SET ROLE ${rol}; SELECT set_config('request.jwt.claims', '${claims}', false);`);
  try { if (params.length === 0) { const rs = await db.exec(sql); return rs[rs.length - 1]; } return await db.query(sql, params); }
  catch (e) { if (db.isInTransaction ? await db.isInTransaction() : true) { await db.exec('ROLLBACK').catch(() => {}); } throw e; }
  finally { await db.exec(`RESET ROLE; SET ROLE dueno; SELECT set_config('request.jwt.claims', '', false);`); }
}
const SRV = '{"role":"service_role"}';
async function esperaOk(db, nombre, rol, claims, sql, params, verif) {
  try {
    const r = await como(db, rol, claims, sql, params);
    if (verif) { const d = await verif(r); resultado(nombre, d === true, d === true ? '' : String(d)); }
    else resultado(nombre, true);
    return r;
  } catch (e) { resultado(nombre, false, 'error inesperado: ' + e.message); }
}
async function esperaError(db, nombre, rol, claims, sql, params, patron) {
  try { await como(db, rol, claims, sql, params); resultado(nombre, false, 'NO falló'); }
  catch (e) { const p = patron.test(e.message); resultado(nombre, p, p ? e.message : 'mensaje inesperado: ' + e.message); }
}
const q1 = async (db, sql, p = []) => (await db.query(sql, p)).rows[0];
const compra = `SELECT public.fn_registrar_compra($1,$2,$3,$4,$5::date,$6::jsonb,$7,$8) AS r`;
const hoy = async (db) => (await q1(db, `SELECT ((now() AT TIME ZONE 'America/La_Paz')::date)::text AS d`)).d;
const conteo = async (db) => q1(db, `SELECT (SELECT count(*) FROM compra)::int c, (SELECT count(*) FROM detalle_compra)::int d,
  (SELECT count(*) FROM movimiento_kardex)::int k, (SELECT count(*) FROM bitacora)::int b,
  (SELECT string_agg(id||':'||stock_disponible||':'||precio_compra_actual, ',' ORDER BY id) FROM producto) p,
  (SELECT string_agg(producto_id||'-'||proveedor_id||':'||precio_compra, ',' ORDER BY producto_id, proveedor_id) FROM producto_proveedor) pp`);

(async () => {
  // ================= 1. Diagnóstico + migraciones + re-ejecución =================
  let db = await nuevaBD();
  try { await db.exec(leer('diagnostico_cu15_cu16.sql')); resultado('Diagnóstico se ejecuta (solo SELECT)', true); }
  catch (e) { resultado('Diagnóstico se ejecuta', false, e.message); }

  try { await db.exec(leer('migracion_cu16_inventario.sql')); resultado('CU16 se aplica', true); }
  catch (e) { resultado('CU16 se aplica', false, e.message); console.log(log.join('\n')); return; }
  try { await db.exec(leer('migracion_cu15_compras.sql')); resultado('CU15 se aplica', true); }
  catch (e) { resultado('CU15 se aplica', false, e.message); console.log(log.join('\n')); return; }

  const antesRe = await q1(db, `SELECT (SELECT count(*) FROM funcion)::int f, (SELECT count(*) FROM rol_funcion)::int rf,
    (SELECT count(*) FROM permiso)::int p, (SELECT count(*) FROM rol_permiso)::int rp,
    (SELECT count(*) FROM movimiento_kardex)::int k, (SELECT string_agg(stock_disponible::text, ',' ORDER BY id) FROM producto) s`);
  try {
    await db.exec(leer('migracion_cu16_inventario.sql'));
    await db.exec(leer('migracion_cu15_compras.sql'));
    const despues = await q1(db, `SELECT (SELECT count(*) FROM funcion)::int f, (SELECT count(*) FROM rol_funcion)::int rf,
      (SELECT count(*) FROM permiso)::int p, (SELECT count(*) FROM rol_permiso)::int rp,
      (SELECT count(*) FROM movimiento_kardex)::int k, (SELECT string_agg(stock_disponible::text, ',' ORDER BY id) FROM producto) s`);
    resultado('Re-ejecución idempotente (sin duplicar permisos ni tocar datos)', JSON.stringify(antesRe) === JSON.stringify(despues), JSON.stringify(despues));
  } catch (e) { resultado('Re-ejecución idempotente', false, e.message); }

  const hist = await q1(db, `SELECT count(*) FILTER (WHERE motivo IS NULL)::int n FROM movimiento_kardex`);
  resultado('Histórico intacto (4 filas con motivo NULL, sin rellenar)', hist.n === 4, JSON.stringify(hist));

  const perm = (await db.query(`SELECT r.nombre rol, f.nombre fn, string_agg(a.nombre, ',' ORDER BY a.nombre) acc
    FROM rol_funcion rf JOIN rol r ON r.id=rf.rol_id JOIN funcion f ON f.id=rf.funcion_id JOIN accion a ON a.id=rf.accion_id
    WHERE f.nombre IN ('Compras','Catálogo e Inventario') GROUP BY 1,2 ORDER BY 1,2`)).rows;
  resultado('Matriz RBAC esperada', JSON.stringify(perm) === JSON.stringify([
    { rol: 'ADMINISTRADOR', fn: 'Catálogo e Inventario', acc: 'ACTUALIZAR,CREAR,ELIMINAR,LEER,PROCESAR' },
    { rol: 'ADMINISTRADOR', fn: 'Compras', acc: 'ACTUALIZAR,CREAR,ELIMINAR,LEER,PROCESAR' },
    { rol: 'ENCARGADO', fn: 'Catálogo e Inventario', acc: 'LEER' },
    { rol: 'ENCARGADO', fn: 'Compras', acc: 'CREAR,LEER' }]), JSON.stringify(perm));

  const fecha = await hoy(db);
  resultado(`Zona horaria America/La_Paz disponible (hoy = ${fecha})`, !!fecha);

  // ================= 2. Seguridad: EXECUTE, claims, escritura directa =================
  const itemsOk = JSON.stringify([{ producto_id: 2, cantidad: 100, costo_unitario: 2.5 }]);
  await esperaError(db, 'anon NO puede ejecutar fn_registrar_compra', 'anon', '', compra, [1, 1, 'FACTURA', 'X-1', fecha, itemsOk, null, null], /permission denied for function/);
  await esperaError(db, 'authenticated NO puede ejecutar fn_registrar_compra', 'authenticated', '', compra, [1, 1, 'FACTURA', 'X-1', fecha, itemsOk, null, null], /permission denied for function/);
  await esperaError(db, 'anon NO puede ejecutar fn_registrar_ajuste', 'anon', '', `SELECT public.fn_registrar_ajuste(1,1,5,'justificación larga')`, [], /permission denied for function/);
  await esperaError(db, 'service_role con JWT de rol authenticated: rechazado por claims', 'service_role', '{"role":"authenticated"}', compra, [1, 1, 'FACTURA', 'X-1', fecha, itemsOk, null, null], /solo puede invocarse desde el servidor/);
  await esperaError(db, 'service_role NO accede al esquema private', 'service_role', SRV, `SELECT private.fn_kardex_aplicar(1,1,'ENTRADA','COMPRA',1)`, [], /permission denied for schema private/);
  await esperaError(db, 'service_role NO inserta directo en COMPRA', 'service_role', SRV, `INSERT INTO compra (proveedor_id, usuario_id, tipo_documento, nro_documento, fecha_compra, total) VALUES (1,1,'FACTURA','Z',current_date,1)`, [], /permission denied for table compra/);
  await esperaError(db, 'service_role NO inserta directo en DETALLE_COMPRA', 'service_role', SRV, `INSERT INTO detalle_compra (compra_id, producto_id, cantidad, costo_unitario, subtotal) VALUES (1,1,1,1,1)`, [], /permission denied for table detalle_compra/);
  await esperaOk(db, 'service_role SÍ puede leer COMPRA', 'service_role', SRV, `SELECT count(*) FROM compra`);
  await esperaError(db, 'anon NO puede leer COMPRA', 'anon', '', `SELECT count(*) FROM compra`, [], /permission denied for table compra/);
  const acl = await q1(db, `SELECT has_function_privilege('anon','public.fn_registrar_compra(integer,integer,text,text,date,jsonb,text,text)','EXECUTE') a,
    has_function_privilege('authenticated','public.fn_registrar_inventario_inicial(integer,integer,numeric,text,text)','EXECUTE') b,
    has_function_privilege('service_role','public.fn_registrar_ajuste(integer,integer,numeric,text,text)','EXECUTE') c`);
  resultado('ACL: anon/authenticated sin EXECUTE, service_role con EXECUTE (pese a privilegios por defecto)', !acl.a && !acl.b && acl.c, JSON.stringify(acl));
  const defs = (await db.query(`SELECT p.proname, p.prosecdef, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','private') AND p.proname LIKE 'fn_%' ORDER BY 1`)).rows;
  resultado('Solo las 3 RPC públicas son SECURITY DEFINER; todas con search_path vacío',
    defs.filter(d => d.prosecdef).map(d => d.proname).join(',') === 'fn_registrar_ajuste,fn_registrar_compra,fn_registrar_inventario_inicial'
    && defs.every(d => (d.proconfig || []).includes('search_path=""')), JSON.stringify(defs.map(d => [d.proname, d.prosecdef, d.proconfig])));

  // ================= 3. Compras =================
  await esperaOk(db, 'Compra válida (Encargado, 2 líneas, proveedor sin vínculo previo para P2)', 'service_role', SRV, compra,
    [2, 1, 'factura', '  001-2345 ', fecha, JSON.stringify([{ producto_id: 2, cantidad: 100, costo_unitario: 2.5 }, { producto_id: 1, cantidad: 3, costo_unitario: 95 }]), 'Reposición', '10.0.0.7'],
    (r) => { const j = r.rows[0].r; return (j.total == 535 && j.lineas.length === 2 && j.nro_documento === '001-2345' && j.tipo_documento === 'FACTURA') || JSON.stringify(j); });
  const est1 = await q1(db, `SELECT (SELECT stock_disponible FROM producto WHERE id=1)::text s1, (SELECT stock_disponible FROM producto WHERE id=2)::text s2,
    (SELECT precio_compra_actual FROM producto WHERE id=1)::text pc1, (SELECT precio_compra_actual FROM producto WHERE id=2)::text pc2,
    (SELECT precio_compra FROM producto_proveedor WHERE producto_id=1 AND proveedor_id=1)::text pp1,
    (SELECT precio_compra FROM producto_proveedor WHERE producto_id=2 AND proveedor_id=1)::text pp2,
    (SELECT string_agg(motivo||':'||stock_anterior||'→'||stock_resultante||':'||documento||':'||compra_id, ' | ' ORDER BY id) FROM movimiento_kardex WHERE compra_id IS NOT NULL) k,
    (SELECT descripcion FROM bitacora WHERE accion='NUEVA_COMPRA' ORDER BY id DESC LIMIT 1) b`);
  resultado('Compra: stock, último costo, precio pactado (actualizado y creado), kárdex y bitácora',
    est1.s1 === '23.00' && est1.s2 === '900.00' && est1.pc1 === '95.00' && est1.pc2 === '2.50' && est1.pp1 === '95.00' && est1.pp2 === '2.50'
    && /COMPRA:20.00→23.00:FACTURA 001-2345/.test(est1.k) && /COMPRA:800.00→900.00/.test(est1.k) && /IP 10\.0\.0\.7/.test(est1.b), JSON.stringify(est1));

  for (const [nro, tipo, prov, debeFallar] of [['0012345', 'FACTURA', 1, true], ['001 2345', 'FACTURA', 1, true], ['001.2345', 'factura', 1, true],
    ['001/2345', 'FACTURA', 1, true], ['12345', 'FACTURA', 1, false], ['001-2345', 'NOTA', 1, false], ['001-2345', 'FACTURA', 2, false]]) {
    const args = [1, prov, tipo, nro, fecha, JSON.stringify([{ producto_id: 3, cantidad: 1, costo_unitario: 10 }]), null, null];
    if (debeFallar) await esperaError(db, `Duplicado detectado: ${tipo} "${nro}" prov ${prov}`, 'service_role', SRV, compra, args, /Documento ya registrado/);
    else await esperaOk(db, `No es duplicado: ${tipo} "${nro}" prov ${prov}`, 'service_role', SRV, compra, args);
  }

  // Validaciones
  const base = (items, extra = {}) => [extra.u ?? 1, extra.p ?? 2, extra.t ?? 'FACTURA', extra.n ?? ('V-' + Math.random().toString(36).slice(2, 8)), extra.f ?? fecha, JSON.stringify(items), null, null];
  const casos = [
    ['Compra sin productos', base([]), /al menos un producto/],
    ['Cantidad cero', base([{ producto_id: 3, cantidad: 0, costo_unitario: 1 }]), /Cantidad cero o negativa/],
    ['Cantidad negativa', base([{ producto_id: 3, cantidad: -2, costo_unitario: 1 }]), /Cantidad cero o negativa/],
    ['Cantidad con 3 decimales', base([{ producto_id: 3, cantidad: 1.005, costo_unitario: 1 }]), /2 decimales/],
    ['Costo 0 (D3)', base([{ producto_id: 3, cantidad: 1, costo_unitario: 0 }]), /mayor a 0/],
    ['Producto repetido', base([{ producto_id: 3, cantidad: 1, costo_unitario: 1 }, { producto_id: 3, cantidad: 2, costo_unitario: 1 }]), /repetidos/],
    ['Producto inexistente', base([{ producto_id: 999, cantidad: 1, costo_unitario: 1 }]), /no existen/],
    ['producto_id no entero', base([{ producto_id: 1.5, cantidad: 1, costo_unitario: 1 }]), /formato inválido/],
    ['Cantidad como texto', base([{ producto_id: 3, cantidad: '5', costo_unitario: 1 }]), /formato inválido/],
    ['Fecha futura', base([{ producto_id: 3, cantidad: 1, costo_unitario: 1 }], { f: '2999-01-01' }), /no puede ser futura/],
    ['Tipo inválido', base([{ producto_id: 3, cantidad: 1, costo_unitario: 1 }], { t: 'RECIBO' }), /Tipo de documento no válido/],
    ['Número con caracteres inválidos', base([{ producto_id: 3, cantidad: 1, costo_unitario: 1 }], { n: "1'; DROP TABLE compra;--" }), /Número de documento no válido/],
    ['Número vacío', base([{ producto_id: 3, cantidad: 1, costo_unitario: 1 }], { n: '   ' }), /obligatorio/],
    ['Proveedor inexistente', base([{ producto_id: 3, cantidad: 1, costo_unitario: 1 }], { p: 999 }), /proveedor 999 no existe/],
    ['Importe que desborda NUMERIC(12,2)', base([{ producto_id: 3, cantidad: 99999999, costo_unitario: 99999999 }]), /excede el máximo/],
  ];
  for (const [n, a, re] of casos) await esperaError(db, 'Validación: ' + n, 'service_role', SRV, compra, a, re);

  // Proveedor / producto inactivos
  await db.exec(`UPDATE proveedor SET estado = false WHERE id = 3; UPDATE producto SET estado = false WHERE id = 5;`);
  await esperaError(db, 'Proveedor inactivo', 'service_role', SRV, compra, base([{ producto_id: 3, cantidad: 1, costo_unitario: 1 }], { p: 3 }), /inactivo/);

  // Atomicidad: falla la 2.ª línea (producto 5 inactivo) DESPUÉS de procesar la 1.ª
  const antes = await conteo(db);
  await esperaError(db, 'Atomicidad: error en la línea 2 (producto inactivo)', 'service_role', SRV, compra,
    base([{ producto_id: 1, cantidad: 5, costo_unitario: 99 }, { producto_id: 5, cantidad: 1, costo_unitario: 1 }]), /inactivo/);
  const despues = await conteo(db);
  resultado('Atomicidad: sin compra, detalle, kárdex, stock, precio ni bitácora parciales', JSON.stringify(antes) === JSON.stringify(despues), JSON.stringify({ antes, despues }));

  // Permisos por rol
  await esperaError(db, 'Técnico NO puede registrar compras', 'service_role', SRV, compra, base([{ producto_id: 3, cantidad: 1, costo_unitario: 1 }], { u: 3 }), /no tiene el permiso CREAR sobre Compras/);
  await db.exec(`UPDATE usuario SET estado = false WHERE id = 4; UPDATE usuario SET bloqueado_hasta = now() + interval '10 min' WHERE id = 1;`);
  await esperaError(db, 'Usuario inactivo NO puede', 'service_role', SRV, compra, base([{ producto_id: 3, cantidad: 1, costo_unitario: 1 }], { u: 4 }), /inexistente o inactivo/);
  await esperaError(db, 'Usuario con bloqueo vigente NO puede', 'service_role', SRV, compra, base([{ producto_id: 3, cantidad: 1, costo_unitario: 1 }], { u: 1 }), /bloqueada/);
  await esperaError(db, 'Usuario inexistente NO puede', 'service_role', SRV, compra, base([{ producto_id: 3, cantidad: 1, costo_unitario: 1 }], { u: 9999 }), /inexistente/);
  await db.exec(`UPDATE usuario SET bloqueado_hasta = NULL WHERE id = 1;`);

  // Regla del último costo (D2)
  const ant = new Date(Date.parse(fecha) - 5 * 864e5).toISOString().slice(0, 10);
  await esperaOk(db, 'Compra con fecha ANTERIOR (costo 80)', 'service_role', SRV, compra, base([{ producto_id: 1, cantidad: 1, costo_unitario: 80 }], { p: 1, f: ant }));
  const pc = await q1(db, `SELECT (SELECT precio_compra_actual FROM producto WHERE id=1)::text a, (SELECT precio_compra FROM producto_proveedor WHERE producto_id=1 AND proveedor_id=1)::text b`);
  resultado('D2: compra antigua NO pisa el último costo ni el precio pactado (siguen en 95)', pc.a === '95.00' && pc.b === '95.00', JSON.stringify(pc));
  await esperaOk(db, 'Compra con la misma fecha más reciente (costo 97)', 'service_role', SRV, compra, base([{ producto_id: 1, cantidad: 1, costo_unitario: 97 }], { p: 1 }));
  const pc2 = await q1(db, `SELECT (SELECT precio_compra_actual FROM producto WHERE id=1)::text a`);
  resultado('D2: a igual fecha gana la última registrada (97)', pc2.a === '97.00', JSON.stringify(pc2));
  const hc = await q1(db, `SELECT string_agg(costo_unitario::text, ',' ORDER BY id) h FROM detalle_compra WHERE producto_id = 1`);
  resultado('Costo histórico conservado en cada detalle', hc.h === '95.00,80.00,97.00', hc.h);

  // ================= 4. Ajustes e inventario inicial =================
  const aj = `SELECT public.fn_registrar_ajuste($1,$2,$3,$4,$5) AS r`;
  await esperaError(db, 'Encargado NO puede ajustar (solo consulta)', 'service_role', SRV, aj, [2, 1, 10, 'conteo físico mensual', null], /PROCESAR sobre Catálogo e Inventario/);
  const s1 = (await q1(db, `SELECT stock_disponible::numeric s FROM producto WHERE id=1`)).s;
  await esperaOk(db, 'Ajuste positivo por conteo', 'service_role', SRV, aj, [1, 1, Number(s1) + 2, 'conteo físico: 2 unidades halladas', null],
    (r) => (r.rows[0].r.motivo === 'AJUSTE_POSITIVO' && r.rows[0].r.cantidad == 2) || JSON.stringify(r.rows[0].r));
  await esperaOk(db, 'Ajuste negativo por conteo', 'service_role', SRV, aj, [1, 1, Number(s1) - 1, 'conteo físico: 3 unidades dañadas', null],
    (r) => (r.rows[0].r.motivo === 'AJUSTE_NEGATIVO' && r.rows[0].r.cantidad == 3) || JSON.stringify(r.rows[0].r));
  await esperaError(db, 'Ajuste sin diferencia', 'service_role', SRV, aj, [1, 1, Number(s1) - 1, 'conteo físico sin cambio', null], /No hay diferencia/);
  await esperaError(db, 'Ajuste con justificación corta', 'service_role', SRV, aj, [1, 1, 1, 'corto', null], /mínimo 10/);
  await esperaError(db, 'Ajuste con stock contado negativo', 'service_role', SRV, aj, [1, 1, -1, 'justificación suficiente', null], /no puede ser negativo/);
  const ii = `SELECT public.fn_registrar_inventario_inicial($1,$2,$3,$4,$5) AS r`;
  await esperaOk(db, 'Inventario inicial en producto sin movimientos y stock 0', 'service_role', SRV, ii, [1, 6, 15, 'carga inicial', null]);
  await esperaError(db, 'Inventario inicial repetido', 'service_role', SRV, ii, [1, 6, 5, null, null], /ya tiene movimientos/);
  await esperaError(db, 'Inventario inicial con stock previo sin kárdex', 'service_role', SRV, ii, [1, 4, 5, null, null], /regularícelo con un ajuste/);
  await esperaError(db, 'Encargado NO carga inventario inicial', 'service_role', SRV, ii, [2, 4, 5, null, null], /PROCESAR/);

  const cadena = await q1(db, `WITH k AS (SELECT producto_id, stock_anterior, stock_resultante,
      lag(stock_resultante) OVER (PARTITION BY producto_id ORDER BY id) prev FROM movimiento_kardex WHERE motivo IS NOT NULL)
    SELECT count(*) FILTER (WHERE prev IS NOT NULL AND prev <> stock_anterior)::int rotas FROM k`);
  resultado('Kárdex nuevo encadenado (stock_anterior = resultante previo)', cadena.rotas === 0, JSON.stringify(cadena));
  const fin = await q1(db, `SELECT count(*)::int n FROM producto p WHERE p.stock_disponible <> coalesce((SELECT m.stock_resultante FROM movimiento_kardex m
      WHERE m.producto_id=p.id AND m.motivo IS NOT NULL ORDER BY m.id DESC LIMIT 1), p.stock_disponible)`);
  resultado('Stock del producto = último stock_resultante', fin.n === 0, JSON.stringify(fin));

  // ================= 5. Inalterabilidad y compatibilidad CU09 (dev-erika) =================
  await esperaError(db, 'UPDATE del kárdex bloqueado (service_role)', 'service_role', SRV, `UPDATE movimiento_kardex SET cantidad = 1 WHERE id = 1`, [], /solo inserción/);
  await esperaError(db, 'TRUNCATE del kárdex bloqueado', 'service_role', SRV, `TRUNCATE movimiento_kardex`, [], /solo inserción/);
  await esperaError(db, 'TRUNCATE producto CASCADE (dueño) bloqueado por el kárdex', 'dueno', '', `TRUNCATE producto CASCADE`, [], /solo inserción/);
  await esperaError(db, 'UPDATE de COMPRA bloqueado (dueño)', 'dueno', '', `UPDATE compra SET total = 1`, [], /solo inserción/);
  await esperaError(db, 'DELETE de DETALLE_COMPRA bloqueado (dueño)', 'dueno', '', `DELETE FROM detalle_compra`, [], /solo inserción/);
  // Respaldo de venta de dev-erika: descuenta stock y luego inserta SALIDA sin motivo
  await db.exec(`UPDATE producto SET stock_disponible = stock_disponible - 4 WHERE id = 2`);
  const r9 = await esperaOk(db, 'CU09 (respaldo): INSERT SALIDA origen VENTA sin motivo → se completa', 'service_role', SRV,
    `INSERT INTO movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, origen_movimiento, observacion)
     VALUES (2, 2, 'SALIDA', 4, 900, 'VENTA', 'Venta NV-2026-00001') RETURNING id, motivo, stock_resultante::text`, [],
    (r) => (r.rows[0].motivo === 'VENTA' && r.rows[0].stock_resultante === '896.00') || JSON.stringify(r.rows[0]));
  const idVenta = r9 && r9.rows[0].id;
  await esperaOk(db, 'CU09 (respaldo): compensación con DELETE sigue permitida (P1 pendiente)', 'service_role', SRV, `DELETE FROM movimiento_kardex WHERE id = $1`, [idVenta]);
  await esperaOk(db, 'CU09 (respaldo): restaurar stock con UPDATE directo sigue permitido (P5 pendiente)', 'service_role', SRV, `UPDATE producto SET stock_disponible = stock_disponible + 4 WHERE id = 2`);
  await esperaOk(db, 'CU09 anulación: INSERT ENTRADA origen ANULACION_VENTA', 'service_role', SRV,
    `INSERT INTO movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, origen_movimiento)
     VALUES (2, 2, 'ENTRADA', 1, 900, 'ANULACION_VENTA') RETURNING motivo, stock_resultante::text`, [],
    (r) => (r.rows[0].motivo === 'ANULACION_VENTA' && r.rows[0].stock_resultante === '901.00') || JSON.stringify(r.rows[0]));
  await esperaOk(db, 'main ventas/service.ts: origen "venta:15"', 'service_role', SRV,
    `INSERT INTO movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, origen_movimiento)
     VALUES (2, 2, 'SALIDA', 1, 901, 'venta:15') RETURNING motivo`, [], (r) => r.rows[0].motivo === 'VENTA' || r.rows[0].motivo);
  await esperaOk(db, 'ordenes/service.ts: origen "orden_trabajo:3"', 'service_role', SRV,
    `INSERT INTO movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, origen_movimiento)
     VALUES (2, 3, 'SALIDA', 1, 900, 'orden_trabajo:3') RETURNING motivo`, [], (r) => r.rows[0].motivo === 'CONSUMO_OT' || r.rows[0].motivo);
  await esperaOk(db, 'Origen desconocido → SALIDA_OTRA (no rompe a terceros)', 'service_role', SRV,
    `INSERT INTO movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, origen_movimiento)
     VALUES (2, 2, 'SALIDA', 1, 899, 'devolucion_proveedor') RETURNING motivo`, [], (r) => r.rows[0].motivo === 'SALIDA_OTRA' || r.rows[0].motivo);
  await esperaError(db, 'INSERT directo de AJUSTE sin motivo: rechazado', 'service_role', SRV,
    `INSERT INTO movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior) VALUES (2, 1, 'AJUSTE', 5, 898)`, [], /fn_registrar_ajuste/);
  await esperaError(db, 'INSERT directo con motivo COMPRA sin compra: rechazado', 'service_role', SRV,
    `INSERT INTO movimiento_kardex (producto_id, usuario_id, tipo_movimiento, motivo, cantidad, stock_anterior) VALUES (2, 1, 'ENTRADA', 'COMPRA', 5, 898)`, [], /chk_kardex_compra/);
  await esperaError(db, 'INSERT directo con motivo HISTORICO: rechazado', 'service_role', SRV,
    `INSERT INTO movimiento_kardex (producto_id, usuario_id, tipo_movimiento, motivo, cantidad, stock_anterior) VALUES (2, 1, 'ENTRADA', 'HISTORICO', 5, 898)`, [], /HISTORICO/);
  await esperaError(db, 'INSERT directo SALIDA que deja stock negativo: rechazado', 'service_role', SRV,
    `INSERT INTO movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad, stock_anterior, origen_movimiento) VALUES (2, 1, 'SALIDA', 5, 2, 'VENTA')`, [], /chk_kardex_resultante/);

  // Código de producto
  await esperaError(db, 'Código de producto en minúsculas rechazado', 'dueno', '', `UPDATE producto SET codigo = 'cam-01' WHERE id = 1`, [], /chk_producto_codigo/);
  await db.exec(`UPDATE producto SET codigo = 'CAM-01' WHERE id = 1`);
  await esperaError(db, 'Código de producto duplicado rechazado', 'dueno', '', `UPDATE producto SET codigo = 'CAM-01' WHERE id = 2`, [], /uq_producto_codigo/);

  // ================= 6. Pendientes P1/P2 y re-ejecución posterior =================
  // COPIA de los bloques P1 y P2 comentados al final de migracion_cu16_inventario.sql.
  // Si se modifican allí, actualizar también aquí.
  try {
    await db.exec(`
      BEGIN;
      ALTER TABLE public.movimiento_kardex DISABLE TRIGGER trg_kardex_sin_update;
      UPDATE public.movimiento_kardex
         SET motivo = CASE
               WHEN tipo_movimiento = 'SALIDA'  AND stock_anterior - cantidad < 0 THEN 'HISTORICO'
               WHEN tipo_movimiento = 'SALIDA'  AND starts_with(upper(coalesce(origen_movimiento,'')), 'VENTA')         THEN 'VENTA'
               WHEN tipo_movimiento = 'SALIDA'  AND starts_with(upper(coalesce(origen_movimiento,'')), 'ORDEN_TRABAJO') THEN 'CONSUMO_OT'
               WHEN tipo_movimiento = 'ENTRADA' AND starts_with(upper(coalesce(origen_movimiento,'')), 'ANULACION_VENTA') THEN 'ANULACION_VENTA'
               ELSE 'HISTORICO' END,
             stock_resultante = CASE tipo_movimiento
               WHEN 'ENTRADA' THEN stock_anterior + cantidad
               WHEN 'SALIDA'  THEN stock_anterior - cantidad
               ELSE cantidad END
       WHERE motivo IS NULL;
      ALTER TABLE public.movimiento_kardex ENABLE TRIGGER trg_kardex_sin_update;
      ALTER TABLE public.movimiento_kardex VALIDATE CONSTRAINT chk_kardex_completo;
      ALTER TABLE public.movimiento_kardex ALTER COLUMN motivo SET NOT NULL;
      ALTER TABLE public.movimiento_kardex ALTER COLUMN stock_resultante SET NOT NULL;
      COMMIT;`);
    const h = await q1(db, `SELECT string_agg(motivo, ',' ORDER BY id) m FROM movimiento_kardex WHERE id <= 4`);
    resultado('P2 (relleno del histórico) se ejecuta y clasifica', h.m === 'HISTORICO,HISTORICO,CONSUMO_OT,HISTORICO', h.m);
  } catch (e) { resultado('P2 (relleno del histórico) se ejecuta', false, e.message); await db.exec('ROLLBACK').catch(() => {}); }
  await db.exec(leer('migracion_cu16_inventario.sql'));
  const cv = await q1(db, `SELECT convalidated FROM pg_constraint WHERE conname = 'chk_kardex_completo'`);
  resultado('Re-ejecutar CU16 tras P2 NO degrada chk_kardex_completo', cv.convalidated === true, JSON.stringify(cv));
  await db.exec(`CREATE TRIGGER trg_kardex_sin_delete BEFORE DELETE ON public.movimiento_kardex FOR EACH ROW EXECUTE FUNCTION private.fn_bloquear_modificacion();`);
  await esperaError(db, 'P1 activado: DELETE del kárdex bloqueado', 'service_role', SRV, `DELETE FROM movimiento_kardex WHERE id = 1`, [], /solo inserción/);

  // Riesgo: re-ejecutar seed.sql reabre escritura directa en COMPRA
  await db.exec(leer('seed.sql'));
  const reab = await q1(db, `SELECT has_table_privilege('service_role','public.compra','INSERT') ins`);
  resultado('RIESGO CONFIRMADO: re-ejecutar seed.sql devuelve INSERT en COMPRA a service_role', reab.ins === true, JSON.stringify(reab));
  await db.close();

  // ================= 7. Escenarios de CU14 / orden de ejecución =================
  db = await nuevaBD();
  await esperaError(db, 'CU15 antes que CU16: aborta', 'dueno', '', leer('migracion_cu15_compras.sql').replace(/NOTIFY.*$/m, ''), [], /ejecute primero migracion_cu16_inventario/);
  const sinCompra = await q1(db, `SELECT to_regclass('public.compra') c`);
  resultado('…y no deja nada creado', sinCompra.c === null, JSON.stringify(sinCompra));
  await db.close();

  db = await nuevaBD({ cu14Extra: `ALTER TABLE producto_proveedor ADD COLUMN stock_disponible numeric NOT NULL DEFAULT 0;
    ALTER TABLE proveedor ADD COLUMN estado boolean NOT NULL DEFAULT true; ALTER TABLE proveedor ADD COLUMN direccion varchar(255);
    ALTER TABLE producto_proveedor ADD COLUMN fecha_actualizacion timestamptz;` });
  try { await db.exec(leer('migracion_cu16_inventario.sql')); await db.exec(leer('migracion_cu15_compras.sql'));
    resultado('Con columnas de CU14 ya creadas (estado, stock_disponible con DEFAULT, fecha_actualizacion nullable): ambas migran', true); }
  catch (e) { resultado('Con columnas de CU14 ya creadas: ambas migran', false, e.message); }
  const f2 = await hoy(db);
  await esperaOk(db, '…y la compra funciona', 'service_role', SRV, compra, [1, 1, 'FACTURA', 'A-1', f2, JSON.stringify([{ producto_id: 1, cantidad: 1, costo_unitario: 1 }]), null, null]);
  await db.close();

  db = await nuevaBD({ cu14Extra: `ALTER TABLE producto_proveedor ADD COLUMN stock_disponible numeric NOT NULL DEFAULT 0; ALTER TABLE producto_proveedor ALTER COLUMN stock_disponible DROP DEFAULT;` });
  await db.exec(leer('migracion_cu16_inventario.sql'));
  await esperaError(db, 'CU14 con stock_disponible NOT NULL sin DEFAULT: CU15 aborta con mensaje', 'dueno', '', leer('migracion_cu15_compras.sql').replace(/NOTIFY.*$/m, ''), [], /NOT NULL sin DEFAULT no previstas: stock_disponible/);
  await db.close();

  db = await nuevaBD({ cu14Extra: `ALTER TABLE proveedor ADD COLUMN estado varchar(10) DEFAULT 'ACTIVO';` });
  await db.exec(leer('migracion_cu16_inventario.sql'));
  await esperaError(db, 'CU14 con proveedor.estado VARCHAR: CU15 aborta', 'dueno', '', leer('migracion_cu15_compras.sql').replace(/NOTIFY.*$/m, ''), [], /no es boolean/);
  await db.close();

  db = await nuevaBD({ cu14Extra: `ALTER TABLE producto_proveedor DROP CONSTRAINT uq_producto_proveedor;` });
  try { await db.exec(leer('migracion_cu16_inventario.sql')); await db.exec(leer('migracion_cu15_compras.sql')); resultado('Sin índice único en producto_proveedor: CU15 migra (solo advierte)', true); }
  catch (e) { resultado('Sin índice único en producto_proveedor: CU15 migra', false, e.message); }
  const f3 = await hoy(db);
  await esperaOk(db, '…y la compra crea/actualiza el vínculo sin duplicarlo', 'service_role', SRV,
    `SELECT public.fn_registrar_compra(1,1,'FACTURA','B-1',$1::date,'[{"producto_id":1,"cantidad":1,"costo_unitario":91},{"producto_id":2,"cantidad":1,"costo_unitario":3}]'::jsonb)`, [f3]);
  await esperaOk(db, '…segunda compra', 'service_role', SRV,
    `SELECT public.fn_registrar_compra(1,1,'FACTURA','B-2',$1::date,'[{"producto_id":2,"cantidad":1,"costo_unitario":4}]'::jsonb)`, [f3]);
  const dup = await q1(db, `SELECT count(*)::int n FROM producto_proveedor WHERE proveedor_id = 1 AND producto_id = 2`);
  resultado('…un solo vínculo (producto 2, proveedor 1)', dup.n === 1, JSON.stringify(dup));
  await db.close();

  // CU09: schema.sql ya define bitacora.ip (nullable). Se simula la variante
  // NOT NULL SIN DEFAULT que CU16 debe detectar y rechazar.
  db = await nuevaBD({ cu14Extra: `ALTER TABLE bitacora ADD COLUMN IF NOT EXISTS ip varchar(45);
    UPDATE bitacora SET ip = '' WHERE ip IS NULL;
    ALTER TABLE bitacora ALTER COLUMN ip SET NOT NULL;
    ALTER TABLE bitacora ALTER COLUMN ip DROP DEFAULT;` });
  await esperaError(db, 'Bitácora con columna IP NOT NULL sin DEFAULT: CU16 aborta', 'dueno', '', leer('migracion_cu16_inventario.sql').replace(/NOTIFY.*$/m, ''), [], /bitacora\.ip/);
  await db.close();

  db = await nuevaBD({ cu14Extra: `ALTER TABLE movimiento_kardex ADD COLUMN motivo text;` });
  await esperaError(db, 'Kárdex con "motivo" de otro tipo: CU16 aborta', 'dueno', '', leer('migracion_cu16_inventario.sql').replace(/NOTIFY.*$/m, ''), [], /tipo inesperado: movimiento_kardex\.motivo/);
  await db.close();

  console.log(log.join('\n'));
  console.log(`\nTOTAL: ${ok} pasan, ${fallos} fallan`);
  process.exitCode = fallos === 0 ? 0 : 1;
})().catch((e) => { console.log(log.join('\n')); console.error('ABORTO:', e); process.exitCode = 1; });
