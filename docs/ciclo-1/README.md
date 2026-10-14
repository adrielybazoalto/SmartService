# Ciclo 1 de SMARTSERVICE: ruta de estudio para la defensa

> **Fecha de inspección:** 2026-09-29 · **Rama:** `dev-jorge` · **Commit inspeccionado:** `cf0b5a0`
> **Alcance:** paquete P1 «Seguridad y Gestión de Accesos», con los casos de uso CU01 a CU06.
> **Regla de esta carpeta:** son documentos de estudio. No se modificó código, SQL, configuración ni datos.

## Estado de avance de la documentación

| Archivo | Estado |
|---|---|
| `README.md` | ✅ terminado |
| `01-sistema-completo.md` … `11-informe-final.md` | ✅ terminados (ver índice) |

Verificaciones ejecutadas en modo de solo lectura durante la inspección:

- `npx tsc --noEmit --incremental false` → **0 errores de tipos**.
- `npx eslint src` → **2 errores**:
  - `react-hooks/set-state-in-effect` en `src/app/bitacora/fecha-hora.tsx:53`;
  - `react-hooks/error-boundaries` en `src/app/recuperar/page.tsx:27`.
- **No se ejecutó** `next build`, porque escribe `.next/`. Tampoco `npm run dev`, migraciones ni seeds.
- **No hay pruebas automatizadas** en el repositorio: no existen archivos `*.test.*` ni `*.spec.*` y `package.json` no tiene script `test`.

## Índice y orden recomendado de lectura

| # | Documento | Para qué sirve | Tiempo |
|---|---|---|---|
| 1 | [11-informe-final.md](11-informe-final.md) | Resumen ejecutivo, los 20 puntos que debes dominar y lo que **no** debes afirmar | 20 min |
| 2 | [01-sistema-completo.md](01-sistema-completo.md) | Visión general, stack real y diagrama de arquitectura | 20 min |
| 3 | [02-casos-de-uso.md](02-casos-de-uso.md) | CU01–CU06: flujo real, botones y contraste con el PDF | 60 min |
| 4 | [03-backend-profundo.md](03-backend-profundo.md) | Server Actions, servicios, sesión, RBAC y Supabase | 60 min |
| 5 | [04-frontend-profundo.md](04-frontend-profundo.md) | Páginas, formularios, Server y Client Components | 45 min |
| 6 | [05-base-de-datos.md](05-base-de-datos.md) | Tablas reales, SQL, RLS y consultas de solo lectura | 40 min |
| 7 | [06-seguridad.md](06-seguridad.md) | Controles, matriz de amenazas y límites | 40 min |
| 8 | [07-trazabilidad.md](07-trazabilidad.md) | RF/RNF → CU → código, y contradicciones | 20 min |
| 9 | [08-cambios-defensa.md](08-cambios-defensa.md) | Qué tocar si la Ing. pide un cambio en vivo | 40 min |
| 10 | [09-preguntas-ingeniera.md](09-preguntas-ingeniera.md) | Banco de preguntas con respuestas cortas | 60 min |
| 11 | [10-guia-defensa.md](10-guia-defensa.md) | Guion de exposición y checklist de demostración | 30 min |

## Fuentes usadas

| Fuente | Ruta | Estado |
|---|---|---|
| Repositorio actual | raíz del proyecto | ✅ Inspeccionado. Es la evidencia de lo implementado. |
| PDF del proyecto | `docs/fuentes/INF342-SMARTSERVICE-PROYECTO.pdf` (296 págs.) | ✅ Texto leído. Los diagramas UML son **imágenes**: su contenido es ❔ NO VERIFICABLE, porque solo se pudo extraer el texto. |
| Apuntes de clase | `docs/fuentes/UAGRM APUNTES JORGE SANTIAGO.pdf` (51 págs.) | ✅ Texto leído. El nombre del archivo lleva **espacios**. |

Cómo se citan: **PDF-P p.N** es el PDF del proyecto y **PDF-A p.N** son los apuntes, donde N es el número de página física del PDF. Las rutas de código se escriben relativas a la raíz, como `src/app/actions/auth.ts:96`.

> ⚠️ La carpeta `docs/` **no está versionada en git** (`git status` la muestra como `??`).

## Convenciones de estado

| Marca | Significado |
|---|---|
| ✅ IMPLEMENTADO | Flujo verificable de extremo a extremo en el código. |
| ⚠️ PARCIALMENTE IMPLEMENTADO | Hay piezas, pero falta algo concreto, que siempre se indica. |
| ❌ NO IMPLEMENTADO | No se encontró tras revisar las ubicaciones razonables. |
| 💡 PROPUESTA — NO IMPLEMENTADO | Diseño sugerido, separado del estado actual. |
| ❔ NO VERIFICABLE | Depende de algo fuera del repositorio: Supabase remoto, imágenes de diagramas, etc. |

