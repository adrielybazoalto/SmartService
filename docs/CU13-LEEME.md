# CU13 – Emitir Notas de Servicio y Liquidación Operativa

Organizado igual que el resto del proyecto: `src/backend/<módulo>/`.

## Dónde va cada archivo en su proyecto

```
SmartService/
├── db/
│   └── migrations/
│       └── 20261028000000_cu13_nota_servicio.sql  ← BASE DE DATOS (ejecutar en Supabase)
└── src/
    ├── backend/
    │   └── liquidacion/                  ← BACKEND (carpeta nueva, junto a compras, cotizaciones…)
    │       ├── types.ts                  ← modelo: entidades del CU13
    │       ├── schema.ts                 ← valida lo que llega del formulario
    │       ├── errores.ts                ← ErrorNegocio + mensajes del CU13
    │       ├── autorizacion.ts           ← qué roles pueden emitir
    │       ├── reglas.ts                 ← reglas del negocio (puras)
    │       ├── repositorio.ts            ← consultas a Supabase
    │       ├── control-emitir-nota.ts    ← LiquidacionController
    │       ├── integracion.ts            ← conecta con src/lib (supabase, auth, sesiones, ip)
    │       ├── fabrica.ts                ← arma control + repositorio
    │       ├── acciones.ts               ← Server Actions ("use server")
    │       └── index.ts                  ← exporta el módulo
    └── app/
        └── liquidacion/                  ← FRONTEND
            ├── page.tsx                  ← UI_OrdenesFinalizadas
            ├── _lib/
            │   ├── formato.ts            ← formato Bs y fechas
            │   └── pdf.ts                ← PDF de la nota
            └── [ordenTrabajoId]/
                ├── page.tsx              ← UI_Liquidacion (carga)
                └── liquidacion-form.tsx  ← UI_Liquidacion (formulario)
```

Si sus pantallas están dentro de un grupo con layout (por ejemplo
`src/app/(dashboard)/`), pongan la carpeta `liquidacion` dentro de ese grupo.

## Orden en que viaja la información (y orden para revisar el código)

### 1. Ver órdenes finalizadas — `/liquidacion`
1. `app/liquidacion/page.tsx` → pide la lista
2. `backend/liquidacion/fabrica.ts` → `crearLiquidacionController()` (cliente de `@/lib/supabase` vía `integracion.ts`)
3. `control-emitir-nota.ts` → `listarOrdenesFinalizadas()`
4. `repositorio.ts` → `listarOrdenesSinNota()` → tabla `orden_trabajo`
5. vuelve a `page.tsx` → tabla con botón **Liquidar**

### 2. Abrir la liquidación — `/liquidacion/5`
6. `app/liquidacion/[ordenTrabajoId]/page.tsx` → recibe `ordenTrabajoId = 5`
7. `control-emitir-nota.ts` → `obtenerDetalleLiquidacion()`
8. `reglas.ts` → `verificarOrdenLiquidable()` (FINALIZADA y sin nota)
9. `repositorio.ts` → `obtenerOrden()`, `listarMaterialesConsumidos()`, `calcularLiquidacion()`
10. **SQL** `fn_calcular_liquidacion` → materiales + mano de obra = total
11. `liquidacion-form.tsx` → muestra el formulario; el saldo se calcula al escribir el anticipo

### 3. Emitir la nota
12. `liquidacion-form.tsx` → `confirmarEmision()`
13. `acciones.ts` → `emitirNotaServicioAction()` (obtiene la IP con `integracion.ts` → `@/lib/ip`)
14. `schema.ts` → `validarEmitirNotaInput()`
15. `control-emitir-nota.ts` → `emitirNotaServicio()`
16. `integracion.ts` → usuario logueado (`@/lib/auth`) y `autorizacion.ts` → `verificarPermisoEmitirNota()`
17. `reglas.ts` → `validarAnticipo()`
18. `repositorio.ts` → `emitirNota()`
19. **SQL** `sp_emitir_nota_servicio` → número NS-2026-001 + nota + bitácora (una transacción)
20. vuelve a `liquidacion-form.tsx` → mensaje + `_lib/pdf.ts` descarga el PDF

## Pasos para integrarlo

1. **Base de datos:** copiar `db/migrations/20261028000000_cu13_nota_servicio.sql` a su
   carpeta `db/migrations/` (pueden renombrarlo con el formato de sus otras migraciones), y en
   Supabase → SQL Editor → pegar el contenido → **Run** (se puede ejecutar más de una vez).
2. **Copiar** `src/backend/liquidacion/` y `src/app/liquidacion/` a su proyecto.
3. **Conexión con `src/lib`:** el archivo `integracion.ts` usa lo que ya existe en el proyecto:
   - `@/lib/supabase` → cliente de Supabase
   - `@/lib/auth` y `@/lib/sesiones` → usuario que inició sesión (login propio del CU01)
   - `@/lib/ip` → IP para la bitácora

   Busca automáticamente la función correcta en cada módulo. Si no la encuentra, el error
   en pantalla dice **qué funciones exporta** ese módulo; con ese nombre se escribe la
   llamada directa en `integracion.ts` (es el único archivo a tocar).
4. **Instalar** la librería del PDF: `npm install jspdf jspdf-autotable`
5. **Menú:** agregar el enlace `/liquidacion` para el Encargado.
6. **Probar:** `npm run dev` → `/liquidacion`.

## Supuestos (revisar con el CU12)

| Supuesto | Dónde cambiarlo |
|---|---|
| La orden terminada queda con `estado = 'FINALIZADA'` | `ESTADO_ORDEN_FINALIZADA` en `types.ts` y el `IF` del SQL |
| `orden_trabajo.horas_fin_real` = horas trabajadas | `fn_calcular_liquidacion` |
| `producto.margen_ganancia` es porcentaje (30 = 30 %) | SQL y `listarMaterialesConsumidos` |
| El usuario logueado sale de `@/lib/auth` o `@/lib/sesiones` | `obtenerUsuarioSesion` en `integracion.ts` |
| Pueden emitir: Encargado y Administrador | `ROLES_PERMITIDOS` en `autorizacion.ts` |
| Next.js 15+ (`params` es Promise) | En Next 14: `{ params }: { params: { ordenTrabajoId: string } }` sin `await` |
| `schema.ts` sin librerías | Si sus otros `schema.ts` usan **zod**, pueden reescribirlo igual |

## Verificación realizada
- SQL probado en PostgreSQL 16 con las tablas del documento (7 casos).
- TypeScript compilado en modo estricto.
- 12 pruebas de reglas, autorización, schema y control: todas OK.
- **No** probado dentro de su proyecto (no hay acceso al repositorio).
