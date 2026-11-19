// ============================================================
// Pruebas del RF31 (hoja de vida automática al pagar la nota) — PGlite
//
// SEGURIDAD: crea bases PostgreSQL EFÍMERAS en memoria. No lee .env, no usa
// claves, no abre conexiones de red y no toca Supabase.
//
// Ejecutar desde la raíz:  node pruebas/bd/rf31-hoja-vida.prueba.mjs
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
const q1 = async (db, sql, p = []) => (await db.query(sql, p)).rows[0];
const n = async (db, sql, p = []) => (await q1(db, sql, p)).n;

async function nuevaBD() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE ROLE dueno NOLOGIN; GRANT CREATE ON DATABASE postgres TO dueno; ALTER SCHEMA public OWNER TO dueno;
    SET ROLE dueno;`);
  await db.exec(leer('schema.sql'));
  await db.exec(`
    CREATE TABLE permiso (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE, ruta VARCHAR(255), descripcion VARCHAR(255));
    CREATE TABLE rol_permiso (id SERIAL PRIMARY KEY, rol_id INTEGER NOT NULL, permiso_id INTEGER NOT NULL, descripcion VARCHAR(255));`);
  await db.exec(leer('seed.sql'));
  await db.exec(migracion('migracion_cu16_inventario.sql'));
  await db.exec(migracion('migracion_fase9_ciclo1.sql'));
  // Columnas del CU13 que schema.sql aún no refleja
  await db.exec(`ALTER TABLE nota_servicio ADD COLUMN IF NOT EXISTS fecha_pago TIMESTAMPTZ;`);
  // Datos base: cliente, establecimiento
  await db.exec(`
    INSERT INTO cliente (id, nombre, tipo_cliente) VALUES (100, 'Cliente RF31', 'NATURAL');
    INSERT INTO establecimiento (id, cliente_id, nombre_establecimiento, direccion) VALUES (100, 100, 'Sucursal RF31', 'Calle 1');`);
  return db;
}

// Cotización + OT finalizada; devuelve el id de la OT
let sec = 0;
async function ordenConCotizacion(db, { establecimiento = 100, finReal = '2026-11-01 21:55:00' } = {}) {
  sec++;
  const c = await q1(db, `INSERT INTO cotizacion (cliente_id, establecimiento_id, usuario_id, numero_cotizacion)
                          VALUES (100, $1, 1, $2) RETURNING id`, [establecimiento, `COT-T-${sec}`]);
  const o = await q1(db, `INSERT INTO orden_trabajo (cotizacion_id, codigo_orden, tipo_trabajo, estado, fecha_fin_real)
                          VALUES ($1, $2, 'SERVICIO', 'FINALIZADA', $3) RETURNING id`, [c.id, `OT-T-${sec}`, finReal]);
  return o.id;
}
// Emite la nota como lo hace sp_emitir_nota_servicio (nota y DESPUÉS su bitácora, en una transacción)
async function emitir(db, ordenId, estado, usuario = 2) {
  const { codigo_orden } = await q1(db, 'SELECT codigo_orden FROM orden_trabajo WHERE id = $1', [ordenId]);
  const numero = `NS-T-${ordenId}`;
  await db.transaction(async (tx) => {
    await tx.query(`INSERT INTO nota_servicio (orden_trabajo_id, numero_nota, estado, monto_total, fecha_emision)
                    VALUES ($1, $2, $3, 100, '2026-11-02')`, [ordenId, numero, estado]);
    await tx.query(`INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES ($1, 'EMITIR_NOTA_SERVICIO', $2)`,
      [usuario, `Nota ${numero} de la orden ${codigo_orden} | total: 100`]);
  });
  return numero;
}
// Liquida como sp_registrar_pago_manual_nota (UPDATE y DESPUÉS su bitácora)
async function pagar(db, numero, usuario = 3, fecha = '2026-11-03 02:30:00+00') {
  await db.transaction(async (tx) => {
    await tx.query(`UPDATE nota_servicio SET estado = 'PAGADA', fecha_pago = $2 WHERE numero_nota = $1`, [numero, fecha]);
    await tx.query(`INSERT INTO bitacora (usuario_id, accion, descripcion) VALUES ($1, 'PAGO_NOTA_SERVICIO', $2)`,
      [usuario, `Nota ${numero} pagada con EFECTIVO | saldo cobrado: Bs 50`]);
  });
}

(async () => {
  const db = await nuevaBD();

  // ---------- Datos existentes (antes de la migración) ----------
  const otPrevia = await ordenConCotizacion(db);
  await emitir(db, otPrevia, 'PAGADA', 2);
  const otPreviaPend = await ordenConCotizacion(db);
  await emitir(db, otPreviaPend, 'PENDIENTE', 2);
  await db.exec(`INSERT INTO orden_trabajo (id, codigo_orden, tipo_trabajo, estado) VALUES (900, 'OT-DIRECTA', 'CORRECTIVO', 'FINALIZADA');
                 INSERT INTO nota_servicio (orden_trabajo_id, numero_nota, estado, monto_total) VALUES (900, 'NS-DIRECTA', 'PAGADA', 10);`);

  for (let i = 0; i < 2; i++) await db.exec(migracion('migracion_rf31_hoja_vida.sql'));

  const s1 = await q1(db, 'SELECT * FROM sistema_instalado WHERE orden_trabajo_id = $1', [otPrevia]);
  resultado('Carga: crea el sistema de la nota ya PAGADA', !!s1 && s1.establecimiento_id === 100);
  resultado('Carga: nombre = tipo_trabajo - número de cotización', s1?.nombre_sistema === `SERVICIO - COT-T-1`, s1?.nombre_sistema);
  resultado('Carga: instalación = fecha_fin_real y próximo = +6 meses',
    s1?.fecha_instalacion.toISOString().slice(0, 10) === '2026-11-01'
      && s1?.fecha_proximo_mantenimiento.toISOString().slice(0, 10) === '2027-05-01' && s1?.periodicidad_meses === 6);
  resultado('Carga: re-ejecutar la migración no duplica',
    (await n(db, 'SELECT count(*)::int n FROM sistema_instalado WHERE orden_trabajo_id = $1', [otPrevia])) === 1);
  resultado('Carga: la nota PENDIENTE no genera sistema',
    (await n(db, 'SELECT count(*)::int n FROM sistema_instalado WHERE orden_trabajo_id = $1', [otPreviaPend])) === 0);
  resultado('Regla 3: OT sin ticket ni cotización no genera nada',
    (await n(db, 'SELECT count(*)::int n FROM sistema_instalado WHERE orden_trabajo_id = 900')) === 0);
  const b1 = await q1(db, `SELECT usuario_id, descripcion FROM bitacora WHERE accion = 'GENERAR_HOJA_VIDA' ORDER BY id LIMIT 1`);
  resultado('Carga: bitácora GENERAR_HOJA_VIDA a nombre de quien emitió', b1?.usuario_id === 2, b1?.descripcion);
  resultado('Carga: una sola entrada de bitácora tras dos ejecuciones',
    (await n(db, `SELECT count(*)::int n FROM bitacora WHERE accion = 'GENERAR_HOJA_VIDA'`)) === 1);

  // ---------- Trigger: nota PENDIENTE que se liquida ----------
  await pagar(db, `NS-T-${otPreviaPend}`, 3);
  const s2 = await q1(db, 'SELECT * FROM sistema_instalado WHERE orden_trabajo_id = $1', [otPreviaPend]);
  resultado('Liquidar: crea el sistema al pasar a PAGADA', !!s2);
  const b2 = await q1(db, `SELECT usuario_id FROM bitacora WHERE accion = 'GENERAR_HOJA_VIDA' ORDER BY id DESC LIMIT 1`);
  resultado('Liquidar: bitácora a nombre de quien cobró', b2?.usuario_id === 3, JSON.stringify(b2));
  const ultima = await q1(db, `SELECT accion FROM bitacora ORDER BY id DESC LIMIT 2 OFFSET 1`);
  resultado('Liquidar: la hoja de vida queda después del PAGO_NOTA_SERVICIO', ultima?.accion === 'PAGO_NOTA_SERVICIO');
  await db.query(`UPDATE nota_servicio SET estado = 'PAGADA' WHERE numero_nota = $1`, [`NS-T-${otPreviaPend}`]);
  resultado('Liquidar: PAGADA -> PAGADA no repite',
    (await n(db, `SELECT count(*)::int n FROM bitacora WHERE accion = 'GENERAR_HOJA_VIDA'`)) === 2);

  // ---------- Trigger: nota emitida ya PAGADA (anticipo cubre todo) ----------
  const otAnt = await ordenConCotizacion(db, { finReal: null });
  await emitir(db, otAnt, 'PAGADA', 2);
  const s3 = await q1(db, 'SELECT * FROM sistema_instalado WHERE orden_trabajo_id = $1', [otAnt]);
  resultado('Emitir PAGADA: crea el sistema (sin fin real usa fecha_emision)',
    s3?.fecha_instalacion.toISOString().slice(0, 10) === '2026-11-02', s3?.fecha_instalacion?.toISOString());

  // ---------- Cotización sin establecimiento: no revierte el cobro ----------
  const otSinEst = await ordenConCotizacion(db, { establecimiento: null });
  await emitir(db, otSinEst, 'PAGADA', 2);
  resultado('Sin establecimiento: la nota se guarda y no se crea sistema',
    (await n(db, `SELECT count(*)::int n FROM nota_servicio WHERE orden_trabajo_id = $1 AND estado = 'PAGADA'`, [otSinEst])) === 1
      && (await n(db, 'SELECT count(*)::int n FROM sistema_instalado WHERE orden_trabajo_id = $1', [otSinEst])) === 0);

  // ---------- Regla 1: tickets ----------
  await db.exec(`INSERT INTO sistema_instalado (id, establecimiento_id, nombre_sistema, fecha_instalacion, periodicidad_meses,
                   fecha_ultimo_mantenimiento, fecha_proximo_mantenimiento)
                 VALUES (500, 100, 'Cámaras', '2025-01-10', 3, '2025-06-01', '2025-09-01');
                 INSERT INTO mantenimiento_ticket (id, sistema_instalado_id, tipo_mantenimiento, descripcion_incidencia, estado)
                 VALUES (50, 500, 'PREVENTIVO', 'Revisión', 'EN_PROCESO'), (51, 500, 'CORRECTIVO', 'Falla', 'ABIERTO'),
                        (52, 500, 'CORRECTIVO', 'Cancelado', 'CANCELADO');
                 INSERT INTO orden_trabajo (id, mantenimiento_ticket_id, codigo_orden, tipo_trabajo, estado)
                 VALUES (950, 50, 'OT-TK-50', 'MANTENIMIENTO PREVENTIVO', 'FINALIZADA'),
                        (951, 51, 'OT-TK-51', 'MANTENIMIENTO CORRECTIVO', 'FINALIZADA'),
                        (952, 52, 'OT-TK-52', 'MANTENIMIENTO CORRECTIVO', 'FINALIZADA');`);
  const nt = await emitir(db, 950, 'PENDIENTE', 2);
  await pagar(db, nt, 3, '2026-11-03 02:30:00+00'); // 22:30 del 02/11 en Bolivia
  const sp = await q1(db, 'SELECT * FROM sistema_instalado WHERE id = 500');
  resultado('Preventivo: último = fecha de pago en hora de Bolivia',
    sp.fecha_ultimo_mantenimiento.toISOString().slice(0, 10) === '2026-11-02', sp.fecha_ultimo_mantenimiento.toISOString());
  resultado('Preventivo: próximo = último + periodicidad (3 meses)',
    sp.fecha_proximo_mantenimiento.toISOString().slice(0, 10) === '2027-02-02', sp.fecha_proximo_mantenimiento.toISOString());
  resultado('Preventivo: ticket RESUELTO', (await q1(db, 'SELECT estado FROM mantenimiento_ticket WHERE id = 50')).estado === 'RESUELTO');
  resultado('Preventivo: no crea un sistema nuevo',
    (await n(db, 'SELECT count(*)::int n FROM sistema_instalado WHERE orden_trabajo_id = 950')) === 0);
  const ba = await q1(db, `SELECT usuario_id FROM bitacora WHERE accion = 'ACTUALIZAR_HOJA_VIDA' ORDER BY id DESC LIMIT 1`);
  resultado('Preventivo: bitácora ACTUALIZAR_HOJA_VIDA', ba?.usuario_id === 3);

  await emitir(db, 951, 'PAGADA', 2);
  const sc = await q1(db, 'SELECT * FROM sistema_instalado WHERE id = 500');
  resultado('Correctivo: no cambia las fechas preventivas',
    sc.fecha_ultimo_mantenimiento.toISOString().slice(0, 10) === '2026-11-02'
      && sc.fecha_proximo_mantenimiento.toISOString().slice(0, 10) === '2027-02-02');
  resultado('Correctivo: ticket RESUELTO', (await q1(db, 'SELECT estado FROM mantenimiento_ticket WHERE id = 51')).estado === 'RESUELTO');
  await emitir(db, 952, 'PAGADA', 2);
  resultado('Ticket CANCELADO no cambia de estado', (await q1(db, 'SELECT estado FROM mantenimiento_ticket WHERE id = 52')).estado === 'CANCELADO');

  // ---------- Sin sesión: UPDATE manual sin bitácora del CU13 ----------
  const otManual = await ordenConCotizacion(db);
  await db.query(`INSERT INTO nota_servicio (orden_trabajo_id, numero_nota, estado, monto_total) VALUES ($1, 'NS-MANUAL', 'PENDIENTE', 5)`, [otManual]);
  await db.query(`UPDATE nota_servicio SET estado = 'PAGADA' WHERE numero_nota = 'NS-MANUAL'`);
  const bm = await q1(db, `SELECT usuario_id, descripcion FROM bitacora WHERE accion = 'GENERAR_HOJA_VIDA' ORDER BY id DESC LIMIT 1`);
  resultado('Sin sesión: usa el primer ADMINISTRADOR y lo indica', bm?.usuario_id === 1 && /sin sesión/.test(bm.descripcion), bm?.descripcion);

  // ---------- Privilegios ----------
  const priv = await q1(db, `SELECT bool_or(has_function_privilege(r, 'private.fn_hoja_vida_nota(integer)', 'EXECUTE')) a
                               FROM unnest(ARRAY['anon','authenticated','service_role']) r`);
  resultado('Nadie del API puede ejecutar fn_hoja_vida_nota', priv.a === false);

  console.log(`\n${ok} pasan, ${fallos} fallan`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