## Glosario breve (aplicado a este proyecto)

| Término | Significado en SmartService |
|---|---|
| **Ruta (Route)** | URL que atiende una carpeta de `src/app/`. Por ejemplo, `src/app/usuarios/page.tsx` atiende `/usuarios`. |
| **Request / Response** | Petición del navegador al servidor y su respuesta: HTML, datos de una acción o una redirección. |
| **Server Component** | Componente React que se ejecuta **solo en el servidor**; su código no llega al navegador. Ejemplo: `src/app/page.tsx`. |
| **Client Component** | Componente marcado con `'use client'`; se ejecuta en el navegador y maneja estado y eventos. Ejemplo: `src/app/login/login-form.tsx`. |
| **Server Action** | Función marcada con `'use server'` que el navegador invoca por POST y se ejecuta en el servidor. Ejemplo: `loginAction`. |
| **Route Handler** | Archivo `route.ts` que responde HTTP como una API. **No existe ninguno en este proyecto.** |
| **Middleware / proxy** | Código que corre antes de cada ruta. En Next 16 se llama **proxy**: `src/proxy.ts`. |
| **Sesión** | Estado de «usuario autenticado». Aquí es una cookie `sesion` con un JWT firmado. |
| **JWT** | Token firmado que contiene `uid`, `rol_id`, `version`, etc. Se firma con `AUTH_SECRET`. |
| **Hash** | Transformación irreversible. Las contraseñas se guardan con bcrypt y los tokens de recuperación con SHA-256. |
| **Token** | Cadena aleatoria que prueba algo: la sesión (JWT) o la recuperación (token de 32 bytes). |
| **RBAC** | Control de acceso basado en roles: rol → permisos. Aquí se guarda en las tablas `ROL_PERMISO` y `PERMISO`. |
| **CRUD** | Crear, Leer, Actualizar y Eliminar. |
| **RLS** | *Row Level Security*: políticas de PostgreSQL por fila. **No se habilitan en `schema.sql`.** |
| **CSRF** | Ataque que hace que el navegador de la víctima envíe peticiones. Se mitiga con `sameSite=lax` y la protección de origen de las Server Actions de Next. |
| **ORM** | Mapeador objeto-relacional. **No se usa**; se consulta con el cliente `supabase-js` (PostgREST). |
| **PK / FK** | Llave primaria y llave foránea. |
| **PUDS / UML** | Proceso Unificado de Desarrollo de Software y Lenguaje Unificado de Modelado. Es la metodología del PDF (PDF-P p.60). |

## Tabla rápida: pregunta o cambio → dónde mirar

| Pregunta o cambio | Documento → sección | Archivo de código |
|---|---|---|
| «¿Qué pasa al pulsar Iniciar sesión?» | [02 → CU01](02-casos-de-uso.md#cu01--gestionar-inicio-y-cierre-de-sesión) · [03 → login](03-backend-profundo.md#31-login-completo-paso-a-paso) | `src/app/actions/auth.ts` (`loginAction`) |
| «Cambie a 5 intentos / 10 minutos de bloqueo» | [08 → intentos](08-cambios-defensa.md#c1--número-de-intentos-de-login) | `src/lib/bloqueo-cu01.ts:17,20` |
| «Exija 10 caracteres en la contraseña» | [08 → contraseña](08-cambios-defensa.md#c3--longitud-mínima-y-política-de-contraseña) | `src/lib/password.ts:13` |
| «¿Dónde se guarda la contraseña?» | [05 → USUARIO](05-base-de-datos.md#usuario) · [06 → hash](06-seguridad.md#3-contraseñas-y-hash) | `src/lib/password.ts`, `schema.sql:108` |
| «¿Cómo evitan que entre por URL directa?» | [06 → amenazas](06-seguridad.md#8-matriz-de-amenazas-para-la-defensa) | `src/proxy.ts`, `src/app/usuarios/layout.tsx` |
| «Quite al técnico el módulo X» | [08 → permisos](08-cambios-defensa.md#c6--permisos-del-técnico-y-del-encargado) | Pantalla `/roles` o tabla `rol_permiso` |
| «¿Usan RLS?» | [05 → RLS](05-base-de-datos.md#4-rls-row-level-security) | `schema.sql` (no hay), `auth_bridge.sql` (legado) |
| «¿Qué registra la bitácora?» | [02 → CU06](02-casos-de-uso.md#cu06--gestionar-bitácora-de-auditoría) | `src/backend/bitacora/service.ts` |
| «¿El enlace de recuperación caduca?» | [06 → recuperación](06-seguridad.md#5-recuperación-de-contraseña) | `src/backend/recuperar/service.ts:15,94-98` |
| «¿Cómo llega un CU al código?» | [07 → trazabilidad](07-trazabilidad.md) | — |
