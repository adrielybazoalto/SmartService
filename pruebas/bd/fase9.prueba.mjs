// ============================================================
// Pruebas de la Fase 9 (Ciclo 1 y bitácora) — PGlite (PostgreSQL en memoria)
//
// SEGURIDAD: crea bases PostgreSQL EFÍMERAS en memoria. No lee .env, no usa
// claves, no abre conexiones de red y no toca Supabase.
//
// Ejecutar desde la raíz:  node pruebas/bd/fase9.prueba.mjs
// ============================================================
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import '../inventario/cargador-ts.mjs';

const { normalizarIp } = await import('@/lib/ip');
const { ACCIONES_BITACORA } = await import('@/backend/bitacora/acciones');

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
async function falla(nombre, fn, patron) {
  try { await fn(); resultado(nombre, false, 'NO falló'); }
  catch (e) { resultado(nombre, patron.test(e.message), e.message); }
}

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
  for (let i = 0; i < 2; i++) await db.exec(migracion('migracion_fase9_ciclo1.sql'));
  return db;
}
const q1 = async (db, sql, p = []) => (await db.query(sql, p)).rows[0];

(async () => {
  const db = await nuevaBD();
  const SOL = 'SELECT public.fn_registrar_token_recuperacion($1, $2, $3, $4, $5)';
  const USAR = 'SELECT public.fn_restablecer_contrasena($1, $2, $3)';
  const solicitar = (hash, u = 1) => db.query(SOL, [u, hash, 15, 'a@b.bo', '10.0.0.1']);
  const antes = await q1(db, 'SELECT version_sesion v, contrasena c FROM usuario WHERE id = 1');

  // ---------- CU02 ----------
  await solicitar('token-1');
  resultado('Solicitar: guarda el token y deja bitácora',
    (await q1(db, `SELECT count(*)::int n FROM bitacora WHERE accion = 'SOLICITAR_RECUPERACION'`)).n === 1);
  await falla('Solicitar: una vez cada 60 s', () => solicitar('token-2'), /Espere un minuto/);
  await db.exec(`UPDATE token_recuperacion SET fecha_creacion = fecha_creacion - INTERVAL '2 minutes';`);
  await solicitar('token-3');
  resultado('Solicitar: invalida los enlaces anteriores',
    (await q1(db, `SELECT usado u FROM token_recuperacion WHERE hash_token = 'token-1'`)).u === true);
  await falla('Usar: un enlace invalidado no sirve', () => db.query(USAR, ['token-1', 'hash', null]), /Enlace expirado/);

  await db.query(USAR, ['token-3', 'hash-nuevo', '10.0.0.1']);
  const despues = await q1(db, 'SELECT version_sesion v, contrasena c FROM usuario WHERE id = 1');
  resultado('Usar: cambia la contraseña e invalida las sesiones', despues.c === 'hash-nuevo' && despues.v === antes.v + 1, JSON.stringify(despues));
  await falla('Usar: el enlace no se reutiliza', () => db.query(USAR, ['token-3', 'otro', null]), /Enlace expirado/);
  resultado('Usar: el fallo no cambia la contraseña', (await q1(db, 'SELECT contrasena c FROM usuario WHERE id = 1')).c === 'hash-nuevo');
  await db.exec(`UPDATE token_recuperacion SET fecha_creacion = fecha_creacion - INTERVAL '2 minutes';`);
  await solicitar('token-4');
  await db.exec(`UPDATE token_recuperacion SET fecha_expiracion = fecha_creacion - INTERVAL '1 minute' WHERE hash_token = 'token-4'`);
  await falla('Usar: el enlace vencido no sirve', () => db.query(USAR, ['token-4', 'x', null]), /Enlace expirado/);
  await falla('Usar: token inexistente', () => db.query(USAR, ['nada', 'x', null]), /Enlace expirado/);
  const fn = await q1(db, `SELECT bool_or(has_function_privilege('anon', oid, 'EXECUTE')) a FROM pg_proc
    WHERE proname IN ('fn_registrar_token_recuperacion', 'fn_restablecer_contrasena')`);
  resultado('Funciones cerradas al navegador', fn.a === false);

  // ---------- CU06 ----------
  await db.query(`INSERT INTO bitacora (usuario_id, accion) VALUES (1, 'INICIO_SESION')`);
  await falla('Bitácora: no se puede modificar', () => db.query(`UPDATE bitacora SET accion = 'X'`), /solo inserción/);
  await falla('Bitácora: no se puede borrar', () => db.query('DELETE FROM bitacora'), /solo inserción/);
  await falla('Bitácora: no se puede vaciar', () => db.query('TRUNCATE bitacora CASCADE'), /solo inserción/);

  resultado('IP: limpia el formato', normalizarIp(' ::ffff:190.181.25.10 ') === '190.181.25.10');
  resultado('IP: quita el puerto', normalizarIp('190.181.25.10:443') === '190.181.25.10');
  resultado('IP: IPv6 entre corchetes', normalizarIp('[2800:cd0::1]:8080') === '2800:cd0::1');
  resultado('IP: loopback o desconocida es null', [null, '', '::1', '127.0.0.1', 'localhost', 'abc<>'].every((v) => normalizarIp(v) === null));

  // ---------- CU07 ----------
  const col = await q1(db, `SELECT count(*)::int n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN ('cliente', 'establecimiento') AND column_name = 'estado'`);
  resultado('CU07: estado en cliente y establecimiento', col.n === 2);
  await db.query(`INSERT INTO cliente (id, nombre, tipo_cliente) VALUES (900, 'X', 'PARTICULAR')`);
  resultado('CU07: nace activo', (await q1(db, 'SELECT estado e FROM cliente WHERE id = 900')).e === true);
  await db.close();

  // ---------- Catálogo ----------
  const archivos = [];
  const recorrer = (d) => {
    for (const n of readdirSync(d)) {
      const r = join(d, n);
      if (statSync(r).isDirectory()) recorrer(r);
      else if (/\.tsx?$/.test(n)) archivos.push(r);
    }
  };
  recorrer(join(RAIZ, 'src'));
  const usadas = new Set();
  for (const a of archivos) {
    for (const m of readFileSync(a, 'utf8').matchAll(/accion:\s*'([A-Z_]+)'/g)) usadas.add(m[1]);
    for (const m of readFileSync(a, 'utf8').matchAll(/auditar\w*\([^)]*?'([A-Z]+_[A-Z_]+)'/g)) usadas.add(m[1]);
  }
  const faltan = [...usadas].filter((a) => !ACCIONES_BITACORA.includes(a));
  resultado('Catálogo: incluye las acciones que usa el código', faltan.length === 0, faltan.join(' '));
  resultado('Catálogo: sin nombres antiguos', !['REGISTRO_CLIENTE', 'ACTUALIZAR_CLIENTE'].some((a) => ACCIONES_BITACORA.includes(a)));
  resultado('Catálogo: sin duplicados', new Set(ACCIONES_BITACORA).size === ACCIONES_BITACORA.length);

  console.log(`\nTOTAL: ${ok} pasan, ${fallos} fallan`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
