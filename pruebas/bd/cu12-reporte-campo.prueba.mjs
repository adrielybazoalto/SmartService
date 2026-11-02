// ============================================================
// Pruebas de base de datos CU12 / CU13 / CU09 — PGlite (PostgreSQL en memoria)
//
// SEGURIDAD: crea bases PostgreSQL EFÍMERAS en memoria. No lee .env, no usa
// claves, no abre conexiones de red y no toca Supabase. Solo LEE los .sql de db/.
//
// Ejecutar desde la raíz:  node pruebas/bd/cu12-reporte-campo.prueba.mjs
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
  await db.exec(migracion('migracion_cu12_reporte_campo_v2.sql'));
  await db.exec(migracion('migracion_cu12_hora_bolivia.sql'));
  await db.exec(`
    INSERT INTO categoria_producto (id, nombre) VALUES (1, 'Cámaras');
    INSERT INTO producto (id, categoria_id, nombre, unidad_medida, precio_compra_actual, stock_disponible, margen_ganancia) VALUES
      (1, 1, 'Cámara IP', 'unidad', 100, 10, 30),
      (2, 1, 'Cable UTP', 'metro', 2, 3, 0);
    INSERT INTO orden_trabajo (id, codigo_orden, tipo_trabajo, estado, fecha_inicio_real) VALUES
      (1, 'OT-1', 'INSTALACION', 'EN_PROGRESO', now() - interval '2 hours'),
      (2, 'OT-2', 'INSTALACION', 'EN_PROGRESO', now() - interval '2 hours'),
      (3, 'OT-3', 'INSTALACION', 'EN_PROGRESO', now() - interval '2 hours'),
      (4, 'OT-4', 'INSTALACION', 'PROGRAMADA', NULL),
      (5, 'OT-5', 'INSTALACION', 'EN_PROGRESO', NULL),
      (6, 'OT-6', 'INSTALACION', 'EN_PROGRESO', now() - interval '2 hours'),
      (7, 'OT-7', 'INSTALACION', 'FINALIZADA', now() - interval '2 hours');
    INSERT INTO orden_trabajo_tecnico (orden_trabajo_id, usuario_id, es_lider) VALUES (6, 3, true);`);
  return db;
}

const q1 = async (db, sql, p = []) => (await db.query(sql, p)).rows[0];
const REPORTE = 'SELECT public.fn_procesar_reporte_campo($1, $2, $3::jsonb, $4, $5) AS r';

async function comoServidor(db, sql, params) {
  await db.exec(`RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);`);
  try { return await db.query(sql, params); }
  finally { await db.exec(`RESET ROLE; SET ROLE dueno; SELECT set_config('request.jwt.claims', '', false);`); }
}
async function reporte(db, orden, materiales, usuario = 1) {
  return (await comoServidor(db, REPORTE, [orden, 'Instalación correcta', JSON.stringify(materiales), usuario, '10.0.0.1'])).rows[0].r;
}
async function esperaError(nombre, fn, patron) {
  try { await fn(); resultado(nombre, false, 'NO falló'); }
  catch (e) { resultado(nombre, patron.test(e.message), e.message); }
}
const estado = async (db, id) => (await q1(db, 'SELECT estado FROM orden_trabajo WHERE id = $1', [id])).estado;
const stock = async (db, id) => Number((await q1(db, 'SELECT stock_disponible s FROM producto WHERE id = $1', [id])).s);
const kardex = async (db, orden) => (await q1(db, 'SELECT count(*)::int n FROM movimiento_kardex WHERE origen_movimiento = $1', [`orden_trabajo:${orden}`])).n;
const consumos = async (db, orden) => (await q1(db, 'SELECT count(*)::int n FROM detalle_consumo_material WHERE orden_trabajo_id = $1', [orden])).n;

