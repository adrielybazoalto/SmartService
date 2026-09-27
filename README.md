# SmartService

Sistema de gestión de servicios de seguridad: clientes, establecimientos,
sistemas instalados, mantenimiento, cotizaciones, órdenes de trabajo,
productos, ventas y caja.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS |
| Backend | Next.js Server Actions + capa de servicios en `src/backend` |
| Base de datos | PostgreSQL vía **Supabase** (DB + Auth) |
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

## Autenticación

El login es **100% de la aplicación** (Supabase se usa solo como base de
datos): las contraseñas se guardan como **hash bcrypt (bcryptjs)** en
`usuario.contrasena` y la sesión es una **cookie JWT firmada** con
`AUTH_SECRET` (`src/lib/session.ts`). Ver `src/backend/README.md` para el
detalle y la migración `auth_local.sql`.

Documentación de la capa de servicios: [src/backend/README.md](src/backend/README.md).

## Variables de entorno

Ver [.env.example](.env.example). Copia a `.env.local` con tus claves reales
de Supabase, Stripe, OpenAI y `AUTH_SECRET`. `.env.local` está en
`.gitignore`.

## Despliegue

Conectar el repositorio en [vercel.com](https://vercel.com) (importar el repo
GitHub) y definir las variables de entorno en el panel del proyecto.