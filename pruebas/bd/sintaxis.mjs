// ============================================================
// Verificación de SINTAXIS de los .sql de CU15 / CU16 con el parser real de
// PostgreSQL (libpg-query, WebAssembly). No ejecuta SQL ni se conecta a nada.
//
// Revisa: sentencias SQL, cuerpos PL/pgSQL de cada CREATE FUNCTION y de cada
// bloque DO. No comprueba existencia de tablas/columnas ni privilegios
// (eso lo hace cu15-cu16.prueba.mjs).
//
// Ejecutar desde la raíz:  node pruebas/bd/sintaxis.mjs [archivo.sql ...]
// ============================================================
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule, parseSync, parsePlPgSQLSync } from 'libpg-query';

const RAIZ = process.env.SMARTSERVICE_RAIZ ?? fileURLToPath(new URL('../../', import.meta.url));
const ARCHIVOS = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['diagnostico_cu15_cu16.sql', 'migracion_cu16_inventario.sql', 'migracion_cu15_compras.sql'];

// Los .sql viven en db/ (raíz, seeds, migrations, legacy, diagnostics).
const DIRS_SQL = ['', 'db', 'db/seeds', 'db/migrations', 'db/legacy', 'db/diagnostics'];
const leerSql = (archivo) => {
  for (const dir of DIRS_SQL) {
    const ruta = join(RAIZ, dir, archivo);
    if (existsSync(ruta)) return readFileSync(ruta, 'utf8');
  }
  throw new Error(`No se encontró el archivo SQL: ${archivo}`);
};

await loadModule();
let errores = 0;

for (const archivo of ARCHIVOS) {
  const sql = leerSql(archivo);
  // stmt_location / stmt_len son posiciones en BYTES UTF-8.
  const bytes = Buffer.from(sql, 'utf8');
  console.log(`=== ${archivo}`);

  let arbol;
  try {
    arbol = parseSync(sql);
  } catch (e) {
    errores++;
    console.log(`  SQL: ERROR — ${e.message}`);
    continue;
  }

  let funciones = 0;
  let bloquesDo = 0;
  for (const s of arbol.stmts) {
    const tipo = Object.keys(s.stmt)[0];
    const inicio = s.stmt_location ?? 0;
    const texto = bytes.subarray(inicio, s.stmt_len ? inicio + s.stmt_len : bytes.length).toString('utf8');

    if (tipo === 'CreateFunctionStmt') {
      funciones++;
      try {
        parsePlPgSQLSync(texto);
      } catch (e) {
        errores++;
        console.log(`  PL/pgSQL: ERROR en «${texto.slice(0, 90).replace(/\s+/g, ' ')}» — ${e.message}`);
      }
    } else if (tipo === 'DoStmt') {
      bloquesDo++;
      const cuerpo = s.stmt.DoStmt.args.find((a) => a.DefElem.defname === 'as').DefElem.arg.String.sval;
      try {
        parsePlPgSQLSync(`CREATE FUNCTION __bloque_do() RETURNS void LANGUAGE plpgsql AS $chk$${cuerpo}$chk$;`);
      } catch (e) {
        errores++;
        console.log(`  DO: ERROR en «${cuerpo.slice(0, 90).replace(/\s+/g, ' ')}» — ${e.message}`);
      }
    }
  }
  console.log(`  SQL: ${arbol.stmts.length} sentencias · PL/pgSQL: ${funciones} funciones, ${bloquesDo} bloques DO`);
}

console.log(errores === 0 ? '\nSINTAXIS: OK (0 errores)' : `\nSINTAXIS: ${errores} error(es)`);
process.exitCode = errores === 0 ? 0 : 1;
