// ============================================================
// Pruebas de la matriz de permisos (Fase 3) — PGlite (PostgreSQL en memoria)
//
// SEGURIDAD: crea bases PostgreSQL EFÍMERAS en memoria. No lee .env, no usa
// claves, no abre conexiones de red y no toca Supabase.
//
// Ejecutar desde la raíz:  node pruebas/bd/rbac-matriz.prueba.mjs
// ============================================================
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import '../inventario/cargador-ts.mjs';

const { MODULOS, moduloPorRuta, quitaModuloProtegido } = await import('@/lib/navigation');

const RAIZ = process.env.SMARTSERVICE_RAIZ ?? fileURLToPath(new URL('../../', import.meta.url));
const leer = (...ruta) => readFileSync(join(RAIZ, 'db', ...ruta), 'utf8');
const MIGRACION = leer('migrations', 'aplicadas', 'migracion_rbac_ajuste_matriz.sql');
const COMPLETA = leer('migrations', 'migracion_rbac_matriz_completa.sql');

let ok = 0, fallos = 0;
function resultado(nombre, paso, detalle) {
  if (paso) ok++; else fallos++;
  console.log(`${paso ? 'PASA ' : 'FALLA'} | ${nombre}${detalle ? ' | ' + detalle : ''}`);
}

async function nuevaBD() {
  const db = new PGlite();
  await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;');
  await db.exec(leer('schema.sql'));
  await db.exec(leer('seed.sql'));
  return db;
}
async function modulosDe(db, rol) {
  const { rows } = await db.query(`
    SELECT f.clave FROM rol_funcion rf
      JOIN rol r ON r.id = rf.rol_id JOIN funcion f ON f.id = rf.funcion_id JOIN accion a ON a.id = rf.accion_id
     WHERE r.nombre = $1 AND a.nombre = 'LEER' AND f.clave IS NOT NULL ORDER BY f.clave`, [rol]);
  return rows.map((f) => f.clave);
}
/** Módulos del menú (navigation.ts) a los que entra el rol, por ruta. */
const entra = (claves) => MODULOS.filter((m) => claves.includes(m.clave)).map((m) => m.ruta).sort();

// Tabla 3.2 del plan
const ENCARGADO = ['/asignar-tecnicos', '/clientes', '/compras', '/cotizaciones', '/inventario', '/liquidacion',
  '/ordenes-trabajo', '/perfil', '/personal-tecnico', '/proveedores', '/ventas'];
const TECNICO = ['/cotizaciones', '/ordenes-trabajo', '/perfil'];

