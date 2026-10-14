# 08 · Manual de cambios en vivo para la defensa

[← Índice](README.md) · Relacionados: [03 Backend](03-backend-profundo.md) · [05 BD](05-base-de-datos.md) · [06 Seguridad](06-seguridad.md)

> **Ningún cambio de este documento está aplicado.** Son guías para ejecutar **si la Ing. lo pide durante la defensa**. Los «antes» son código real con su línea; los «después» son sugerencias.
> Tras cualquier edición, verifica con `npm run dev` (Turbopack recarga en caliente), la prueba manual indicada y, si hay tiempo, `npx tsc --noEmit`.

## Índice rápido: petición → archivo → capas → prueba

| Petición posible | Archivo y símbolo | Capas afectadas | Prueba rápida |
|---|---|---|---|
| «Que bloquee al 5.º intento» | `src/lib/bloqueo-cu01.ts:17` `CU01.maxIntentos` | Servidor (los mensajes se adaptan solos) | Fallar el login 5 veces |
| «Que el bloqueo dure 10 minutos» | `src/lib/bloqueo-cu01.ts:20` `CU01.minutosBloqueo` | Servidor | Fallar 3 veces y leer el mensaje |
| «Mínimo 10 caracteres» | `src/lib/password.ts:13` + textos de ayuda | Servidor + 3 formularios | Crear un usuario con una clave de 9 caracteres |
| «Que el enlace dure 30 minutos» | `src/backend/recuperar/service.ts:15` + `recuperar-form.tsx:100` | Servidor + texto | Pedir un enlace y consultar `token_recuperacion` |
| «Que el enlace se pueda reutilizar» | `service.ts:94,130-136` | Servidor | No recomendado |
| «Quite Bitácora al Encargado» | Pantalla `/roles` (sin código) | BD (`rol_permiso`) | Entrar como encargado |
| «Mensaje de cuenta desactivada» | `src/app/actions/auth.ts:119-121` | Servidor | Desactivar un usuario y entrar |
| «Registre la IP / el navegador» | `schema.sql` (BITACORA) + `src/backend/bitacora/*` + acciones | BD + servidor | Revisar `/bitacora` |
| «Registre los intentos fallidos» | `src/app/actions/auth.ts:99-117` | Servidor | Fallar y revisar `/bitacora` |
| «Que la sesión dure 8 horas» | `src/lib/session.ts:5,31` | Servidor | Revisar la cookie en DevTools |
| «Obligue a cambiar la contraseña inicial» | ❌ No existe: BD + `auth.ts` + `lib/auth.ts` + perfil | Multicapa | 💡 Propuesta |

## Tabla de valores y reglas detectados

| Cambio posible | Estado y valor actual comprobado | Ruta y símbolo | Dificultad | Capas afectadas |
|---|---|---|---|---|
| Intentos antes del bloqueo | ✅ `3` | `src/lib/bloqueo-cu01.ts:17` `CU01.maxIntentos` | Muy baja | Servidor |
| Duración del bloqueo | ✅ `1` minuto | `src/lib/bloqueo-cu01.ts:20` `CU01.minutosBloqueo` | Muy baja | Servidor |
| Longitud mínima de contraseña | ✅ `8` | `src/lib/password.ts:13` | Baja | Servidor + textos de 3 formularios |
| Longitud máxima de contraseña | ✅ `72` (límite de bcrypt) | `src/lib/password.ts:14,22-25` | No cambiar por encima de 72 | Servidor |
| Mayúscula, minúscula, número, especial | ✅ regex en L15-20 | `src/lib/password.ts` | Baja | Servidor |
| Costo de bcrypt | ✅ `10` | `src/lib/password.ts:5` `COSTO_BCRYPT` | Baja (los hashes viejos siguen funcionando) | Servidor |
| Vigencia del enlace de recuperación | ✅ `15` min | `src/backend/recuperar/service.ts:15` `VIGENCIA_MINUTOS` + texto `recuperar-form.tsx:100` | Baja | Servidor + texto |
| Uso único del enlace | ✅ `usado` | `service.ts:94,130-136` | Baja | Servidor |
| Duración de la sesión | ✅ `7` días (dos lugares) | `src/lib/session.ts:5` `MAX_AGE_SECONDS` y `:31` `setExpirationTime('7d')` | Baja | Servidor |
| Rutas públicas | ✅ `['/login', '/recuperar']` | `src/proxy.ts:9` `RUTAS_PUBLICAS` | Baja | Proxy |
| Nombre de la cookie | ✅ `'sesion'` (dos lugares) | `src/lib/session.ts:4`, `src/proxy.ts:7` | Baja (deben coincidir) | Servidor + proxy |
| Paquetes visibles | ✅ P1 y P2 habilitados; P3 y P4 no | `src/lib/navigation.ts` | Baja (activar sin páginas daría 404) | Frontend |
| Matriz de permisos | ✅ en la BD (`rol_permiso`) | Pantalla `/roles`; semilla `seed.sql:133-150` | Muy baja | BD |
| Rol por defecto en «Nuevo usuario» | ✅ primer rol de la lista, o 3 | `src/app/usuarios/page.tsx:36,104` | Muy baja | Frontend |
| Duración de los mensajes en `/usuarios` | ✅ 3500 y 4000 ms | `src/app/usuarios/page.tsx:45,50` | Muy baja | Frontend |
| Nombre de perfil | ✅ de 2 a 150 caracteres | `src/backend/usuarios/schema.ts:64` + `perfil-form.tsx:115-116` | Baja | Servidor + frontend |
| Teléfono | ✅ hasta 20 caracteres (la BD admite 30) | `src/backend/usuarios/schema.ts:15,24,65` | Baja | Servidor |
| Descripción de la bitácora | ✅ hasta 1000 (`registrarBitacora`); sin límite (`registrarEvento`) | `src/backend/bitacora/schema.ts:10,17` | Baja | Servidor |
| Mensaje del usuario inactivo | ✅ «Correo o contraseña incorrectos.» | `src/app/actions/auth.ts:120` | Baja | Servidor |
| Protección del ADMINISTRADOR | ✅ por nombre de rol | `src/app/actions/usuarios.ts:199`, `src/app/actions/roles.ts:128` | Media | Servidor |
| Cambio obligatorio de contraseña inicial | ❌ | — | Alta | BD + servidor + proxy/layout + UI |
| IP y navegador en la bitácora | ❌ | — | Media | BD + servidor + UI |

