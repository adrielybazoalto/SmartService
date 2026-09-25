# Capa de servicios (`src/backend`)

Lógica de negocio **del lado del servidor**, organizada por **dominios** del
sistema de gestión de servicios de seguridad (clientes, establecimientos,
sistemas instalados, productos, cotizaciones, órdenes, ventas, ...).

## Convención

```
src/backend/
├── README.md
└── <dominio>/
    ├── index.ts              # barrel público del dominio
    ├── types.ts              # tipos derivados de database.types.ts
    ├── schema.ts             # esquemas de validación Zod (create/update)
    └── service.ts            # funciones de negocio (async, en el servidor)
```

## Dominios

| Dominio | Tablas | Contenido |
| --- | --- | --- |
| `usuarios` | `rol`, `usuario`, `rol_funcion` | RBAC + vínculo con Supabase Auth (`auth_uid`) |
| `clientes` | `cliente` | CRUD y búsqueda de clientes |
| `establecimientos` | `establecimiento`, `sistema_instalado` | CRUD + cómputo de próximo mantenimiento |
| `productos` | `categoria_producto`, `producto`, `imagen_producto`, `movimiento_kardex` | CRUD, kardex con actualización de stock, stock bajo |
| `proveedores` | `proveedor`, `producto_proveedor` | CRUD + asociación con productos |
| `servicios` | `servicio` | CRUD de servicios técnicos |
| `cotizaciones` | `cotizacion`, `detalle_cotizacion_*` | Cotización con líneas y total calculado |
| `ordenes` | `orden_trabajo`, `orden_trabajo_tecnico`, `detalle_consumo_material`, `nota_servicio` | Órdenes, técnicos, consumo de material, notas |
| `ventas` | `caja`, `venta`, `detalle_venta` | Apertura/cierre de caja, ventas con detalle y descuento de stock |

## Patrón de uso (Server Action)

Los **Server Actions** (`'use server'` en `src/app/**/actions.ts`) llaman a los
servicios con el **cliente de sesión** para que apliquen RLS por usuario:

```ts
import { requireUser } from '@/lib/auth'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { crearCliente, crearClienteSchema, type CrearClienteInput } from '@/backend/clientes'

export async function crearClienteAction(data: CrearClienteInput) {
  await requireUser()                       // 1. sesión de Supabase Auth
  const parsed = crearClienteSchema.parse(data) // 2. validación zod
  const supabase = await createSupabaseServerClient() // 3. cliente RLS
  return crearCliente(supabase, parsed)     // 4. servicio del dominio
}
```

Ver ejemplo completo en `src/app/actions/clientes.ts` y `src/app/actions/auth.ts`.

## Reglas

- **Clientes de Supabase**, según el contexto:
  - `createSupabaseServerClient()` (`@supabase/ssr`) — sesión del usuario, aplica
    **RLS por `auth.uid()`**. Es el cliente por defecto de la capa de datos.
  - `getSupabaseBrowserClient()` — navegador (componentes cliente).
  - `getSupabaseServiceClient()` — **service role**, BYPASSA RLS. Solo para
    tareas privilegiadas (crear/eliminar credenciales, tareas internas). Nunca
    en acciones que reciban input del cliente directamente.
- Los servicios reciben el cliente como parámetro (`db: Db`) → testables y
  reutilizables; no importan secretos ni variables de entorno.
- Validación **siempre con Zod** en `schema.ts`; el servicio re-valida el input.
- Errores descriptivos en español; la UI los captura y muestra.
- No exponer claves secretas (`SUPABASE_SERVICE_ROLE_KEY`, etc.).

## Autenticación y base de datos

- **Supabase Auth** gestiona credenciales (`auth.users`). La tabla `usuario` se
  vincula mediante `auth_uid UUID REFERENCES auth.users(id)` (migración
  `auth_bridge.sql`), y la columna legacy `contrasena` deja de ser obligatoria.
- **RLS**: políticas `authenticated` sobre las tablas de negocio (una sola
  organización; permisos finos vía `rol_funcion` en la app). `usuario` solo se
  puede modificar sobre el propio perfil. Para regenerar tipos:
  `supabase gen types typescript --project-id <ref> --schema public`.

## Notas / mejoras pendientes

- Los flujos multi-INSERT (cotización, venta, consumo de material) no son
  transacciones atómicas: se ejecutan en secuencia. Para atomicidad real
  conviene migrar a una **función SQL / RPC** en Postgres.
- Restaurar stock al anular ventas (TODO en `ventas/service.ts`).
- `listarProductosConStockBajo` filtra en memoria; optimizable con RPC.
- Agregar `middleware`/`proxy` de Next para refresco de sesión en navegación.