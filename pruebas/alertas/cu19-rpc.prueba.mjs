// ============================================================
// Pruebas de la EVALUACIÓN DIARIA del CU19 — PGlite (PostgreSQL en memoria)
//
// SEGURIDAD: crea una base PostgreSQL EFÍMERA. No lee .env, no usa claves,
// no abre conexiones de red y no toca Supabase.
//
// Verifica la migración propuesta (aún NO aplicada en el remoto):
//   - RBAC de ALERTAS_PREVENTIVAS.
//   - fn_generar_alertas_preventivas: umbral, idempotencia (doble invocación),
//     respeto de alertas leídas, ciclos nuevos y permiso de ejecución.
//   - Que el mensaje del SQL sea EXACTAMENTE el de la constante TypeScript.
//
// Ejecutar desde la raíz:  node pruebas/alertas/cu19-rpc.prueba.mjs
// ============================================================
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import '../inventario/cargador-ts.mjs'

const C = await import('@/backend/alertas/constantes')

const RAIZ = process.env.SMARTSERVICE_RAIZ ?? fileURLToPath(new URL('../../', import.meta.url))
const leer = (...ruta) => readFileSync(join(RAIZ, 'db', ...ruta), 'utf8')
const migracion = (archivo) => {
  const pendiente = join(RAIZ, 'db', 'migrations', archivo)
  return readFileSync(
    existsSync(pendiente) ? pendiente : join(RAIZ, 'db', 'migrations', 'aplicadas', archivo),
    'utf8',
  )
}

let ok = 0
let fallos = 0
function resultado(nombre, paso, detalle) {
  if (paso) ok++
  else fallos++
  console.log(`${paso ? 'PASA ' : 'FALLA'} | ${nombre}${detalle ? ' | ' + detalle : ''}`)
}
const q1 = async (db, sql, params = []) => (await db.query(sql, params)).rows[0]
const n = async (db, sql, params = []) => Number((await q1(db, sql, params)).n)

function fechaBolivia() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/La_Paz',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number)
  const t = new Date(Date.UTC(a, m - 1, d))
  t.setUTCDate(t.getUTCDate() + dias)
  return t.toISOString().slice(0, 10)
}

const HOY = fechaBolivia()
const SQL = migracion('migracion_cu19_alertas.sql')

// ---------------------------------------------------------------------
// 1. Mensaje: la constante de TypeScript y el SQL no pueden divergir
// ---------------------------------------------------------------------
{
  const [antes, despues] = C.PLANTILLA_MENSAJE_ALERTA.split('{fecha}')
  const compacto = (texto) => texto.replace(/\s+/g, ' ')
  const esperadoSql = compacto(
    `'${antes}' || to_char(s.fecha_proximo_mantenimiento, 'YYYY-MM-DD') || '${despues}'`,
  )
  resultado(
    'el SQL construye exactamente PLANTILLA_MENSAJE_ALERTA',
    compacto(SQL).includes(esperadoSql),
    esperadoSql,
  )
}

// ---------------------------------------------------------------------
// 2. Base efímera: esquema + seed + migración propuesta
// ---------------------------------------------------------------------
const db = new PGlite()
await db.exec(`
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE ROLE dueno NOLOGIN;
  GRANT CREATE ON DATABASE postgres TO dueno;
  ALTER SCHEMA public OWNER TO dueno;
  SET ROLE dueno;`)
await db.exec(leer('schema.sql'))
await db.exec(leer('seed.sql'))

let migracionOk = true
try {
  await db.exec(SQL)
} catch (e) {
  migracionOk = false
  console.log('ERROR al aplicar la migración:', e.message)
}
resultado('la migración CU19 se aplica sin errores', migracionOk)

// RBAC
const funcion = await q1(db, `SELECT id, ruta FROM funcion WHERE clave = 'ALERTAS_PREVENTIVAS'`)
resultado('crea la FUNCION ALERTAS_PREVENTIVAS → /alertas', funcion?.ruta === '/alertas')
resultado(
  'ADMINISTRADOR y ENCARGADO tienen LEER y ACTUALIZAR',
  (await n(
    db,
    `SELECT count(*) AS n
       FROM rol_funcion rf
       JOIN rol r ON r.id = rf.rol_id
       JOIN accion a ON a.id = rf.accion_id
       JOIN funcion f ON f.id = rf.funcion_id
      WHERE f.clave = 'ALERTAS_PREVENTIVAS'
        AND r.nombre IN ('ADMINISTRADOR', 'ENCARGADO')
        AND a.nombre IN ('LEER', 'ACTUALIZAR')`,
  )) === 4,
)
resultado(
  'el TECNICO no recibe el módulo de alertas',
  (await n(
    db,
    `SELECT count(*) AS n
       FROM rol_funcion rf
       JOIN rol r ON r.id = rf.rol_id
       JOIN funcion f ON f.id = rf.funcion_id
      WHERE f.clave = 'ALERTAS_PREVENTIVAS' AND r.nombre = 'TECNICO'`,
  )) === 0,
)

// Datos de prueba
await db.exec(`
  INSERT INTO cliente (id, nombre, tipo_cliente) VALUES (900, 'Cliente CU19', 'JURIDICO');
  INSERT INTO establecimiento (id, cliente_id, nombre_establecimiento, direccion)
  VALUES (900, 900, 'Sucursal CU19', 'Av. Siempre Viva 19');`)

const VENCIDO = sumarDias(HOY, -10)
const PROXIMO = sumarDias(HOY, 5)
const LEJANO = sumarDias(HOY, 200)

