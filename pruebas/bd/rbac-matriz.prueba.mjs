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
const MIGRACION = leer('migrations', 'migracion_rbac_ajuste_matriz.sql');

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
