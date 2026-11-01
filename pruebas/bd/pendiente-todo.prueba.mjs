// ============================================================
// Prueba del archivo EJECUTAR_TODO_PENDIENTE.sql — PGlite (en memoria)
//
// Reproduce el estado actual de Supabase (migraciones ya aplicadas) y ejecuta el
// archivo dos veces. No lee .env, no usa claves y no toca Supabase. Cuando el
// archivo se aplique y se borre, esta prueba termina sin hacer nada.
//
// Ejecutar desde la raíz:  node pruebas/bd/pendiente-todo.prueba.mjs
// ============================================================
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const archivo = join(RAIZ, 'db', 'migrations', 'EJECUTAR_TODO_PENDIENTE.sql');
if (!existsSync(archivo)) {
  console.log('No hay archivo pendiente.');
  process.exit(0);
}
const aplicada = (a) => readFileSync(join(RAIZ, 'db', 'migrations', 'aplicadas', a), 'utf8');

const db = new PGlite();
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE ROLE dueno NOLOGIN; GRANT CREATE ON DATABASE postgres TO dueno; ALTER SCHEMA public OWNER TO dueno;
  SET ROLE dueno;`);
await db.exec(readFileSync(join(RAIZ, 'db', 'schema.sql'), 'utf8'));
await db.exec(`
  CREATE TABLE permiso (id SERIAL PRIMARY KEY, nombre VARCHAR(100) UNIQUE, ruta VARCHAR(255), descripcion VARCHAR(255));
  CREATE TABLE rol_permiso (id SERIAL PRIMARY KEY, rol_id INTEGER NOT NULL, permiso_id INTEGER NOT NULL, descripcion VARCHAR(255));`);
await db.exec(readFileSync(join(RAIZ, 'db', 'seed.sql'), 'utf8'));
for (const a of ['migracion_cu16_inventario.sql', 'migracion_cu13_nota_servicio.sql', 'migracion_cu13_pago_stripe.sql',
  'migracion_cu12_estados_orden.sql', 'migracion_cu08_anticipo.sql', 'migracion_cu08_anticipo_tarjeta.sql']) {
  await db.exec(aplicada(a));
}

const sql = readFileSync(archivo, 'utf8');
for (let i = 0; i < 2; i++) await db.exec(sql);

const { rows } = await db.query(`SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') anon FROM pg_proc
  WHERE proname IN ('fn_guardar_permisos_rol', 'fn_crear_orden_trabajo', 'fn_guardar_cotizacion',
                    'fn_registrar_token_recuperacion', 'fn_restablecer_contrasena') ORDER BY 1`);
const estado = (await db.query(`SELECT count(*)::int n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN ('cliente', 'establecimiento') AND column_name = 'estado'`)).rows[0].n;
const triggers = (await db.query(`SELECT count(*)::int n FROM pg_trigger WHERE tgrelid = 'bitacora'::regclass AND NOT tgisinternal`)).rows[0].n;

const bien = rows.length === 5 && rows.every((r) => !r.anon) && estado === 2 && triggers === 2;
console.log(`${bien ? 'PASA ' : 'FALLA'} | Ejecutado dos veces: 5 funciones cerradas, 2 columnas, 2 triggers | ${rows.length} ${estado} ${triggers}`);
console.log(`TOTAL: ${bien ? 1 : 0} pasan, ${bien ? 0 : 1} fallan`);
process.exit(bien ? 0 : 1);