(async () => {
  const db = await nuevaBD();

  // ---------- Reporte de campo ----------
  const r = await reporte(db, 1, [
    { producto_id: 1, cantidad_utilizada: 2, observacion: 'Fachada' },
    { producto_id: 2, cantidad_utilizada: 1.5 },
  ]);
  resultado('Con stock: la orden queda FINALIZADA', r.orden.estado === 'FINALIZADA' && (await estado(db, 1)) === 'FINALIZADA');
  resultado('Con stock: descuenta', (await stock(db, 1)) === 8 && (await stock(db, 2)) === 1.5);
  const mov = await q1(db, `SELECT tipo_movimiento, motivo, cantidad, stock_anterior, stock_resultante, observacion
                              FROM movimiento_kardex WHERE producto_id = 1 AND origen_movimiento = 'orden_trabajo:1'`);
  resultado('Con stock: kárdex CONSUMO_OT', mov?.tipo_movimiento === 'SALIDA' && mov.motivo === 'CONSUMO_OT'
    && Number(mov.stock_anterior) === 10 && Number(mov.stock_resultante) === 8 && mov.observacion === 'Fachada', JSON.stringify(mov));
  resultado('Con stock: detalle de consumo NUMERIC', (await consumos(db, 1)) === 2 && r.consumos.length === 2);
  const fin = await q1(db, `SELECT fecha_fin_real, observaciones_tecnico FROM orden_trabajo WHERE id = 1`);
  resultado('Fija fecha_fin_real y guarda el diagnóstico', fin.fecha_fin_real !== null && fin.observaciones_tecnico === 'Instalación correcta');
  const zona = await q1(db, `SELECT abs(extract(epoch FROM fecha_fin_real - (now() AT TIME ZONE 'America/La_Paz')))::int AS dif FROM orden_trabajo WHERE id = 1`);
  resultado('fecha_fin_real queda en hora de Bolivia', zona.dif < 60, JSON.stringify(zona));
  const bit = await q1(db, `SELECT count(*)::int n FROM bitacora WHERE accion = 'FINALIZAR_ORDEN_TRABAJO' AND ip = '10.0.0.1'`);
  resultado('Bitácora FINALIZAR_ORDEN_TRABAJO', bit.n === 1);

  await esperaError('Stock insuficiente: rechaza', () => reporte(db, 2, [
    { producto_id: 1, cantidad_utilizada: 1 },
    { producto_id: 2, cantidad_utilizada: 999 },
  ]), /Stock insuficiente/);
  resultado('Stock insuficiente: revierte TODO', (await stock(db, 1)) === 8 && (await stock(db, 2)) === 1.5
    && (await kardex(db, 2)) === 0 && (await consumos(db, 2)) === 0 && (await estado(db, 2)) === 'EN_PROGRESO');

  await reporte(db, 3, []);
  resultado('Sin materiales: finaliza igual', (await estado(db, 3)) === 'FINALIZADA' && (await kardex(db, 3)) === 0);

  await esperaError('Orden inexistente', () => reporte(db, 999, []), /No se encontró la orden/);
  await esperaError('Orden PROGRAMADA', () => reporte(db, 4, []), /Debe iniciar la labor antes de reportar/);
  await esperaError('Sin fecha_inicio_real', () => reporte(db, 5, []), /Debe iniciar la labor antes de reportar/);
  await esperaError('Orden ya finalizada', () => reporte(db, 7, []), /ya se encuentra finalizada/);

  await db.exec(`INSERT INTO usuario (id, rol_id, nombre, correo, contrasena)
    SELECT 900, rol_id, nombre, 'otro@tecnico.bo', contrasena FROM usuario WHERE id = 3`);
  await esperaError('Técnico no asignado', () => reporte(db, 6, [], 900), /no está asignado/);
  await reporte(db, 6, [], 3);
  resultado('Técnico asignado: finaliza', (await estado(db, 6)) === 'FINALIZADA');

  const fn = await q1(db, `SELECT prosecdef, proconfig::text cfg, has_function_privilege('anon', oid, 'EXECUTE') anon,
    has_function_privilege('service_role', oid, 'EXECUTE') srv, prosrc LIKE '%::TEXT%' t FROM pg_proc WHERE proname = 'fn_procesar_reporte_campo'`);
  resultado('Función DEFINER, search_path vacío, cerrada y sin ::TEXT',
    fn.prosecdef && fn.cfg.includes('search_path') && !fn.anon && fn.srv && !fn.t, JSON.stringify(fn));

  // ---------- Estados de la orden ----------
  await db.exec(`ALTER TABLE orden_trabajo DROP CONSTRAINT IF EXISTS chk_orden_estado;
    INSERT INTO orden_trabajo (id, codigo_orden, tipo_trabajo, estado) VALUES (8, 'OT-8', 'INSTALACION', 'COMPLETADA');`);
  for (let i = 0; i < 2; i++) await db.exec(migracion('migracion_cu12_estados_orden.sql'));
  resultado('COMPLETADA pasa a FINALIZADA', (await estado(db, 8)) === 'FINALIZADA');
  await esperaError('CHECK rechaza COMPLETADA', () => db.query(`UPDATE orden_trabajo SET estado = 'COMPLETADA' WHERE id = 8`), /chk_orden_estado/);
  await db.exec(`INSERT INTO orden_trabajo (id, codigo_orden, tipo_trabajo, estado, fecha_inicio_real, fecha_fin_real)
    VALUES (9, 'OT-9', 'INSTALACION', 'EN_PROGRESO', now() - interval '1 hour', now());
    INSERT INTO servicio (id, nombre, precio_hora_base) VALUES (1, 'Instalación', 50);`);
  const EMITIR = 'SELECT (public.sp_emitir_nota_servicio($1, $2, $3, $4, $5)).numero_nota AS n';
  await esperaError('CU13 rechaza orden EN_PROGRESO', () => comoServidor(db, EMITIR, [9, 0, 1, null, 1]), /estado Finalizada/);
  const nota = await comoServidor(db, EMITIR, [1, 0, 1, null, 1]);
  resultado('CU13 emite la nota de una orden FINALIZADA', /^NS-/.test(nota.rows[0].n), nota.rows[0].n);

  // ---------- CU09 solo productos ----------
  // schema.sql aún no trae esta columna de producción (se regenera en la Fase 10)
  await db.exec('ALTER TABLE venta ADD COLUMN IF NOT EXISTS tipo_pago VARCHAR(30)');
  await db.exec(migracion('migracion_metodos_pago.sql'));
  await db.exec(migracion('migracion_cu09_pago_stripe.sql'));
  for (let i = 0; i < 2; i++) await db.exec(migracion('migracion_cu09_solo_productos.sql'));
  await db.exec(`INSERT INTO cliente (id, nombre, tipo_cliente) VALUES (500, 'Cliente', 'PARTICULAR');
    INSERT INTO caja (usuario_id, monto_inicial, estado) VALUES (1, 100, 'ABIERTA');`);
  const VENTA = `SELECT public.fn_registrar_venta(1, 500, 'EFECTIVO', 'NOTA_VENTA', 0, $1::jsonb) AS r`;
  const MSG = /solo admite productos; los servicios se liquidan en la nota de servicio \(CU13\)/;
  await esperaError('CU09 rechaza servicio', () => comoServidor(db, VENTA, ['[{"servicio_id":1,"cantidad":1}]']), MSG);
  await esperaError('CU09 rechaza línea sin producto', () => comoServidor(db, VENTA, ['[{"cantidad":1}]']), MSG);
  await esperaError('CU09 rechaza producto + servicio', () => comoServidor(db, VENTA, ['[{"producto_id":1,"servicio_id":1,"cantidad":1}]']), MSG);
  const antes = await stock(db, 1);
  const venta = (await comoServidor(db, VENTA, ['[{"producto_id":1,"cantidad":2}]'])).rows[0].r;
  const kv = await q1(db, `SELECT motivo FROM movimiento_kardex WHERE producto_id = 1 ORDER BY id DESC LIMIT 1`);
  resultado('CU09 sigue vendiendo productos', venta.total === 260 && (await stock(db, 1)) === antes - 2 && kv.motivo === 'VENTA', JSON.stringify(venta));
  const TARJETA = `SELECT public.fn_registrar_venta_tarjeta('cs_1', 50, 1, 500, 'NOTA_VENTA', 0, '[{"servicio_id":1,"cantidad":1}]'::jsonb) AS r`;
  await esperaError('Tarjeta hereda el rechazo', () => comoServidor(db, TARJETA, []), MSG);

  await db.close();

  // ---------- Crear orden (Fase 7) ----------
  const dbO = await nuevaBD();
  for (let i = 0; i < 2; i++) await dbO.exec(migracion('migracion_cu12_crear_orden.sql'));
  await dbO.exec(`SELECT setval(pg_get_serial_sequence('orden_trabajo', 'id'), 100)`);
  await dbO.exec(`
    INSERT INTO cliente (id, nombre, tipo_cliente) VALUES (1, 'Cliente', 'PARTICULAR');
    INSERT INTO cotizacion (id, cliente_id, usuario_id, numero_cotizacion, estado, total) VALUES
      (1, 1, 1, 'COT-A', 'APROBADA', 100), (2, 1, 1, 'COT-B', 'PENDIENTE', 100), (3, 1, 1, 'COT-C', 'APROBADA', 100);`);
  const CREAR = 'SELECT public.fn_crear_orden_trabajo($1, $2, $3, $4, $5, $6) AS r';
  const crearOrden = async (cot, tipo, ini = '2026-11-03 09:00:00', fin = '2026-11-03 11:00:00') =>
    (await comoServidor(dbO, CREAR, [2, cot, tipo, ini, fin, '10.0.0.1'])).rows[0].r;
  const anio = (await q1(dbO, `SELECT to_char(now() AT TIME ZONE 'America/La_Paz', 'YYYY') a`)).a;
  const o1 = await crearOrden(1, null);
  resultado('Convertir: crea la orden PROGRAMADA con correlativo', o1.codigo_orden === `OT-${anio}-001` && o1.estado === 'PROGRAMADA' && o1.tipo_trabajo === 'SERVICIO', JSON.stringify(o1));
  resultado('La ventana se guarda tal cual, en hora de Bolivia', String(o1.fecha_inicio_programada).startsWith('2026-11-03T09:00:00'), String(o1.fecha_inicio_programada));
  const o2 = await crearOrden(null, 'Correctivo');
  resultado('Correctiva: sin cotización y con el siguiente correlativo', o2.codigo_orden === `OT-${anio}-002` && o2.cotizacion_id === null, JSON.stringify(o2));
  const varias = [await crearOrden(null, 'A'), await crearOrden(3, null)];
  resultado('Correlativos seguidos sin repetir', new Set(varias.map((o) => o.codigo_orden)).size === 2);
  const bitO = await q1(dbO, `SELECT count(*)::int n FROM bitacora WHERE accion = 'CREAR_ORDEN_TRABAJO'`);
  resultado('Bitácora CREAR_ORDEN_TRABAJO', bitO.n === 4, JSON.stringify(bitO));
  const espera = async (nombre, fn, patron) => {
    try { await fn(); resultado(nombre, false, 'NO falló'); }
    catch (e) { resultado(nombre, patron.test(e.message), e.message); }
  };
  await espera('Convertir dos veces la misma cotización', () => crearOrden(1, null), /Ya existe una Orden de Trabajo/);
  await espera('Cotización no aprobada', () => crearOrden(2, null), /estado APROBADA/);
  await espera('Cotización inexistente', () => crearOrden(999, null), /No se encontró la cotización/);
  await espera('Sin ventana', () => crearOrden(null, 'X', null, null), /ventana horaria es obligatoria/);
  await espera('Fin antes del inicio', () => crearOrden(null, 'X', '2026-11-03 11:00:00', '2026-11-03 09:00:00'), /posterior a la hora de inicio/);
  await espera('Correctiva sin tipo', () => crearOrden(null, '  '), /tipo de trabajo es obligatorio/);
  const fnO = await q1(dbO, `SELECT has_function_privilege('anon', oid, 'EXECUTE') a, has_function_privilege('service_role', oid, 'EXECUTE') s FROM pg_proc WHERE proname = 'fn_crear_orden_trabajo'`);
  resultado('Función cerrada: solo service_role', !fnO.a && fnO.s, JSON.stringify(fnO));
  await dbO.close();

  // ---------- Corrección de datos ----------
  const dbH = await nuevaBD();
  await dbH.exec(`
    INSERT INTO orden_trabajo (id, codigo_orden, tipo_trabajo, estado, fecha_inicio_real, fecha_fin_real) VALUES
      (10, 'OT-2026-006', 'SERVICIO', 'FINALIZADA', '2026-11-01 15:28:52', '2026-11-01 19:30:29.427503');
    INSERT INTO nota_servicio (id, orden_trabajo_id, numero_nota, anticipo_pagado, estado, monto_total, stripe_session_id)
      VALUES (2, 10, 'NS-2026-002', 350, 'PAGADA', 438.10, 'cs_test_prueba');
    INSERT INTO servicio (id, nombre, precio_hora_base) VALUES (70, 'Mano de obra', 70);`);
  await dbH.exec(`
    UPDATE orden_trabajo SET codigo_orden = 'OT-2026-001', estado = 'PROGRAMADA', fecha_inicio_real = NULL,
           fecha_inicio_programada = '2026-11-01 12:00:00', fecha_fin_programada = '2026-11-01 16:00:00' WHERE id = 5;
    UPDATE orden_trabajo SET codigo_orden = 'OT-PRUEBA-002', estado = 'FINALIZADA',
           fecha_inicio_real = '2026-10-28 14:49:08.234', fecha_fin_real = '2026-10-28 14:50:16.337' WHERE id = 2;
    UPDATE orden_trabajo SET fecha_inicio_programada = '2026-11-02 13:00:00', fecha_fin_programada = '2026-11-02 16:00:00' WHERE id = 3;`);
  for (let i = 0; i < 2; i++) await dbH.exec(migracion('migracion_cu12_correccion_horas.sql'));
  const texto = (c) => `to_char(${c}, 'YYYY-MM-DD HH24:MI:SS')`;
  const h5 = await q1(dbH, `SELECT ${texto('fecha_inicio_programada')} i, ${texto('fecha_fin_programada')} f FROM orden_trabajo WHERE id = 5`);
  resultado('Resta 4 horas una sola vez (ejecutada 2 veces)', h5.i === '2026-11-01 08:00:00' && h5.f === '2026-11-01 12:00:00', JSON.stringify(h5));
  const h2 = await q1(dbH, `SELECT ${texto('fecha_inicio_real')} i, ${texto('fecha_fin_real')} f FROM orden_trabajo WHERE id = 2`);
  resultado('Corrige las fechas reales de OT-PRUEBA-002', h2.i === '2026-10-28 10:49:08' && h2.f === '2026-10-28 10:50:16', JSON.stringify(h2));
  const h3 = await q1(dbH, `SELECT ${texto('fecha_inicio_programada')} i FROM orden_trabajo WHERE id = 3`);
  resultado('No toca otras órdenes', h3.i === '2026-11-02 13:00:00', JSON.stringify(h3));
  const h10 = await q1(dbH, `SELECT ${texto('fecha_fin_real')} f FROM orden_trabajo WHERE id = 10`);
  resultado('Corrige fecha_fin_real de OT-2026-006', h10.f === '2026-11-01 15:30:29', JSON.stringify(h10));
  const liq = await q1(dbH, 'SELECT horas_trabajadas h, costo_mano_obra m FROM fn_calcular_liquidacion(10, 70)');
  resultado('OT-2026-006 pasa a 0,03 h', Number(liq.h) === 0.03 && Number(liq.m) === 2.1, JSON.stringify(liq));

  const bitAntes = (await q1(dbH, 'SELECT count(*)::int n FROM bitacora')).n;
  for (let i = 0; i < 2; i++) await dbH.exec(migracion('migracion_cu13_borrar_nota_prueba.sql'));
  const borrada = await q1(dbH, 'SELECT count(*)::int n FROM nota_servicio WHERE id = 2');
  const bitNueva = await q1(dbH, `SELECT count(*)::int n FROM bitacora WHERE accion = 'ELIMINAR_NOTA_SERVICIO_PRUEBA'`);
  const bitDespues = (await q1(dbH, 'SELECT count(*)::int n FROM bitacora')).n;
  resultado('Borra la nota y deja un solo registro en bitácora (ejecutada 2 veces)',
    borrada.n === 0 && bitNueva.n === 1 && bitDespues === bitAntes + 1, JSON.stringify({ borrada, bitNueva }));
  await dbH.exec(`INSERT INTO nota_servicio (id, orden_trabajo_id, numero_nota, estado, monto_total) VALUES (3, 3, 'NS-2026-009', 'PENDIENTE', 1)`);
  await dbH.exec(migracion('migracion_cu13_borrar_nota_prueba.sql'));
  resultado('No borra otras notas', (await q1(dbH, 'SELECT count(*)::int n FROM nota_servicio WHERE id = 3')).n === 1);
  await dbH.close();
  console.log(`\nTOTAL: ${ok} pasan, ${fallos} fallan`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
