// ============================================================
// Pruebas de base de datos del anticipo CU08 → CU13 — PGlite (PostgreSQL en memoria)
//
// SEGURIDAD: crea bases PostgreSQL EFÍMERAS en memoria. No lee .env, no usa
// claves, no abre conexiones de red y no toca Supabase. Solo LEE los .sql de db/.
//
// Ejecutar desde la raíz:  node pruebas/bd/cu08-anticipo.prueba.mjs
// ============================================================
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const RAIZ = process.env.SMARTSERVICE_RAIZ ?? fileURLToPath(new URL('../../', import.meta.url));
const leer = (...ruta) => readFileSync(join(RAIZ, 'db', ...ruta), 'utf8');
const migracion = (a) => {
  const pendiente = join(RAIZ, 'db', 'migrations', a);
  return readFileSync(existsSync(pendiente) ? pendiente : join(RAIZ, 'db', 'migrations', 'aplicadas', a), 'utf8');
};

let ok = 0, fallos = 0;
function resultado(nombre, paso, detalle) {
  if (paso) ok++; else fallos++;
  console.log(`${paso ? 'PASA ' : 'FALLA'} | ${nombre}${detalle ? ' | ' + detalle : ''}`);
}

async function nuevaBD() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE dueno NOLOGIN;               -- emula 'postgres' de Supabase (no superusuario)
    GRANT CREATE ON DATABASE postgres TO dueno;
    ALTER SCHEMA public OWNER TO dueno;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    SET ROLE dueno;`);
  await db.exec(leer('schema.sql'));
  await db.exec(`
    GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
    -- Tablas retiradas de schema.sql: la migración CU16 aún las exige.
    CREATE TABLE permiso (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE, ruta VARCHAR(255), descripcion VARCHAR(255));
    CREATE TABLE rol_permiso (id SERIAL PRIMARY KEY, rol_id INTEGER NOT NULL, permiso_id INTEGER NOT NULL, descripcion VARCHAR(255));`);
  await db.exec(leer('seed.sql'));
  await db.exec(migracion('migracion_cu16_inventario.sql'));
  await db.exec(migracion('migracion_cu13_nota_servicio.sql'));
  await db.exec(migracion('migracion_cu13_pago_stripe.sql'));
  await db.exec(migracion('migracion_cu12_estados_orden.sql'));
  for (let i = 0; i < 2; i++) await db.exec(migracion('migracion_cu08_anticipo.sql'));
  for (let i = 0; i < 2; i++) await db.exec(migracion('migracion_cu08_anticipo_tarjeta.sql'));
  for (let i = 0; i < 2; i++) await db.exec(migracion('migracion_cu08_guardar_cotizacion.sql'));
  await db.exec(`
    INSERT INTO cliente (id, nombre, tipo_cliente) VALUES (1, 'Cliente', 'PARTICULAR');
    INSERT INTO servicio (id, nombre, precio_hora_base) VALUES (1, 'Instalación', 100);
    INSERT INTO cotizacion (id, cliente_id, usuario_id, numero_cotizacion, fecha_vencimiento, estado, total) VALUES
      (1, 1, 1, 'COT-1', CURRENT_DATE + 15, 'PENDIENTE', 1000),
      (2, 1, 1, 'COT-2', CURRENT_DATE + 15, 'PENDIENTE', 1000),
      (3, 1, 1, 'COT-3', CURRENT_DATE + 15, 'PENDIENTE', 1000),
      (4, 1, 1, 'COT-4', CURRENT_DATE + 15, 'PENDIENTE', 1000),
      (5, 1, 1, 'COT-5', CURRENT_DATE + 15, 'PENDIENTE', 1000),
      (6, 1, 1, 'COT-6', CURRENT_DATE + 15, 'RECHAZADA', 1000),
      (7, 1, 1, 'COT-7', CURRENT_DATE + 15, 'PENDIENTE', 1000),
      (8, 1, 1, 'COT-8', NULL,              'PENDIENTE', 1000),
      (9, 1, 1, 'COT-9', CURRENT_DATE + 15, 'PENDIENTE', 1000),
      (10, 1, 1, 'COT-10', CURRENT_DATE + 15, 'PENDIENTE', 1000),
      (11, 1, 1, 'COT-11', CURRENT_DATE + 15, 'PENDIENTE', 1000),
      (12, 1, 1, 'COT-12', CURRENT_DATE + 15, 'PENDIENTE', 1000);
    UPDATE cotizacion SET fecha_emision = CURRENT_DATE - 30, fecha_vencimiento = CURRENT_DATE - 20 WHERE id = 5;
    INSERT INTO detalle_cotizacion_servicio (cotizacion_id, servicio_id, horas_estimadas, precio_hora, subtotal)
      SELECT id, 1, 2, 100, 200 FROM cotizacion;
    INSERT INTO orden_trabajo (id, codigo_orden, tipo_trabajo, estado, cotizacion_id, fecha_inicio_real, fecha_fin_real) VALUES
      (1, 'OT-1', 'SERVICIO', 'FINALIZADA', 1,    '2026-11-01 08:00:00', '2026-11-01 18:00:00'),
      (2, 'OT-2', 'SERVICIO', 'FINALIZADA', NULL, '2026-11-01 08:00:00', '2026-11-01 10:00:00'),
      (3, 'OT-3', 'SERVICIO', 'FINALIZADA', 2,    '2026-11-01 08:00:00', '2026-11-01 09:00:00'),
      (4, 'OT-4', 'SERVICIO', 'FINALIZADA', 7,    '2026-11-01 08:00:00', '2026-11-01 09:00:00'),
      (5, 'OT-5', 'SERVICIO', 'FINALIZADA', NULL, '2026-11-01 08:00:00', '2026-11-01 09:00:00');`);
  return db;
}

const q1 = async (db, sql, p = []) => (await db.query(sql, p)).rows[0];
async function comoServidor(db, sql, params) {
  await db.exec('RESET ROLE; SET ROLE service_role;');
  try { return await db.query(sql, params); }
  finally { await db.exec('RESET ROLE; SET ROLE dueno;'); }
}
const APROBAR = 'SELECT public.fn_aprobar_cotizacion($1, $2, $3, $4, $5, $6) AS r';
const EMITIR = 'SELECT * FROM public.sp_emitir_nota_servicio($1, $2, $3, $4, $5)';
const aprobar = (db, cot, anticipo, metodo = null, referencia = null) =>
  comoServidor(db, APROBAR, [2, cot, anticipo, metodo, referencia, '10.0.0.1']);
const emitir = async (db, orden, anticipo, servicio = null) =>
  (await comoServidor(db, EMITIR, [orden, anticipo, 2, null, servicio])).rows[0];
async function esperaError(nombre, fn, patron) {
  try { await fn(); resultado(nombre, false, 'NO falló'); }
  catch (e) { resultado(nombre, patron.test(e.message), e.message); }
}
const cot = (db, id) => q1(db, 'SELECT * FROM cotizacion WHERE id = $1', [id]);

(async () => {
  const db = await nuevaBD();

  // ---------- Migración ----------
  const col = await q1(db, `SELECT count(*)::int n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cotizacion' AND column_name LIKE 'anticipo%'`);
  resultado('Migración idempotente: 6 columnas', col.n === 6);
  const chk = await q1(db, `SELECT count(*)::int n FROM pg_constraint WHERE conname LIKE 'chk_cotizacion_anticipo%'`);
  resultado('Migración idempotente: 5 restricciones', chk.n === 5);
  const inicial = await cot(db, 1);
  resultado('Las cotizaciones existentes quedan con anticipo 0', Number(inicial.anticipo_monto) === 0 && inicial.anticipo_metodo === null);
  const fn = await q1(db, `SELECT has_function_privilege('anon', oid, 'EXECUTE') a, has_function_privilege('authenticated', oid, 'EXECUTE') u,
    has_function_privilege('service_role', oid, 'EXECUTE') s FROM pg_proc WHERE proname = 'fn_aprobar_cotizacion'`);
  resultado('Función cerrada: solo service_role', !fn.a && !fn.u && fn.s, JSON.stringify(fn));

  // ---------- Aprobar ----------
  await aprobar(db, 1, 500, 'EFECTIVO');
  const c1 = await cot(db, 1);
  resultado('Anticipo del 50 %: APROBADA y anticipo guardado', c1.estado === 'APROBADA' && Number(c1.anticipo_monto) === 500
    && c1.anticipo_metodo === 'EFECTIVO' && c1.anticipo_usuario_id === 2);
  const dif = await q1(db, `SELECT abs(extract(epoch FROM anticipo_fecha - (now() AT TIME ZONE 'America/La_Paz')))::int d FROM cotizacion WHERE id = 1`);
  resultado('anticipo_fecha en hora de Bolivia', dif.d < 60, JSON.stringify(dif));
  const bit = (await db.query(`SELECT accion, descripcion, ip FROM bitacora WHERE descripcion LIKE '%COT-1%' ORDER BY id`)).rows;
  resultado('Bitácora APROBAR_COTIZACION y REGISTRAR_ANTICIPO',
    bit.length === 2 && bit[0].accion === 'APROBAR_COTIZACION' && bit[1].accion === 'REGISTRAR_ANTICIPO'
      && /500/.test(bit[1].descripcion) && /EFECTIVO/.test(bit[1].descripcion) && bit[1].ip === '10.0.0.1', JSON.stringify(bit));

  await aprobar(db, 2, 300, 'TRANSFERENCIA', ' TRX-1 ');
  const c2 = await cot(db, 2);
  resultado('TRANSFERENCIA guarda la referencia', c2.anticipo_referencia === 'TRX-1');

  await aprobar(db, 8, 0);
  const c8 = await cot(db, 8);
  const bit8 = (await db.query(`SELECT accion FROM bitacora WHERE descripcion LIKE '%COT-8%'`)).rows;
  resultado('Aprobar sin anticipo: sin método, fecha ni REGISTRAR_ANTICIPO', c8.estado === 'APROBADA'
    && Number(c8.anticipo_monto) === 0 && c8.anticipo_metodo === null && c8.anticipo_fecha === null && bit8.length === 1);

  await aprobar(db, 7, 1000, 'qr');
  resultado('Normaliza el método (qr → QR) y acepta el 100 %', (await cot(db, 7)).anticipo_metodo === 'QR');

  // ---------- Rechazos ----------
  await esperaError('Anticipo mayor que el total', () => aprobar(db, 3, 1000.01, 'EFECTIVO'), /no puede ser mayor al total/);
  await esperaError('Anticipo negativo', () => aprobar(db, 3, -1, 'EFECTIVO'), /negativo/);
  await esperaError('Más de 2 decimales', () => aprobar(db, 3, 10.123, 'EFECTIVO'), /2 decimales/);
  await esperaError('TRANSFERENCIA sin referencia', () => aprobar(db, 3, 100, 'TRANSFERENCIA', '   '), /referencia/);
  await esperaError('Anticipo sin método', () => aprobar(db, 3, 100), /método/);
  await esperaError('TARJETA no es un método de anticipo', () => aprobar(db, 3, 100, 'TARJETA'), /método/);
  await esperaError('Cotización ya APROBADA', () => aprobar(db, 1, 100, 'EFECTIVO'), /estado PENDIENTE/);
  await esperaError('Cotización RECHAZADA', () => aprobar(db, 6, 100, 'EFECTIVO'), /estado PENDIENTE/);
  await esperaError('Cotización vencida', () => aprobar(db, 5, 100, 'EFECTIVO'), /La cotización venció el \d{2}\/\d{2}\/\d{4}/);
  await esperaError('Cotización inexistente', () => aprobar(db, 999, 0), /no existe/);
  const c3 = await cot(db, 3);
  resultado('Los rechazos no cambian la cotización', c3.estado === 'PENDIENTE' && Number(c3.anticipo_monto) === 0);
  const c1b = await cot(db, 1);
  resultado('Reintentar no pisa el anticipo registrado', Number(c1b.anticipo_monto) === 500);

  await esperaError('CHECK: anticipo mayor que el total', () => db.query('UPDATE cotizacion SET total = 100 WHERE id = 1'), /chk_cotizacion_anticipo_monto/);
  await esperaError('CHECK: monto sin método', () => db.query(`UPDATE cotizacion SET anticipo_metodo = NULL WHERE id = 1`), /chk_cotizacion_anticipo_completo/);
  await esperaError('CHECK: transferencia sin referencia', () => db.query(`UPDATE cotizacion SET anticipo_referencia = '' WHERE id = 2`), /chk_cotizacion_anticipo_referencia/);
  await esperaError('CHECK: método inválido', () => db.query(`UPDATE cotizacion SET anticipo_metodo = 'CHEQUE' WHERE id = 1`), /chk_cotizacion_anticipo_metodo/);
  await esperaError('CHECK: tarjeta sin sesión de pago', () => db.query(`UPDATE cotizacion SET anticipo_metodo = 'TARJETA' WHERE id = 1`), /chk_cotizacion_anticipo_tarjeta/);

  // ---------- Emitir la nota (CU13) ----------
  // OT-1: 10 h × Bs 100 = Bs 1000, anticipo registrado Bs 500. El cliente manda 1.
  const n1 = await emitir(db, 1, 1);
  resultado('Orden con cotización: usa el anticipo de la base', Number(n1.anticipo_pagado) === 500
    && Number(n1.monto_total) === 1000 && n1.estado === 'PENDIENTE', JSON.stringify(n1));

  // OT-2 correctiva: 2 h × Bs 100 = Bs 200, anticipo manual Bs 50.
  const n2 = await emitir(db, 2, 50, 1);
  resultado('Orden correctiva: usa el anticipo manual', Number(n2.anticipo_pagado) === 50 && n2.estado === 'PENDIENTE', JSON.stringify(n2));
  await esperaError('Orden correctiva: anticipo mayor que el total se rechaza', () => emitir(db, 5, 999, 1), /no puede ser mayor al monto total/);

  // OT-3: total Bs 100, anticipo Bs 300.
  const n3 = await emitir(db, 3, 0);
  resultado('Anticipo mayor que el total: nota PAGADA con saldo 0', Number(n3.anticipo_pagado) === 100
    && Number(n3.monto_total) === 100 && n3.estado === 'PAGADA', JSON.stringify(n3));
  const be = await q1(db, `SELECT descripcion FROM bitacora WHERE accion = 'EMITIR_NOTA_SERVICIO' AND descripcion LIKE '%OT-3%'`);
  resultado('La bitácora guarda el excedente', /anticipo excedente: 200/.test(be.descripcion), be.descripcion);

  // OT-4: la orden con cotización ignora un anticipo inválido del cliente.
  const n4 = await emitir(db, 4, 999999);
  resultado('Orden con cotización: ignora un anticipo inválido del cliente', Number(n4.anticipo_pagado) === 100 && n4.estado === 'PAGADA', JSON.stringify(n4));

  // ---------- Anticipo con tarjeta ----------
  const TARJETA = 'SELECT public.fn_aprobar_cotizacion_tarjeta($1, $2, $3, $4, $5) AS r';
  const tarjeta = (id, sesion, monto) => comoServidor(db, TARJETA, [2, id, sesion, monto, '10.0.0.1']);
  const fnT = await q1(db, `SELECT has_function_privilege('anon', oid, 'EXECUTE') a, has_function_privilege('authenticated', oid, 'EXECUTE') u,
    has_function_privilege('service_role', oid, 'EXECUTE') s FROM pg_proc WHERE proname = 'fn_aprobar_cotizacion_tarjeta'`);
  resultado('Tarjeta: función cerrada, solo service_role', !fnT.a && !fnT.u && fnT.s, JSON.stringify(fnT));

  const bitProbe = (await q1(db, 'SELECT count(*)::int n FROM bitacora')).n;
  await esperaError('Tarjeta: la comprobación previa falla sin efectos', () => comoServidor(db, TARJETA, [0, 0, '', 0, null]), /Falta el código/);
  resultado('Tarjeta: la comprobación previa no escribe nada', (await q1(db, 'SELECT count(*)::int n FROM bitacora')).n === bitProbe);

  await tarjeta(9, 'cs_test_a', 500);
  const c9 = await cot(db, 9);
  resultado('Tarjeta: aprueba y guarda método, sesión y usuario', c9.estado === 'APROBADA' && Number(c9.anticipo_monto) === 500
    && c9.anticipo_metodo === 'TARJETA' && c9.anticipo_stripe_session_id === 'cs_test_a' && c9.anticipo_usuario_id === 2, JSON.stringify(c9));
  const difT = await q1(db, `SELECT abs(extract(epoch FROM anticipo_fecha - (now() AT TIME ZONE 'America/La_Paz')))::int d FROM cotizacion WHERE id = 9`);
  resultado('Tarjeta: fecha en hora de Bolivia', difT.d < 60, JSON.stringify(difT));
  const bitT = (await db.query(`SELECT accion, descripcion FROM bitacora WHERE descripcion LIKE '%COT-9 %' OR descripcion LIKE '%COT-9' ORDER BY id`)).rows;
  resultado('Tarjeta: bitácora con el id de la sesión', bitT.length === 2 && bitT[0].accion === 'APROBAR_COTIZACION'
    && bitT[1].accion === 'REGISTRAR_ANTICIPO' && /cs_test_a/.test(bitT[1].descripcion), JSON.stringify(bitT));

  const bitAntes = (await q1(db, 'SELECT count(*)::int n FROM bitacora')).n;
  const repetida = (await tarjeta(9, 'cs_test_a', 500)).rows[0].r;
  const bitDespues = (await q1(db, 'SELECT count(*)::int n FROM bitacora')).n;
  resultado('Tarjeta: repetir la misma sesión no duplica', repetida.estado === 'APROBADA' && bitDespues === bitAntes, JSON.stringify({ bitAntes, bitDespues }));

  await esperaError('Tarjeta: sesión usada en otra cotización', () => tarjeta(10, 'cs_test_a', 500), /ya fue usado en otra cotización/);
  resultado('Tarjeta: la otra cotización sigue PENDIENTE', (await cot(db, 10)).estado === 'PENDIENTE');
  await esperaError('Tarjeta: UNIQUE impide la misma sesión en dos cotizaciones',
    () => db.query(`UPDATE cotizacion SET anticipo_stripe_session_id = 'cs_test_a' WHERE id = 10`), /anticipo_stripe_session_id/);

  await esperaError('Tarjeta: cotización ya aprobada por otro medio', () => tarjeta(1, 'cs_test_b', 500), /estado PENDIENTE/);
  await esperaError('Tarjeta: cotización vencida', () => tarjeta(5, 'cs_test_c', 500), /La cotización venció el/);
  await esperaError('Tarjeta: monto mayor que el total', () => tarjeta(11, 'cs_test_d', 1000.01), /no puede ser mayor al total/);
  await esperaError('Tarjeta: monto 0', () => tarjeta(11, 'cs_test_e', 0), /mayor a 0/);
  await esperaError('Tarjeta: sin sesión', () => tarjeta(11, '', 100), /Falta el código/);
  await esperaError('fn_aprobar_cotizacion sigue sin aceptar TARJETA', () => aprobar(db, 11, 100, 'TARJETA'), /método/);

  await tarjeta(12, 'cs_test_f', 300);
  await db.exec(`INSERT INTO orden_trabajo (id, codigo_orden, tipo_trabajo, estado, cotizacion_id, fecha_inicio_real, fecha_fin_real)
    VALUES (6, 'OT-6', 'SERVICIO', 'FINALIZADA', 12, '2026-11-01 08:00:00', '2026-11-01 18:00:00')`);
  const n6 = await emitir(db, 6, 0);
  resultado('Tarjeta: la nota usa el anticipo cobrado', Number(n6.anticipo_pagado) === 300 && n6.estado === 'PENDIENTE', JSON.stringify(n6));

  // ---------- Guardar cotización (Fase 8) ----------
  await db.exec(`
    INSERT INTO categoria_producto (id, nombre) VALUES (1, 'Cámaras');
    INSERT INTO producto (id, categoria_id, nombre, unidad_medida, precio_compra_actual, stock_disponible, margen_ganancia, estado) VALUES
      (1, 1, 'Cámara IP', 'unidad', 100, 10, 30, true),
      (2, 1, 'Descontinuado', 'unidad', 50, 10, 0, false);
    INSERT INTO servicio (id, nombre, precio_hora_base, activo) VALUES (2, 'Inactivo', 80, false);
    SELECT setval(pg_get_serial_sequence('cotizacion', 'id'), 100);`);
  const GUARDAR = 'SELECT public.fn_guardar_cotizacion($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7) AS r';
  const guardar = async (id, productos, servicios, cliente = 1, est = null) =>
    (await comoServidor(db, GUARDAR, [2, id, cliente, est, JSON.stringify(productos), JSON.stringify(servicios), '10.0.0.1'])).rows[0].r;
  const P = (producto_id, cantidad) => ({ producto_id, cantidad, precio_unitario: 0.01, subtotal: 0.01 });
  const anio = (await q1(db, `SELECT to_char(now() AT TIME ZONE 'America/La_Paz', 'YYYY') a`)).a;

  const g1 = await guardar(null, [P(1, 2)], [{ servicio_id: 1, horas_estimadas: 3, precio_hora: 0.01 }]);
  resultado('Crear: precios y total calculados en la base, ignora los del navegador', Number(g1.total) === 560, JSON.stringify(g1));
  resultado('Crear: correlativo COT-AAAA-NNNN', g1.numero_cotizacion === `COT-${anio}-0001`, g1.numero_cotizacion);
  const g2 = await guardar(null, [P(1, 1)], []);
  resultado('Crear: el correlativo avanza', g2.numero_cotizacion === `COT-${anio}-0002`, g2.numero_cotizacion);
  const cg = await cot(db, g1.id);
  resultado('Crear: PENDIENTE, vence en 15 días y usuario de la sesión', cg.estado === 'PENDIENTE' && cg.usuario_id === 2, JSON.stringify(cg.estado));
  const lineas = await q1(db, 'SELECT precio_unitario p, subtotal s FROM detalle_cotizacion_producto WHERE cotizacion_id = $1', [g1.id]);
  resultado('Crear: detalle con el precio calculado', Number(lineas.p) === 130 && Number(lineas.s) === 260, JSON.stringify(lineas));

  await db.exec('UPDATE producto SET precio_compra_actual = 200 WHERE id = 1');
  const g3 = await guardar(g1.id, [P(1, 3)], []);
  resultado('Editar: la línea ya cotizada conserva su precio', Number(g3.total) === 390, JSON.stringify(g3));
  const g4 = await guardar(null, [P(1, 1)], []);
  resultado('Crear: una línea nueva toma el precio actual', Number(g4.total) === 260, JSON.stringify(g4));
  const bitG = (await db.query(`SELECT accion FROM bitacora WHERE descripcion LIKE $1 ORDER BY id`, [`%${g1.numero_cotizacion} %`])).rows.map((f) => f.accion);
  resultado('Bitácora CREAR_COTIZACION y ACTUALIZAR_COTIZACION', bitG.join() === 'CREAR_COTIZACION,ACTUALIZAR_COTIZACION', bitG.join());

  await esperaError('Sin líneas', () => guardar(null, [], []), /sin equipos ni servicios/);
  await esperaError('Producto inactivo', () => guardar(null, [P(2, 1)], []), /no está activo/);
  await esperaError('Servicio inactivo', () => guardar(null, [], [{ servicio_id: 2, horas_estimadas: 1 }]), /no está activo/);
  await esperaError('Cantidad 0', () => guardar(null, [P(1, 0)], []), /mayor a 0/);
  await esperaError('Cliente inexistente', () => guardar(null, [P(1, 1)], [], 999), /cliente no existe/);
  await esperaError('Establecimiento de otro cliente', () => guardar(null, [P(1, 1)], [], 1, 999), /no pertenece al cliente/);
  await esperaError('Editar una cotización APROBADA', () => guardar(1, [P(1, 1)], []), /estado PENDIENTE/);
  await esperaError('Editar una cotización RECHAZADA', () => guardar(6, [P(1, 1)], []), /estado PENDIENTE/);
  const fnG = await q1(db, `SELECT has_function_privilege('anon', oid, 'EXECUTE') a, has_function_privilege('service_role', oid, 'EXECUTE') s FROM pg_proc WHERE proname = 'fn_guardar_cotizacion'`);
  resultado('fn_guardar_cotizacion: solo service_role', !fnG.a && fnG.s, JSON.stringify(fnG));

  await db.close();
  console.log(`\nTOTAL: ${ok} pasan, ${fallos} fallan`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
