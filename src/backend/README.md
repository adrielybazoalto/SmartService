# Capa de servicios (`src/backend`)

Lógica de negocio **del lado del servidor**, organizada por **dominios** del
taller (clientes, motocicletas, inventario, ventas, órdenes, ...).

## Convención

```
src/backend/
├── README.md
├── <dominio>/
│   ├── index.ts            # barrel: re-exporta el servicio público
│   ├── types.ts            # tipos del dominio
│   └── <dominio>-service.ts # funciones de negocio (async, ejecutadas en el servidor)
```

- Los **Server Actions** (directiva `'use server'`) viven junto a las rutas en
  `src/app/**/actions.ts` y **llaman** a esta capa.
- Los servicios usan los clientes de `src/lib/` (Supabase, Stripe, OpenAI).
- Cada función valida su entrada y lanza errores descriptivos; la UI los captura.

## Dominios

- `clients` — clientes del taller (ejemplo implementado)
- `vehicles` — motocicletas (pendiente)
- `inventory` — inventario / repuestos (pendiente)
- `orders` — órdenes de servicio (pendiente)
- `sales` — ventas (pendiente)

## Reglas

- Solo accesibles desde el servidor (no importar en componentes cliente).
- No exponer claves secretas (`SUPABASE_SERVICE_ROLE_KEY`, etc.).