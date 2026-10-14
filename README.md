# SmartService

Sistema de gestión de servicios de seguridad: clientes, establecimientos,
sistemas instalados, mantenimiento, cotizaciones, órdenes de trabajo,
productos, ventas y caja.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS |
| Backend | Next.js Server Actions + capa de servicios en `src/backend` |
| Base de datos | PostgreSQL vía **Supabase** (solo base de datos; auth propia: bcryptjs + JWT) |
| Pagos | Stripe |
| IA | OpenAI API |
| Deploy | Vercel |
| VCS | Git + GitHub |

## Requisitos

- Node.js ≥ 20.9 (probado con Node 24)
- npm

## Inicio rápido

```bash
npm install
cp .env.example .env.local   # completa las claves reales
npm run dev                  # http://localhost:3000
```

Otros comandos:

```bash
npm run build   # build de producción
npm start       # sirve el build
npm run lint    # eslint
```

## Base de datos (Supabase)

Supabase se usa **solo como PostgreSQL**; la autenticación vive en la
aplicación (bcryptjs + JWT, ver [Autenticación](#autenticación)). Los scripts
están en la raíz del repo y se ejecutan en **Supabase Dashboard → SQL Editor**,
en este orden:

1. **`schema.sql`** — reset total del esquema (`DROP SCHEMA public CASCADE`) y
   recreación de las **32 tablas** con constraints e índices. ⚠️ Borra los datos
   existentes: úsalo solo para construir desde cero.
2. **`seed.sql`** — permisos (`GRANT` de `service_role` para la API REST),
   3 roles, 8 módulos, 5 acciones, matriz RBAC completa y 6 usuarios. Es
   **idempotente** (`ON CONFLICT DO NOTHING`): puede re-ejecutarse para
   restaurar permisos o datos sin romper lo existente.

> Si ya tienes las tablas creadas (BD migrada) y solo necesitas permisos/datos,
> ejecuta únicamente `seed.sql`.

### Credenciales iniciales

Los 6 usuarios del seed comparten la contraseña temporal **`Admin1234!`**
(almacenada como hash bcrypt, cost 10). Cámbiala en el primer ingreso.

| Rol | Usuarios de ejemplo |
| --- | --- |
| ADMINISTRADOR | `gerencia@sgarnet.bo` |
| ENCARGADO | `administracion@sgarnet.bo` |
| TECNICO | `jperez@sgarnet.bo` · `pramirez@sgarnet.bo` · `lfernandez@sgarnet.bo` · `dcastillo@sgarnet.bo` |

> La API REST se consume únicamente con la **service role key** (server-only);
> por eso el seed concede permisos a `service_role`. La migración
> `auth_local.sql` ya no es necesaria en instalaciones nuevas (el reset de
> `schema.sql` incluye esa estructura) y se conserva solo para BDs creadas con
> el esquema anterior.

## Estructura

```
src/
├── app/          # rutas (App Router) + Server Actions en actions/
├── backend/      # lógica de negocio por dominios (server-only)
│   └── (usuarios, clientes, establecimientos, productos,
│       proveedores, servicios, cotizaciones, ordenes, ventas)
└── lib/          # clientes de servicios externos
    ├── supabase/   # cliente tipado (database.types) + service role
    ├── auth.ts     # getCurrentUser / requireUser (sesión JWT propia)
    ├── session.ts  # cookie de sesión firmada (jose)
    ├── password.ts # hash bcryptjs + regla de contraseña
    ├── stripe.ts
    └── openai.ts
```

## Paquetes funcionales

El alcance del sistema se organiza en **4 paquetes funcionales oficiales**.
`src/lib/navigation.ts` es la única fuente de verdad del menú y del panel
principal; cada paquete se habilita cuando sus casos de uso tienen pantalla.

| Paquete | Nombre | Casos de uso | Estado |
| --- | --- | --- | --- |
| P1 | Seguridad y Gestión de Accesos | CU01–CU06 | ✅ habilitado |
| P2 | Gestión Comercial, Clientes, Catálogo y Ventas | CU07, CU08, CU09, CU14, CU15, CU16, CU17 | ✅ habilitado (CU08 pendiente) |
| P3 | Personal Técnico y Logística de Campo | CU10–CU13 | ⛔ sin pantallas |
| P4 | Post-venta, Alertas y Reportes Gerenciales | CU18–CU20 | ⛔ sin pantallas |

## Autenticación

El login es **100% de la aplicación** (Supabase se usa solo como base de
datos): las contraseñas se guardan como **hash bcrypt (bcryptjs)** en
`usuario.contrasena` y la sesión es una **cookie JWT firmada** con
`AUTH_SECRET` (`src/lib/session.ts`). El `seed.sql` crea los usuarios iniciales
con contraseña temporal `Admin1234!`. Ver `src/backend/README.md` para el
detalle.

Documentación de la capa de servicios: [src/backend/README.md](src/backend/README.md).

## Variables de entorno

Ver [.env.example](.env.example). Copia a `.env.local` con tus claves reales
de Supabase, Stripe, OpenAI y `AUTH_SECRET`. `.env.local` está en
`.gitignore`.

Para Supabase solo se necesitan `NEXT_PUBLIC_SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` (la anon/publishable key ya no se usa: todas las
consultas van por el cliente server-only con service role).

## Despliegue

Conectar el repositorio en [vercel.com](https://vercel.com) (importar el repo
GitHub) y definir las variables de entorno en el panel del proyecto.