---

### C1 — Número de intentos de login
- **Petición posible:** «Que el sistema bloquee al quinto intento.»
- **Valor actual (evidencia):** `maxIntentos: 3` (`src/lib/bloqueo-cu01.ts:17`). Se usa en `src/app/actions/auth.ts:102,108,115`.
- **Antes:**
  ```ts
  // src/lib/bloqueo-cu01.ts:15-21
  export const CU01 = {
    maxIntentos: 3,
    minutosBloqueo: 1,
  } as const
  ```
- **Después:** `maxIntentos: 5,`
- **Capas:**
  - Servidor: sí.
  - Frontend: no; los mensajes se construyen con `CU01.maxIntentos`.
  - Supabase Auth: no aplica.
  - BD: no; las columnas guardan el estado, no la política.
  - Pruebas: no existen.
- **Verificación:** falla la contraseña 4 veces y lee «Te quedan 1 intento(s)». Al 5.º intento aparece el mensaje de bloqueo. Consulta 7.4 de [05](05-base-de-datos.md#7-consultas-de-solo-lectura-para-demostrar).
- **Riesgo:** ninguno funcional. Si el usuario ya tenía 3 o 4 intentos acumulados, el nuevo límite se aplica desde ese valor.

### C2 — Tiempo de bloqueo
- **Petición:** «Que el bloqueo dure 10 minutos.»
- **Actual:** `minutosBloqueo: 1` (`bloqueo-cu01.ts:20`). Se usa en `auth.ts:103,108`.
- **Después:** `minutosBloqueo: 10,`. El mensaje pasa a decir «10 minutos» (plural automático, `auth.ts:108`).
- **Capas:** solo el servidor.
- **Verificación:** fallar 3 veces; en la BD, `bloqueado_hasta` queda unos 10 minutos en el futuro.
- **Riesgo:** los bloqueos vigentes conservan su hora de fin anterior.

### C3 — Longitud mínima y política de contraseña
- **Petición:** «Exija 10 caracteres» o «no exija carácter especial».
- **Actual:** `src/lib/password.ts:11-25`:
  ```ts
  .min(8, 'La contraseña debe tener al menos 8 caracteres')      // L13
  .refine((p) => /[A-Z]/.test(p), 'Debe incluir al menos una letra mayúscula')  // L15
  .refine((p) => /[a-z]/.test(p), ...)                          // L16
  .refine((p) => /\d/.test(p), ...)                             // L17
  .refine((p) => /[^A-Za-z0-9]/.test(p), ...)                   // L18-21
  ```
- **Edición mínima:** cambiar `8` por `10` en L13 junto con su mensaje. Para quitar una regla, borrar su `.refine`.
- **Capas:**
  - **Servidor:** esta única línea afecta a CU02 (`src/backend/recuperar/schema.ts:18`), CU03 (`src/backend/usuarios/schema.ts:17,26`) y CU05 (`schema.ts:37`).
  - **Frontend** (solo textos y atributos, que no son la seguridad):
    - `src/app/recuperar/recuperar-form.tsx:186-189`: texto «Mínimo 8…»;
    - `src/app/perfil/perfil-form.tsx:180,200`: `minLength={8}`, y L185-188, el texto;
    - el modal de `usuarios/page.tsx` no tiene texto de ayuda.
  - **BD:** no aplica (solo guarda el hash).
  - **Login:** no aplica; solo exige que no esté vacía. Las contraseñas existentes siguen funcionando.
- **Verificación:** crea un usuario con una clave de 9 caracteres; debe mostrarse el mensaje nuevo.
- **Riesgo:** olvidar los textos del frontend genera incoherencia visual, no un fallo de seguridad.

### C4 — Duración del enlace de recuperación
- **Actual:** `const VIGENCIA_MINUTOS = 15` (`src/backend/recuperar/service.ts:15`), usado en L59. El texto fijo «caduca en 15 minutos» está en `recuperar-form.tsx:100`.
- **Edición:** cambiar el número en L15 y el texto en L100.
- **Capas:** servidor + texto. La BD guarda la fecha resultante.
- **Verificación:** consulta 7.5: `fecha_expiracion − fecha_creacion`.
- **Riesgo:** ⚠️ la columna es `TIMESTAMP` sin zona. Si el servidor no está en UTC, la vigencia real se desplaza (ver [05](05-base-de-datos.md#token_recuperacion)).

### C5 — Reutilización del enlace
- **Actual:** se rechaza si `data.usado` (`service.ts:94`) y se marca `usado: true` (`service.ts:130-136`).
- **Qué haría falta para permitirla:** quitar la condición `|| data.usado` y el `UPDATE`. **No es recomendable:** contradice RF04 («un solo uso», PDF-P p.18).
- 💡 **Mejora relacionada, NO IMPLEMENTADA:** invalidar los tokens anteriores del mismo usuario al emitir uno nuevo, con `UPDATE token_recuperacion SET usado=true WHERE usuario_id=… AND usado=false` antes del `INSERT` en L61.

### C6 — Permisos del técnico y del encargado
- **Petición:** «Que el encargado vea la Bitácora» o «que el técnico no vea Mi Perfil».
- **Actual:** la matriz vive en la **BD** (`rol_permiso`). La semilla está en `seed.sql:133-150`:
  - ENCARGADO: PERFIL, COTIZACIONES, ORDENES_TRABAJO, CAJA, VENTAS;
  - TECNICO: PERFIL, COTIZACIONES, ORDENES_TRABAJO.
- **Cambio correcto, sin tocar código:**
  1. Entrar como ADMINISTRADOR en `/roles`.
  2. Seleccionar ENCARGADO, activar «Bitácora» y pulsar «Guardar Cambios».
  3. `guardarPermisosRol` (`src/app/actions/roles.ts:104`) reescribe `rol_permiso` y registra `CONFIGURAR_ROLES_PERMISOS`.
- **No hacer:** añadir `if (usuario.rol?.nombre === 'ENCARGADO')` en el código. Rompería el diseño RBAC basado en datos.
- **Capas:** BD (datos). El Sidebar, el dashboard, los layouts y las acciones lo leen en cada petición.
- **Verificación:** entrar como encargado; «Bitácora (CU06)» aparece en el menú y `/bitacora` abre. Consulta 7.2.
- **Riesgos:**
  - Para instalaciones nuevas hay que actualizar también `seed.sql:140-143`, o la próxima instalación volverá al valor anterior.
  - Recuerda que `/perfil` **no** comprueba `PERFIL`: quitarlo solo lo oculta del menú.

### C7 — Estado activo o inactivo y su mensaje
- **Actual:**
  - Un usuario inactivo no puede entrar: `auth.ts:119-121` devuelve el mensaje genérico.
  - Pierde la sesión activa: `src/lib/auth.ts:28`.
- **Petición típica:** «Que muestre “Cuenta desactivada. Contacte al administrador” como dice el CU01» (PDF-P p.104).
- **Edición mínima:** en `auth.ts:120`, cambiar el texto.
  - Antes: `return { ok: false, error: 'Correo o contraseña incorrectos.' }`
  - Después: `return { ok: false, error: 'Cuenta desactivada. Contacte al administrador.' }`
- **Matiz:** esa comprobación está **después** de verificar la contraseña. El mensaje solo aparece si la contraseña es correcta, lo cual evita revelar el estado de la cuenta a quien no la conoce.
- **Capas:** servidor.
- **Verificación:** desactivar un técnico en `/usuarios` e intentar entrar con su contraseña.

### C8 — Eventos de la bitácora (contraseña, IP, navegador, logout, intentos fallidos)

| Evento | Estado | Evidencia |
|---|---|---|
| Cambio de contraseña (perfil) | ✅ `CAMBIAR_CONTRASENA` | `src/backend/usuarios/service.ts:239-243` |
| Recuperación | ✅ `SOLICITAR_RECUPERACION`, `RECUPERAR_CONTRASENA` | `src/backend/recuperar/service.ts:72,140` |
| Logout | ✅ `CIERRE_SESION` | `src/app/actions/auth.ts:167-172` |
| Login exitoso | ✅ `INICIO_SESION` | `auth.ts:140` |
| **Login fallido / bloqueo** | ❌ | Sin llamada a `registrarEvento` en `auth.ts:99-117` |
| **IP / navegador** | ❌ | `BITACORA` no tiene columnas para ello (`schema.sql:142-154`) |

- **Registrar intentos fallidos** (un solo archivo; sin cambios en la BD):
  - Dónde: `src/app/actions/auth.ts`, dentro del bloque `if (!contrasenaCorrecta)` (L99).
  - 💡 Propuesta: añadir `await registrarEvento(db, { usuario_id: usuario.id, accion: 'LOGIN_FALLIDO', descripcion: \`Intento ${intentos} de ${CU01.maxIntentos}\` })` dentro de un `try/catch`, igual que en L137-146. Añadir `'BLOQUEO_CUENTA'` cuando `intentos >= CU01.maxIntentos`.
  - Límite: no se puede registrar un intento sobre un correo inexistente, porque `usuario_id` es `NOT NULL` con FK.
- **Registrar IP y navegador** (multicapa). 💡 PROPUESTA — NO IMPLEMENTADO:
  1. **BD:** migración `ALTER TABLE bitacora ADD COLUMN ip VARCHAR(45), ADD COLUMN navegador TEXT;`. Hay que añadirla también a `schema.sql` y a `src/lib/supabase/database.types.ts` (tipos manuales, L458).
  2. **Servidor:** en `src/backend/bitacora/schema.ts`, campos opcionales `ip` y `navegador`. En las acciones, leer `(await headers()).get('x-forwarded-for')` y `get('user-agent')` desde `next/headers`.
  3. **Frontend:** columnas nuevas en `src/app/bitacora/page.tsx:71-92`.
  4. **Riesgo:** detrás de un proxy, `x-forwarded-for` puede traer varias IP o venir falsificado. En local se verá `::1`.

### C9 — Duración de la sesión y «Recordarme»
- **Actual:** 7 días en **dos** lugares:
  - `MAX_AGE_SECONDS = 60 * 60 * 24 * 7` (`src/lib/session.ts:5`);
  - `.setExpirationTime('7d')` (`session.ts:31`).
- **Edición:** cambiar ambos. Por ejemplo, `60 * 60 * 8` y `'8h'`.
- **«Recordarme»:** la casilla (`src/app/login/login-form.tsx:164-169`) no se lee.
  - 💡 Propuesta, NO IMPLEMENTADA: en `loginAction` leer `formData.get('recordarme') === 'on'` y pasar a `createSession` un parámetro de duración (por ejemplo, 8 horas o 30 días). Afecta a `session.ts` y a `auth.ts`.
- **Verificación:** DevTools → Application → Cookies → `sesion` → Expires.

### C10 — Cambio obligatorio de contraseña inicial
- **Estado:** ❌ NO IMPLEMENTADO. No hay columna, ni lógica, ni pantalla. Lo piden los apuntes (PDF-A p.18). El README solo *recomienda* cambiar la contraseña temporal.
- 💡 **PROPUESTA — NO IMPLEMENTADO** (multicapa, dificultad alta):
  1. **BD:** `ALTER TABLE usuario ADD COLUMN debe_cambiar_contrasena BOOLEAN NOT NULL DEFAULT TRUE;` y reflejarlo en `schema.sql`, `seed.sql` y `database.types.ts`.
  2. **Alta de usuario** (`src/backend/usuarios/service.ts:173`): dejarlo en `true`.
  3. **Cambio de contraseña** (`cambiarContrasena`, `service.ts:215`, y `restablecerContrasena` en recuperar): ponerlo en `false`.
  4. **Control:** en los layouts o en un layout común, si `usuario.debe_cambiar_contrasena`, redirigir a `/perfil?forzar=1`. El proxy no sirve porque no consulta la BD.
  5. **UI:** aviso en `src/app/perfil/perfil-form.tsx`.
- **Riesgo:** evitar un bucle de redirección excluyendo `/perfil` y la acción de logout.
