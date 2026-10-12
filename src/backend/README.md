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
| `usuarios` | `rol`, `usuario`, `rol_funcion` | RBAC + credenciales con hash **bcryptjs** en `contrasena` |
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
servicios con el **cliente service role** (Supabase es solo BD); la
autorización real la aporta la **sesión JWT propia**:

```ts
import { requireUser } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { listarClientes } from '@/backend/clientes'

export async function listarClientesAction() {
  await requireUser()                       // 1. sesión JWT propia (cookie firmada)
  const db = getSupabaseServiceClient()     // 2. service role (server-only)
  return listarClientes(db)                 // 3. servicio del dominio
}
```

Ver el patrón completo del controlador `ControlGestionarClientes` en
`src/app/actions/clientes.ts` (CU07) y `src/app/actions/auth.ts`.

## Reglas

- **Cliente de Supabase**: la app usa únicamente
  `getSupabaseServiceClient()` (**service role**, server-only, nunca expuesto
  al navegador). No hay cliente del lado del navegador ni RLS por usuario.
- Los servicios reciben el cliente como parámetro (`db: Db`) → testables y
  reutilizables; no importan secretos ni variables de entorno.
- Validación **siempre con Zod** en `schema.ts`; el servicio re-valida el input.
- Errores descriptivos en español; la UI los captura y muestra.
- No exponer claves secretas (`SUPABASE_SERVICE_ROLE_KEY`, `AUTH_SECRET`, etc.).

## Autenticación y base de datos

- **Auth de la app** (`bcryptjs` + `jose`): la contraseña se guarda como
  **hash bcrypt** en `usuario.contrasena` (nunca en texto plano) y la sesión
  es una **cookie JWT firmada** (`src/lib/session.ts`) con `AUTH_SECRET`.
  Login/registro: `src/app/actions/auth.ts` + `src/backend/usuarios`.
- **Supabase = solo base de datos** (migración `auth_local.sql`): se eliminó
  `auth_uid` y el uso de Supabase Auth; RLS queda habilitado como defensa en
  profundidad, pero la autorización real vive en la aplicación
  (`requireUser` + `rol_funcion`). Para regenerar tipos:
  `supabase gen types typescript --project-id <ref> --schema public`.

## Notas / mejoras pendientes

- Los flujos multi-INSERT (cotización, venta, consumo de material) no son
  transacciones atómicas: se ejecutan en secuencia. Para atomicidad real
  conviene migrar a una **función SQL / RPC** en Postgres.
- Restaurar stock al anular ventas (TODO en `ventas/service.ts`).
- `listarProductosConStockBajo` filtra en memoria; optimizable con RPC.
- `proxy.ts` (Next 16) hace un check OPTIMISTICO de sesión en rutas; la
  validación fuerte vive en los Server Actions (`requireUser`).