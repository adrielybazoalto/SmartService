# 05 · Base de datos: el modelo persistente real

[← Índice](README.md) · Relacionados: [03 Backend](03-backend-profundo.md) · [06 Seguridad](06-seguridad.md) · [07 Trazabilidad](07-trazabilidad.md)

> **Advertencia de verificación:** todo lo que sigue se basa en los **archivos SQL del repositorio** y en los tipos TypeScript. El estado real de la base en Supabase (tablas, columnas, RLS, grants) es ❔ **NO VERIFICABLE DESDE EL REPOSITORIO**. Para comprobarlo hay que ejecutar las consultas de solo lectura de la [sección 7](#7-consultas-de-solo-lectura-para-demostrar) en el SQL Editor del proyecto.
> Aquí nada se presenta como «ya ejecutado».

## 1. Archivos SQL y qué hace cada uno

| Archivo | Propósito | Idempotente | Observación |
|---|---|---|---|
| `schema.sql` | `DROP SCHEMA public CASCADE` (L4) y creación de **32 tablas**, FK, `CHECK` e índices (L817-848), dentro de `BEGIN/COMMIT` | No (borra todo) | **Sin RLS, triggers, procedimientos ni vistas** |
| `seed.sql` | `GRANT` a `service_role` (L19-21), roles, módulos, acciones, funciones, `ROL_FUNCION`, `PERMISO`/`ROL_PERMISO`, 6 usuarios, 2 tokens y 9 eventos de bitácora | Sí (`ON CONFLICT DO NOTHING`) | ⚠️ Incompatible con `schema.sql` ([sección 6](#6-hallazgo-crítico-schemasql-y-seedsql-no-son-compatibles)) |
| `migracion_rbac.sql` | Crea `permiso` y `rol_permiso` **con `descripcion`** en una BD existente | Sí | |
| `migracion_cu01_bloqueo.sql` | Añade `intentos_fallidos` y `bloqueado_hasta` | Sí | |
| `migracion_cu02.sql` | Añade `version_sesion` y migra `token` a `hash_token` (SHA-256) | Sí | |
| `migracion_bitacora_timestamptz.sql` | Cambia `bitacora.fecha_hora` a `TIMESTAMPTZ` | Sí | |
| `auth_bridge.sql` | **LEGADO:** columna `auth_uid` → `auth.users`, **habilita RLS** y crea políticas `USING (true)` para `authenticated` | Sí | Corresponde al modelo con Supabase Auth, ya abandonado |
| `auth_local.sql` | Elimina `auth_uid` y hace `contrasena NOT NULL`. Su comentario dice «RLS se mantiene» | — | Solo aplica a BDs que venían de `auth_bridge.sql` |

**Tipos TypeScript:** `src/lib/supabase/database.types.ts`. Su cabecera (L1-9) dice «**GENERADOS MANUALMENTE** a partir de `schema.sql`», no con `supabase gen types`. Ojo: incluye `rol_permiso.descripcion` (L249), que **no está** en `schema.sql`.

## 2. Inventario de tablas (`schema.sql`)

| Bloque | Tablas (línea) | ¿Las usa el Ciclo 1? |
|---|---|---|
| 1. Seguridad | `ROL` (20), `MODULO` (26), `PERMISO` (32), `ROL_PERMISO` (40), `ACCION` (61), `FUNCION` (66), `ROL_FUNCION` (79), `USUARIO` (108), `TOKEN_RECUPERACION` (127), `BITACORA` (142) | ✅ Todas menos `MODULO`, `ACCION`, `FUNCION` y `ROL_FUNCION`, que solo se usan en el seed y en servicios sin uso |
| 2. Técnicos | `CARGA_HORARIA_TECNICO` (160), `BLOQUEO_TECNICO` (178) | ❌ |
| 3. Clientes | `CLIENTE` (200), `ESTABLECIMIENTO` (212) | ❌ |
| 4. Catálogo | `CATEGORIA_PRODUCTO` (232), `PRODUCTO` (238), `PROVEEDOR` (268), `PRODUCTO_PROVEEDOR` (277), `IMAGEN_PRODUCTO` (303) | ❌ |
| 5–6. Servicios y sistemas | `SERVICIO` (324), `SISTEMA_INSTALADO` (338) | ❌ |
| 7. Cotizaciones | `COTIZACION` (364), `DETALLE_COTIZACION_PRODUCTO` (403), `DETALLE_COTIZACION_SERVICIO` (433) | ❌ |
| 8–13. Operación | `MANTENIMIENTO_TICKET` (467), `ORDEN_TRABAJO` (487), `ORDEN_TRABAJO_TECNICO` (542), `DETALLE_CONSUMO_MATERIAL` (568), `NOTA_SERVICIO` (596), `ALERTA_NOTIFICACION` (625) | ❌ |
| 14–17. Caja, ventas y kárdex | `CAJA` (643), `VENTA` (685), `DETALLE_VENTA` (744), `MOVIMIENTO_KARDEX` (778) | ❌ |

El PDF documenta **30 tablas**, sin `PERMISO` ni `ROL_PERMISO` (PDF-P p.138-143 y script en p.166-191). El repositorio tiene **32**.

### Nombres que la guía de defensa pide revisar

| Nombre | ¿Existe? | Realidad |
|---|---|---|
| `usuario` | ✅ | `USUARIO` (`schema.sql:108`) |
| `rol` | ✅ | `ROL` (`schema.sql:20`) |
| `permiso` | ✅ | `PERMISO` (`schema.sql:32`), un permiso por módulo o ruta |
| `usuario_rol` | ❌ | **No existe.** Cada usuario tiene **un solo rol** mediante la FK `usuario.rol_id` (L110, L119-123) |
| `rol_permiso` | ✅ | `ROL_PERMISO` (`schema.sql:40`), tabla intermedia N:M |
| `bitacora` | ✅ | `BITACORA` (`schema.sql:142`) |
| `token_recuperacion` | ✅ | `TOKEN_RECUPERACION` (`schema.sql:127`) |
| `modulo_sistema` | ❌ | No existe. Hay `MODULO` (`schema.sql:26`), pero la autorización real usa `PERMISO` |
| `auth.users` | ❔ | Tabla de Supabase Auth. **El código no la usa.** Solo `auth_bridge.sql` (legado) la referenciaba. Si en el proyecto remoto hay filas ahí, no intervienen en el login |

## 3. Tablas del Ciclo 1 en detalle

### ROL
- **Propósito:** los roles del negocio. **PK:** `id SERIAL`. **Restricción:** `nombre VARCHAR(50) UNIQUE`.
- **Datos del seed:** 1 ADMINISTRADOR, 2 ENCARGADO, 3 TECNICO (`seed.sql:26-31`).
- **Relaciones:**
  - lo referencian `USUARIO.rol_id` (`ON DELETE RESTRICT`: no se puede borrar un rol con usuarios);
  - `ROL_PERMISO.rol_id` y `ROL_FUNCION.rol_id` (`CASCADE`).
- **CU:** CU03 (combo de roles) y CU04.
- **Código:** `listarRoles` (`src/backend/usuarios/service.ts:25`) y `fetchRolesYPermisos`.
- **Estado:** ✅.

### PERMISO
- **Propósito:** un registro por módulo o ruta. Es la «llave» del RBAC real.
- **Columnas:** `id` PK, `nombre` UNIQUE (clave, por ejemplo `USUARIOS`), `ruta` UNIQUE (por ejemplo `/usuarios`), `descripcion`.
- **Seed:** 8 permisos: PERFIL, USUARIOS, ROLES, BITACORA, COTIZACIONES, ORDENES_TRABAJO, CAJA y VENTAS (`seed.sql:121-130`).
- **CU:** CU04. **Código:** `roles.ts` (L70, L140) y `permisos.ts` (por *join*).
- **Estado:** ✅.

### ROL_PERMISO
- **Propósito:** **tabla intermedia N:M** entre `ROL` y `PERMISO`. Es la matriz que edita `/roles`.
- **Columnas:**
  - `id` PK;
  - `rol_id` FK → `ROL` (CASCADE);
  - `permiso_id` FK → `PERMISO` (CASCADE);
  - `UNIQUE (rol_id, permiso_id)`.
- ⚠️ **Sin `descripcion` en `schema.sql`**, aunque el seed, el código (`roles.ts:159`) y los tipos la usan.
- **Índices:** `idx_rol_permiso_rol` e `idx_rol_permiso_permiso` (L819-820).
- **Seed:** ADMINISTRADOR 8/8, ENCARGADO 5 (sin USUARIOS, ROLES ni BITACORA), TECNICO 3 (`seed.sql:133-150`).
- **CU:** CU04, y de forma indirecta todo el control de acceso.
- **Estado:** ✅ en la aplicación. ⚠️ Inconsistencia de esquema.

### MODULO, ACCION, FUNCION, ROL_FUNCION
- **Propósito según el diseño:** RBAC fino por módulo × función × acción (CREAR, LEER, ACTUALIZAR, ELIMINAR, PROCESAR). Es el modelo del PDF (PDF-P p.138).
- **Realidad:**
  - Se cargan en el seed (`seed.sql:35-113`).
  - `asignarPermiso` y `listarPermisosDelRol` (`src/backend/usuarios/service.ts:54,60`) existen, pero **ninguna pantalla ni acción los llama**.
  - **Ninguna comprobación de acceso los consulta.**
- **Estado:** ⚠️ Solo datos. No participa en la autorización.

### USUARIO
| Columna | Tipo | Uso | Sensible |
|---|---|---|---|
| `id` | SERIAL PK | Identidad (`uid` en el JWT) | — |
| `rol_id` | INT NOT NULL, FK → ROL (RESTRICT) | Rol único | — |
| `nombre` | VARCHAR(150) NOT NULL | Perfil | Dato personal |
| `correo` | VARCHAR(150) NOT NULL **UNIQUE** | Login. La app lo pasa a minúsculas al crear (`service.ts:182`) y al iniciar sesión (`auth.ts:63`) | Dato personal |
| `contrasena` | VARCHAR(255) NOT NULL | **Hash bcrypt**, nunca texto plano (`src/lib/password.ts:28`) | 🔒 Secreto |
| `telefono` | VARCHAR(30) | Perfil | Dato personal |
| `estado` | BOOLEAN DEFAULT TRUE | Activo o inactivo | — |
| `version_sesion` | INT DEFAULT 0 | Invalidación de JWT (CU02) | — |
| `intentos_fallidos` | INT DEFAULT 0 | CU01 | — |
| `bloqueado_hasta` | TIMESTAMPTZ | CU01 | — |

- **CU:** CU01, CU02, CU03 y CU05.
- **¿Dónde se guardan realmente las contraseñas?** En `usuario.contrasena`, como hash bcrypt de costo 10 generado por `bcryptjs`. **No** en `auth.users`.
- ⚠️ La unicidad del correo distingue mayúsculas de minúsculas en PostgreSQL. La consistencia depende de que la app normalice, y **la edición en CU03 no lo hace**.

### TOKEN_RECUPERACION
- **Columnas:**
  - `id` PK;
  - `usuario_id` FK → USUARIO (CASCADE);
  - `hash_token TEXT UNIQUE` (SHA-256 del token);
  - `fecha_creacion TIMESTAMP`;
  - `fecha_expiracion TIMESTAMP`;
  - `usado BOOLEAN DEFAULT FALSE`.
- **CU:** CU02. **Código:** `src/backend/recuperar/service.ts:61,88,131`.
- ⚠️ `fecha_expiracion` es `TIMESTAMP` **sin zona horaria**. El código escribe un instante UTC (`toISOString()`) y luego lo compara con `new Date(...)`. Al volver sin zona, JavaScript lo interpreta como **hora local del servidor**:
  - en Vercel (UTC) funciona;
  - en un servidor UTC-4 el enlace duraría unas 4 h 15 min.
  - ❔ No verificado por ejecución.
- El PDF usa la columna `token` en texto plano (PDF-P p.139). El código usa `hash_token`.

### BITACORA
- **Columnas:**
  - `id` PK;
  - `usuario_id` FK → USUARIO (**ON DELETE CASCADE**, L149-153);
  - `fecha_hora TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`;
  - `accion VARCHAR(100)`;
  - `descripcion TEXT`.
- **Índice:** `idx_bitacora_usuario` (L821).
- **Faltan** (según los apuntes, PDF-A p.9 y p.19): IP, navegador, fecha de salida.
- **Inmutabilidad:** ⚠️ solo por convención de la aplicación. En la BD, borrar un usuario **borra su auditoría**, y nada impide un `UPDATE`.
- **Estado:** ✅ tabla. ⚠️ No es inmutable a nivel de BD.

## 4. RLS (Row Level Security)

**En palabras simples:** RLS son reglas dentro de PostgreSQL que deciden, fila por fila, qué puede ver o modificar cada usuario de la base de datos.

| Pregunta | Respuesta comprobada |
|---|---|
| ¿`schema.sql` habilita RLS? | ❌ No. No hay `ENABLE ROW LEVEL SECURITY` ni `CREATE POLICY` |
| ¿Existe alguna política en el repositorio? | Solo en `auth_bridge.sql` (legado): políticas `USING (true)` para `authenticated`, es decir, permisivas y sin distinción de rol |
| ¿Lo usa la app? | No. La app usa la **service role**, que **se salta RLS** aunque exista (`src/lib/supabase/service.ts:9`) |
| ¿Está activa en la BD remota? | ❔ NO VERIFICABLE. Si la BD se creó con `schema.sql` (como dice el README), el `DROP SCHEMA` eliminó cualquier RLS anterior |
| RNF05 del PDF (RLS por rol, PDF-P p.25) | ❌ No implementado |

**Qué protege hoy la BD:**
1. La service role key solo existe en el servidor.
2. El seed concede `GRANT` solo a `service_role`.
3. ❔ Los grants de `anon`/`authenticated` en el proyecto remoto dependen de la configuración de Supabase. Se comprueban con la consulta 7.8.

💡 PROPUESTA — NO IMPLEMENTADO: `ALTER TABLE … ENABLE ROW LEVEL SECURITY` en todas las tablas, sin políticas para `anon` ni `authenticated`, como defensa en profundidad. La app seguiría funcionando porque usa la service role.

## 5. Transacciones, triggers y procedimientos

| Elemento | PDF (PDF-P p.288–295) | Repositorio |
|---|---|---|
| Procedimientos almacenados | 5: `sp_aprobar_cotizacion`, `sp_finalizar_orden_trabajo`, `sp_asignar_tecnico_lider`, `sp_crear_ticket_mantenimiento`, `sp_actualizar_margen_categoria` | ❌ Ninguno |
| Triggers | Al menos 5: bitácora de cliente nuevo, stock ≥ 0, kárdex, estado de orden, correo en minúsculas | ❌ Ninguno. El correo en minúsculas se hace en TypeScript. «Stock ≥ 0» existe como `CHECK` (`schema.sql:262`) |
| Transacciones en la app | RNF11 exige atomicidad | ❌ Las operaciones de varios pasos (`guardarPermisosRol`, `restablecerContrasena`) son llamadas REST separadas |

Hay además dos incoherencias del SQL del PDF frente a `schema.sql`:
- el trigger de kárdex del PDF usa `cantidad_movimiento`, pero la tabla tiene `cantidad`;
- `sp_actualizar_margen_categoria` usa `categoria_producto_id`, pero la columna real es `categoria_id`.

## 6. Hallazgo crítico: `schema.sql` y `seed.sql` no son compatibles

- `schema.sql:40-59` define `ROL_PERMISO` **sin** la columna `descripcion`.
- `seed.sql:133`, `:140` y `:146` insertan `(rol_id, permiso_id, descripcion)`.

Siguiendo el procedimiento del README (`schema.sql` y luego `seed.sql`), el seed daría el error *column "descripcion" … does not exist*. Como está dentro de `BEGIN … COMMIT`, **se revertiría el seed completo**: no quedarían roles, usuarios ni permisos.

La BD en uso probablemente funciona porque se creó por otro camino: `migracion_rbac.sql:18-30` sí incluye `descripcion`. ❔ NO VERIFICABLE sin acceso.

**Qué decir en la defensa:** «La BD de demostración se construyó aplicando las migraciones; en el script de reset falta la columna `descripcion` de `rol_permiso`, y está identificado como corrección pendiente.»

Otras incoherencias entre el seed y el código:
- las acciones de bitácora del seed (`CAMBIO_PASSWORD`, `SOLICITUD_RECUPERACION`, `CONFIG_ROLES`) no coinciden con las que registra el código (`RECUPERAR_CONTRASENA`, `SOLICITAR_RECUPERACION`, `CONFIGURAR_ROLES_PERMISOS`);
- las horas del seed de bitácora no llevan zona horaria.

## 7. Consultas de solo lectura para demostrar

> Ejecútalas **solo** en el SQL Editor del proyecto correcto. **Nunca** muestres `contrasena` ni `hash_token` completos.
> Adaptadas a `schema.sql` y a las migraciones.

```sql
-- 7.1 Roles y cuántos usuarios tiene cada uno
SELECT r.id, r.nombre, COUNT(u.id) AS usuarios
FROM rol r LEFT JOIN usuario u ON u.rol_id = r.id
GROUP BY r.id, r.nombre ORDER BY r.id;

-- 7.2 Matriz RBAC real (lo que ve el Sidebar)
SELECT r.nombre AS rol, p.nombre AS permiso, p.ruta
FROM rol_permiso rp
JOIN rol r     ON r.id = rp.rol_id
JOIN permiso p ON p.id = rp.permiso_id
ORDER BY r.id, p.id;

-- 7.3 Demostrar que la contraseña está hasheada SIN revelarla
SELECT id, rol_id, estado,
       LEFT(contrasena, 4)  AS prefijo_bcrypt,   -- '$2a$' o '$2b$'
       LENGTH(contrasena)   AS largo_hash        -- 60 en bcrypt
FROM usuario ORDER BY id;

-- 7.4 Estado de bloqueo (CU01)
SELECT id, intentos_fallidos, bloqueado_hasta,
       (bloqueado_hasta > NOW()) AS bloqueado_ahora
FROM usuario ORDER BY id;

-- 7.5 Tokens de recuperación (CU02): vigencia y uso, sin el hash
SELECT id, usuario_id, fecha_creacion, fecha_expiracion, usado
FROM token_recuperacion ORDER BY id DESC LIMIT 10;

-- 7.6 Últimos eventos de bitácora (CU06)
SELECT id, usuario_id, fecha_hora, accion
FROM bitacora ORDER BY fecha_hora DESC LIMIT 20;

-- 7.7 ¿Hay RLS activa y políticas?
SELECT c.relname AS tabla, c.relrowsecurity AS rls_activa
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1;
SELECT schemaname, tablename, policyname, roles, cmd FROM pg_policies
WHERE schemaname = 'public';

-- 7.8 ¿Qué roles de BD tienen permisos sobre usuario?
SELECT grantee, privilege_type FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'usuario' ORDER BY grantee;

-- 7.9 ¿rol_permiso tiene la columna descripcion en la BD real?
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'rol_permiso';

-- 7.10 Versión de sesión (CU02: sube tras una recuperación)
SELECT id, version_sesion FROM usuario ORDER BY id;
```