(async () => {
  // ---------- Estado actual de producción: Jornadas sin clave y Encargado con Bitácora ----------
  const db = await nuevaBD();
  await db.exec(`
    DELETE FROM rol_funcion WHERE funcion_id = 4;
    UPDATE funcion SET clave = NULL, ruta = NULL WHERE id = 4;
    INSERT INTO rol_funcion (rol_id, funcion_id, accion_id, descripcion)
    SELECT 2, f.id, a.id, 'x' FROM funcion f, accion a WHERE f.clave = 'BITACORA' AND a.nombre = 'LEER'
    ON CONFLICT DO NOTHING;
    INSERT INTO rol_funcion (rol_id, funcion_id, accion_id, descripcion)
    SELECT 2, f.id, a.id, 'x' FROM funcion f, accion a WHERE f.clave = 'SERVICIOS' AND a.nombre = 'LEER'
    ON CONFLICT DO NOTHING;`);
  const antes = (await db.query('SELECT count(*)::int n FROM rol_funcion')).rows[0].n;
  await db.exec(MIGRACION);
  const una = (await db.query('SELECT count(*)::int n FROM rol_funcion')).rows[0].n;
  await db.exec(MIGRACION);
  const dos = (await db.query('SELECT count(*)::int n FROM rol_funcion')).rows[0].n;
  resultado('Migración idempotente', una === dos && una !== antes, JSON.stringify({ antes, una, dos }));

  const e = await modulosDe(db, 'ENCARGADO');
  const t = await modulosDe(db, 'TECNICO');
  const a = await modulosDe(db, 'ADMINISTRADOR');
  resultado('ADMINISTRADOR entra a todos los módulos', MODULOS.every((m) => a.includes(m.clave)));
  resultado('ENCARGADO entra a sus módulos, sin Usuarios, Roles, Bitácora ni Servicios',
    JSON.stringify(entra(e)) === JSON.stringify(ENCARGADO), entra(e).join(' '));
  resultado('TECNICO entra solo a Perfil, Cotizaciones y Órdenes', JSON.stringify(entra(t)) === JSON.stringify(TECNICO), entra(t).join(' '));
  resultado('TECNICO no entra a Personal Técnico', !t.includes('PERSONAL_TECNICO'));

  const acciones = (await db.query(`
    SELECT string_agg(a.nombre, ',' ORDER BY a.nombre) l FROM rol_funcion rf
      JOIN funcion f ON f.id = rf.funcion_id JOIN accion a ON a.id = rf.accion_id
     WHERE rf.rol_id = 2 AND f.clave = 'PERSONAL_TECNICO'`)).rows[0].l;
  resultado('ENCARGADO tiene LEER, CREAR, ACTUALIZAR y ELIMINAR en el CU10', acciones === 'ACTUALIZAR,CREAR,ELIMINAR,LEER', acciones);
  await db.close();

  // ---------- seed.sql produce la misma matriz ----------
  const dbSeed = await nuevaBD();
  const eSeed = await modulosDe(dbSeed, 'ENCARGADO');
  const tSeed = await modulosDe(dbSeed, 'TECNICO');
  resultado('seed.sql: misma matriz del ENCARGADO', JSON.stringify(eSeed) === JSON.stringify(e), eSeed.join(' '));
  resultado('seed.sql: misma matriz del TECNICO', JSON.stringify(tSeed) === JSON.stringify(t), tSeed.join(' '));
  const claves = (await dbSeed.query('SELECT clave FROM funcion WHERE clave IS NOT NULL')).rows.map((f) => f.clave);
  resultado('Todos los módulos del menú existen en FUNCION', MODULOS.every((m) => claves.includes(m.clave)));
  await dbSeed.close();

  // ---------- Matriz completa (Fase 5) ----------
  const dbM = await nuevaBD();
  for (let i = 0; i < 2; i++) await dbM.exec(COMPLETA);
  const acc = async (rol, clave) => (await dbM.query(`
    SELECT string_agg(a.nombre, ',' ORDER BY a.nombre) l FROM rol_funcion rf
      JOIN rol r ON r.id = rf.rol_id JOIN funcion f ON f.id = rf.funcion_id JOIN accion a ON a.id = rf.accion_id
     WHERE r.nombre = $1 AND f.clave = $2`, [rol, clave])).rows[0].l;
  resultado('Administrador: todas las acciones en Proveedores', (await acc('ADMINISTRADOR', 'PROVEEDORES')) === 'ACTUALIZAR,CREAR,ELIMINAR,LEER,PROCESAR');
  resultado('Encargado: puede emitir y cobrar notas', (await acc('ENCARGADO', 'NOTAS_SERVICIO')) === 'CREAR,LEER,PROCESAR');
  resultado('Encargado: asigna cuadrillas', (await acc('ENCARGADO', 'ASIGNAR_TECNICOS')) === 'ACTUALIZAR,LEER');
  resultado('Encargado: no elimina cotizaciones', !(await acc('ENCARGADO', 'COTIZACIONES')).includes('ELIMINAR'));
  resultado('Técnico: sin cambios en cotizaciones', (await acc('TECNICO', 'COTIZACIONES')) === 'LEER');

  const ids = async (rol) => (await dbM.query(`SELECT rf.funcion_id, rf.accion_id FROM rol_funcion rf JOIN rol r ON r.id = rf.rol_id
    JOIN funcion f ON f.id = rf.funcion_id WHERE r.nombre = $1 AND f.clave IS NOT NULL`, [rol])).rows;
  await dbM.exec('GRANT USAGE ON SCHEMA public TO service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;');
  // Corre como service_role, igual que en producción (la función usa una tabla temporal)
  const guardar = async (rolId, permisos) => {
    await dbM.exec('SET ROLE service_role');
    try { return await dbM.query('SELECT public.fn_guardar_permisos_rol(1, $1, $2::jsonb, NULL) AS n', [rolId, JSON.stringify(permisos)]); }
    finally { await dbM.exec('RESET ROLE'); }
  };
  const falla = async (nombre, fn, patron) => {
    try { await fn(); resultado(nombre, false, 'NO falló'); }
    catch (e) { resultado(nombre, patron.test(e.message), e.message); }
  };
  const filaSinClave = (await dbM.query(`SELECT count(*)::int n FROM rol_funcion rf JOIN funcion f ON f.id = rf.funcion_id WHERE rf.rol_id = 3 AND f.clave IS NULL`)).rows[0].n;
  const fn = await dbM.query(`SELECT id FROM funcion WHERE clave = 'CLIENTES'`);
  const crear = (await dbM.query(`SELECT id FROM accion WHERE nombre = 'CREAR'`)).rows[0].id;
  const leerId = (await dbM.query(`SELECT id FROM accion WHERE nombre = 'LEER'`)).rows[0].id;
  await guardar(3, [{ funcion_id: fn.rows[0].id, accion_id: crear }]);
  resultado('Guardar: una acción implica LEER', (await acc('TECNICO', 'CLIENTES')) === 'CREAR,LEER');
  resultado('Guardar: reemplaza lo anterior', (await acc('TECNICO', 'ORDENES_TRABAJO')) === null);
  resultado('Guardar: no toca funciones sin clave', (await dbM.query(`SELECT count(*)::int n FROM rol_funcion rf JOIN funcion f ON f.id = rf.funcion_id WHERE rf.rol_id = 3 AND f.clave IS NULL`)).rows[0].n === filaSinClave);
  const bitR = (await dbM.query(`SELECT count(*)::int n FROM bitacora WHERE accion = 'CONFIGURAR_ROLES_PERMISOS'`)).rows[0].n;
  resultado('Guardar: registra bitácora', bitR === 1);

  const adminAntes = JSON.stringify(await ids('ADMINISTRADOR'));
  await falla('Guardar: el Administrador no pierde Roles', () => guardar(1, [{ funcion_id: fn.rows[0].id, accion_id: leerId }]), /Administrador Principal no puede perder permisos/);
  resultado('Guardar: el rechazo revierte todo', JSON.stringify(await ids('ADMINISTRADOR')) === adminAntes);
  await falla('Guardar: permiso inexistente', () => guardar(3, [{ funcion_id: 9999, accion_id: leerId }]), /no existen en el sistema/);
  await falla('Guardar: rol inexistente', () => guardar(999, []), /no es válido/);
  resultado('Guardar: un fallo no cambia al Técnico', (await acc('TECNICO', 'CLIENTES')) === 'CREAR,LEER');
  await dbM.close();

  // ---------- navigation.ts ----------
  resultado('/personal-tecnico usa PERSONAL_TECNICO', moduloPorRuta('/personal-tecnico')?.clave === 'PERSONAL_TECNICO');
  resultado('/ordenes-trabajo sigue con ORDENES_TRABAJO', moduloPorRuta('/ordenes-trabajo')?.clave === 'ORDENES_TRABAJO');
  resultado('Cada ítem del menú tiene clave propia', new Set(MODULOS.map((m) => m.clave)).size === MODULOS.length);

  // ---------- Protección del Administrador (CU04) ----------
  resultado('Administrador sin ROLES: protegido', quitaModuloProtegido('ADMINISTRADOR', ['USUARIOS', 'PERFIL']));
  resultado('Administrador sin USUARIOS: protegido', quitaModuloProtegido('ADMINISTRADOR', ['ROLES', 'PERFIL']));
  resultado('Administrador con ambos: permitido', !quitaModuloProtegido('ADMINISTRADOR', ['ROLES', 'USUARIOS']));
  resultado('Otros roles no están protegidos', !quitaModuloProtegido('ENCARGADO', ['PERFIL']));

  console.log(`\nTOTAL: ${ok} pasan, ${fallos} fallan`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
