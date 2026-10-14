# Pruebas de base de datos — CU15 y CU16

Pruebas **locales y efímeras** de las migraciones de inventario/kárdex (CU16) y
compras (CU15). Se ejecutan sobre un PostgreSQL real compilado a WebAssembly
([PGlite](https://pglite.dev)), **en memoria**: no instalan servicios, no
necesitan Docker ni Supabase y no dejan datos en disco.

## Comandos

Desde la raíz del repositorio:

```bash
npm run test:bd:sintaxis
npm run test:bd
```

| Comando | Script | Qué comprueba |
|---|---|---|
| `npm run test:bd:sintaxis` | `node pruebas/bd/sintaxis.mjs` | Sintaxis SQL de `diagnostico_cu15_cu16.sql`, `migracion_cu16_inventario.sql` y `migracion_cu15_compras.sql`, y la sintaxis PL/pgSQL de cada `CREATE FUNCTION` y bloque `DO`, con el parser real de PostgreSQL. **No ejecuta SQL** ni comprueba tablas, columnas o privilegios. |
| `npm run test:bd` | `node pruebas/bd/cu15-cu16.prueba.mjs` | Crea una BD en memoria con `schema.sql` + `seed.sql`, aplica las migraciones de CU16 y CU15 (dos veces) y ejecuta ~100 pruebas: permisos `EXECUTE` y escritura directa por rol, RBAC por usuario, compras (stock, último costo, precio pactado, kárdex, bitácora), comprobantes duplicados, validaciones, atomicidad ante errores, ajustes, inventario inicial, kárdex de solo inserción, compatibilidad con las inserciones de CU09/CU12, escenarios de columnas de CU14 y re-ejecución. Tarda ~40 s. |

Ambos terminan con código `0` si todo pasa y `1` si algo falla. La salida lista
cada prueba como `PASA` / `FALLA` y un total.

`sintaxis.mjs` también acepta archivos concretos (nombre del archivo —se busca
en `db/` y sus subcarpetas— o ruta relativa a la raíz):

```bash
node pruebas/bd/sintaxis.mjs migracion_cu15_compras.sql
```

## Dependencias de desarrollo

Instaladas en `devDependencies` con versión exacta:

| Paquete | Versión | Uso |
|---|---|---|
| `@electric-sql/pglite` | 0.5.9 (PostgreSQL 18.6) | BD en memoria para `npm run test:bd` |
| `libpg-query` | 18.1.5 | Parser de PostgreSQL para `npm run test:bd:sintaxis` |

Basta con `npm install` en la raíz. Requiere Node.js ≥ 20 (probado con Node 24).
No forman parte del build de Next.js ni del despliegue.

## Seguridad

- **Base de datos temporal en memoria:** cada escenario crea una instancia
  `new PGlite()` sin directorio de datos; desaparece al terminar el proceso.
- **No modifican Supabase** ni se conectan a ninguna red: no importan
  supabase-js, no leen `.env`/`.env.local` ni ninguna clave.
- **No usan datos reales:** los datos son ficticios y se crean en cada ejecución.
- **No modifican archivos:** solo leen los `.sql` de la carpeta `db/` del repositorio.
- La única variable de entorno que usan es `SMARTSERVICE_RAIZ` (opcional), para
  apuntar a otra copia del repositorio; por defecto, la raíz de este.

## Qué emula

Para que las pruebas de permisos sean significativas se emula Supabase:

- Roles `anon`, `authenticated` y `service_role` (este con `BYPASSRLS`).
- Un dueño de los objetos **no superusuario** (`dueno`), como `postgres` en Supabase.
- Los privilegios por defecto de Supabase (`GRANT ALL` a los tres roles sobre
  tablas, funciones y secuencias nuevas).
- El JWT de PostgREST mediante `request.jwt.claims`.

## Limitaciones

Estas pruebas **no sustituyen las pruebas de integración con Supabase y
PostgREST**. Antes de aplicar las migraciones en la BD compartida hay que
probarlas en un proyecto Supabase de desarrollo. No cubren:

- Concurrencia real (PGlite admite una sola conexión): compras simultáneas del
  mismo producto, documentos duplicados en paralelo, compra frente a venta.
- Llamadas reales por PostgREST / supabase-js (`.rpc()`), el nombre real del
  GUC de claims, la recarga del caché de esquema y los códigos de error HTTP.
- La versión exacta de PostgreSQL de Supabase (15/17; aquí 18.6) y los
  privilegios reales del rol `postgres`.
- El esquema y los datos reales (usar `diagnostico_cu15_cu16.sql`, solo lectura).
- La migración de CU09/CU14 de otros integrantes, que no está en el repositorio
  (sus columnas se simulan en la sección 7 de `cu15-cu16.prueba.mjs`).

## Mantenimiento

- La sección «6. Pendientes P1/P2» de `cu15-cu16.prueba.mjs` contiene una
  **copia** de los bloques P1 y P2 comentados al final de
  `migracion_cu16_inventario.sql`. Si cambian allí, actualizarla aquí.
- Los escenarios de CU14 (sección 7) simulan columnas que la migración de CU14
  podría crear; ajustarlos cuando esa migración esté en el repositorio.
