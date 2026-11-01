# Base de datos (`db/`)

Scripts SQL de SmartService. Supabase se usa **solo como PostgreSQL**: los
scripts se ejecutan en **Supabase Dashboard → SQL Editor**.

```
db/
├── schema.sql            # reset total (DROP SCHEMA public CASCADE); desactualizado, ver abajo
├── seed.sql              # permisos (GRANT service_role), roles, módulos, RBAC y usuarios (idempotente)
├── migrations/           # cambios aún no aplicados en Supabase
│   └── aplicadas/        # migraciones ya ejecutadas en Supabase (historial)
├── legacy/               # scripts del modelo anterior (NO usar en instalaciones nuevas)
└── diagnostics/          # consultas de solo lectura para revisar el estado de la BD
```

## Instalación desde cero

Ejecuta **en este orden**:

1. `schema.sql` — ⚠️ **borra los datos existentes** (`DROP SCHEMA public CASCADE`).
   Úsalo solo para construir la BD desde cero.
2. `seed.sql` — permisos, roles, módulos, matriz RBAC y 6 usuarios. Es
   **idempotente** (`ON CONFLICT DO NOTHING`).

## BD ya existente (migrada)

Lo pendiente está en `migrations/`. **`EJECUTAR_TODO_PENDIENTE.sql`** une esos
scripts en orden: pégalo completo en el SQL Editor. Cuando se aplique, mueve los
scripts a `aplicadas/` y borra ese archivo.

> `schema.sql` no refleja todavía la base migrada (esquema `private`, RLS, columnas
> del anticipo). Debe regenerarse desde Supabase con `supabase db dump --schema-only`,
> y `src/lib/supabase/database.types.ts` con `supabase gen types`.

Orden histórico de `aplicadas/`:

| Orden | Archivo | Qué cambia |
| --- | --- | --- |
| 1 | `migracion_rbac.sql` | Crea `permiso` / `rol_permiso` (con `descripcion`) |
| 2 | `migracion_rbac_modulos_completos.sql` | Completa los módulos del RBAC |
| 3 | `migracion_cu01_bloqueo.sql` | `intentos_fallidos` y `bloqueado_hasta` (bloqueo de login) |
| 4 | `migracion_cu02.sql` | `version_sesion` y migración de `token` a `hash_token` |
| 5 | `migracion_cu07.sql` | Clientes / establecimientos (CU07) |
| 6 | `migracion_bitacora_ip.sql` | `bitacora.ip` y `navegador` (CU06) |
| 7 | `migracion_bitacora_timestamptz.sql` | `bitacora.fecha_hora` a `TIMESTAMPTZ` |
| 8 | `migracion_cu16_inventario.sql` | Kárdex y funciones de inventario (CU16) |
| 9 | `migracion_cu15_compras.sql` | Registro de compras (CU15) — **requiere el CU16** |
| 10 | `migracion_cu17_servicio.sql` | Catálogo de servicios (CU17) |
| 11 | `migration_ventas_proveedores.sql` | Ventas y proveedores |
| 12 | `migracion_seguridad_rls.sql` | RLS y cierre de accesos públicos |
| 13 | `migracion_cu12_reporte_campo_v2.sql`, `migracion_cu12_estados_orden.sql`, `migracion_cu09_solo_productos.sql` | CU12 y CU09 |
| 14 | `migracion_rbac_ajuste_matriz.sql` | CU10 con clave propia |
| 15 | `migracion_cu12_hora_bolivia.sql`, `migracion_cu12_correccion_horas.sql` | Fechas en hora de Bolivia |
| 16 | `migracion_cu08_anticipo.sql`, `migracion_cu08_anticipo_tarjeta.sql` | Anticipo del CU08 |

> Si solo necesitas permisos/datos sobre una BD migrada, puedes re-ejecutar
> `seed.sql` sin romper lo existente.

## `legacy/` (no usar en instalaciones nuevas)

- `auth_bridge.sql` — modelo abandonado con Supabase Auth + RLS.
- `auth_local.sql` — transición a la autenticación propia. El `schema.sql`
  actual ya incluye esa estructura.

## `diagnostics/` (solo lectura)

- `diagnostico_cu15_cu16.sql` — revisa el estado de CU15/CU16.
- `extraer_funciones_cu09.sql` — extrae las funciones de CU09.

## Pruebas

Las pruebas de PGlite (`pruebas/`) localizan estos archivos **por nombre** en
`db/`, `db/seeds/`, `db/migrations/`, `db/migrations/aplicadas/`, `db/legacy/` y
`db/diagnostics/`, así que mover un script entre esas carpetas no rompe las pruebas.

```bash
npm run test:bd            # ejecución completa (PGlite)
npm run test:bd:sintaxis   # solo sintaxis SQL
```