async function crearSistema(id, fecha) {
  await db.query(
    `INSERT INTO sistema_instalado
       (id, establecimiento_id, nombre_sistema, fecha_instalacion, periodicidad_meses, fecha_proximo_mantenimiento)
     VALUES ($1, 900, $2, '2025-01-01', 6, $3)`,
    [id, `Sistema ${id}`, fecha],
  )
}
await crearSistema(901, VENCIDO)
await crearSistema(902, PROXIMO)
await crearSistema(903, LEJANO)
await crearSistema(904, null)

// ---------------------------------------------------------------------
// 3. Evaluación diaria
// ---------------------------------------------------------------------
const primera = (await q1(db, 'SELECT public.fn_generar_alertas_preventivas(30) AS r')).r
resultado('1.ª ejecución: evalúa 2 sistemas y crea 2 alertas', primera.evaluadas === 2 && primera.creadas === 2, JSON.stringify(primera))
resultado('devuelve el umbral aplicado', primera.umbral_dias === 30)
resultado('usa la fecha de Bolivia', primera.fecha_evaluacion === HOY, String(primera.fecha_evaluacion))

const alertas = (await db.query(
  `SELECT sistema_instalado_id, mensaje, leido, fecha_alerta
     FROM alerta_notificacion ORDER BY sistema_instalado_id`,
)).rows
resultado('guarda una alerta por sistema dentro del umbral', alertas.length === 2)
resultado(
  'el mensaje del ciclo es el esperado (vencido)',
  alertas[0]?.sistema_instalado_id === 901 && alertas[0]?.mensaje === C.mensajeAlerta(VENCIDO),
  alertas[0]?.mensaje,
)
resultado(
  'el mensaje del ciclo es el esperado (próximo)',
  alertas[1]?.sistema_instalado_id === 902 && alertas[1]?.mensaje === C.mensajeAlerta(PROXIMO),
  alertas[1]?.mensaje,
)
resultado('las alertas nuevas nacen sin leer', alertas.every((a) => a.leido === false))
resultado('nunca alerta un sistema sin fecha o fuera del umbral', !alertas.some((a) => [903, 904].includes(a.sistema_instalado_id)))

// Doble invocación: idempotencia
const segunda = (await q1(db, 'SELECT public.fn_generar_alertas_preventivas(30) AS r')).r
resultado('2.ª ejecución seguida: no crea nada', segunda.creadas === 0 && segunda.evaluadas === 2, JSON.stringify(segunda))
resultado('sigue habiendo exactamente 2 alertas', (await n(db, 'SELECT count(*) AS n FROM alerta_notificacion')) === 2)

// Una alerta leída se respeta: no se regenera
await db.exec(`UPDATE alerta_notificacion SET leido = TRUE WHERE sistema_instalado_id = 901;`)
const tercera = (await q1(db, 'SELECT public.fn_generar_alertas_preventivas(30) AS r')).r
resultado('una alerta ya leída no se vuelve a crear', tercera.creadas === 0)
resultado(
  'la alerta leída se conserva como histórica',
  (await n(db, 'SELECT count(*) AS n FROM alerta_notificacion WHERE sistema_instalado_id = 901 AND leido')) === 1,
)

// Nuevo ciclo: cambia la fecha de próximo mantenimiento
const NUEVO_CICLO = sumarDias(HOY, 20)
await db.query('UPDATE sistema_instalado SET fecha_proximo_mantenimiento = $1 WHERE id = 902', [NUEVO_CICLO])
const cuarta = (await q1(db, 'SELECT public.fn_generar_alertas_preventivas(30) AS r')).r
resultado('un ciclo nuevo sí genera su alerta', cuarta.creadas === 1, JSON.stringify(cuarta))
resultado(
  'conserva la alerta del ciclo anterior',
  (await n(db, 'SELECT count(*) AS n FROM alerta_notificacion WHERE sistema_instalado_id = 902')) === 2,
)
resultado(
  'la alerta nueva usa la nueva fecha',
  (await n(
    db,
    `SELECT count(*) AS n FROM alerta_notificacion WHERE sistema_instalado_id = 902 AND mensaje = $1`,
    [C.mensajeAlerta(NUEVO_CICLO)],
  )) === 1,
)
resultado('total de alertas tras el nuevo ciclo: 3', (await n(db, 'SELECT count(*) AS n FROM alerta_notificacion')) === 3)

// Umbral 0: solo vencidos
const quinta = (await q1(db, 'SELECT public.fn_generar_alertas_preventivas(0) AS r')).r
resultado('umbral 0 solo evalúa vencidos (ya alertados)', quinta.evaluadas === 1 && quinta.creadas === 0, JSON.stringify(quinta))

// ---------------------------------------------------------------------
// 4. Seguridad de la función
// ---------------------------------------------------------------------
resultado(
  'anon no puede ejecutar la evaluación',
  (await q1(db, `SELECT has_function_privilege('anon', 'public.fn_generar_alertas_preventivas(integer)', 'EXECUTE') AS puede`)).puede === false,
)
resultado(
  'service_role sí puede ejecutarla',
  (await q1(db, `SELECT has_function_privilege('service_role', 'public.fn_generar_alertas_preventivas(integer)', 'EXECUTE') AS puede`)).puede === true,
)

await db.close()

console.log(`\n${ok} verificación(es) OK, ${fallos} fallo(s).`)
if (fallos > 0) process.exitCode = 1
