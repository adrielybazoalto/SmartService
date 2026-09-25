# SmartService

Aplicación web full-stack para la gestión de un **taller de motocicletas**
(clientes, motocicletas, inventario, ventas y órdenes de servicio), con
asistente IA y procesamiento de pagos.

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
├── app/          # rutas (App Router)
├── backend/      # lógica de negocio por dominios (server-only)
│   └── clients/  # ejemplo: clientes del taller
└── lib/          # clientes de servicios externos
    ├── supabase/
    ├── stripe.ts
    └── openai.ts
```

Documentación de la capa de servicios: [src/backend/README.md](src/backend/README.md).

## Variables de entorno

Ver [.env.example](.env.example). Copia a `.env.local` con tus claves reales
de Supabase, Stripe y OpenAI. `.env.local` está en `.gitignore`.

## Despliegue

Conectar el repositorio en [vercel.com](https://vercel.com) (importar el repo
GitHub) y definir las variables de entorno en el panel del proyecto.