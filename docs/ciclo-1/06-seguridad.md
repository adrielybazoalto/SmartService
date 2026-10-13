# 06 · Seguridad: controles reales y sus límites

[← Índice](README.md) · Relacionados: [03 Backend](03-backend-profundo.md) · [05 BD](05-base-de-datos.md) · [08 Cambios](08-cambios-defensa.md)

Cada tema se explica en dos niveles: 🟢 **sencillo** (para decirlo en voz alta) y 🔧 **técnico** (con la evidencia).

## 1. Autenticación frente a autorización

- 🟢 **Autenticación** responde a «¿quién eres?»: correo más contraseña. **Autorización** responde a «¿qué puedes hacer?»: el rol y sus permisos.
- 🔧 En SmartService:
  - **Autenticación** = `loginAction` (`src/app/actions/auth.ts:54`) + bcrypt (`src/lib/password.ts:33`) + JWT (`src/lib/session.ts:27`).
  - **Autorización** = `src/lib/permisos.ts`, que lee `rol_permiso`.
  - Ambas son **código de la aplicación**. Supabase Auth y RLS **no participan** (ver [03 §1](03-backend-profundo.md#1-qué-tipo-de-backend-tiene-smartservice-comprobado)).

## 2. Sesión, cookie y JWT

- 🟢 Al iniciar sesión, el servidor entrega al navegador una «credencial» firmada (un JWT) dentro de una cookie. En cada visita, el servidor comprueba la firma y además vuelve a consultar la base de datos.
- 🔧 **Cómo es el JWT:**
  - HS256 con `AUTH_SECRET` y expiración de 7 días (`session.ts:28-32`).
  - Cookie `sesion`: `httpOnly`, `secure` en producción, `sameSite=lax`, `path=/`, `maxAge` de 7 días (`session.ts:35-41`).
  - Payload: `uid`, `nombre`, `correo`, `rol_id`, `rol`, `version`.
- 🔧 **Validación en dos niveles:**
  1. `proxy()` solo comprueba la firma (`src/proxy.ts:25-34`).
  2. `getCurrentUser()` relee `usuario`: debe existir, `estado=true` y `version_sesion` debe coincidir (`src/lib/auth.ts:20-31`).
- **Límites:**
  - ⚠️ **El logout no invalida el JWT en el servidor.** Solo borra la cookie (`session.ts:67-69`). Una copia robada seguiría siendo válida hasta 7 días, salvo que se desactive al usuario o se incremente `version_sesion`.
  - ⚠️ El JWT incluye `correo` y `nombre`. No están cifrados, solo firmados (base64), pero como la cookie es `httpOnly` no son accesibles desde JavaScript.
  - ⚠️ La casilla «Recordarme» no cambia la duración.
  - ⚠️ No hay expiración por inactividad.

## 3. Contraseñas y hash

- 🟢 La contraseña nunca se guarda tal cual. Se guarda una «huella» irreversible (hash) y, al iniciar sesión, se compara la huella.
- 🔧 **Qué se puede afirmar con evidencia:**
  - **Algoritmo:** bcrypt (`bcryptjs`) con costo 10 (`password.ts:5,29`), que incorpora *salt* automáticamente.
  - **Dónde se guarda:** `usuario.contrasena VARCHAR(255) NOT NULL` (`schema.sql:113`).
  - **Todo punto de escritura aplica el hash:**
    - crear usuario (`src/backend/usuarios/service.ts:175`);
    - editar con contraseña (`service.ts:200`);
    - cambio en el perfil (`service.ts:234`);
    - recuperación (`src/backend/recuperar/service.ts:117`).
  - **El hash nunca se envía al navegador** (`usuarioAEntidad`, `src/app/actions/usuarios.ts:55-66`).
  - **La bitácora nunca guarda contraseñas** (`service.ts:239-243`).
  - **Seed:** los usuarios iniciales tienen hashes bcrypt, no texto plano. La contraseña temporal está documentada en `README.md` y **no se reproduce aquí**.
  - **Supabase Auth:** no se usa, así que nada de esto depende de su configuración.
- 🔧 **Política** (`contrasenaSchema`, `password.ts:11-25`): de 8 a 72 caracteres, con mayúscula, minúscula, número y carácter especial, y ≤ 72 bytes. Coincide con los apuntes (PDF-A p.12, p.19).
- **Se aplica en:** alta de usuario, recuperación y cambio en el perfil. En el login solo se exige que la contraseña no esté vacía, lo cual es correcto.
- ⚠️ **No existe cambio obligatorio de contraseña** en el primer ingreso (lo pide PDF-A p.18). No hay columna ni lógica para ello.

## 4. Autorización: roles, permisos y RBAC

- 🟢 Cada usuario tiene **un** rol. Cada rol tiene una lista de módulos permitidos guardada en la base de datos. El menú, las páginas y las acciones consultan esa lista.
- 🔧 **Tablas:**
  - `usuario.rol_id` → `rol`;
  - `rol_permiso` (tabla intermedia N:M) → `permiso(nombre, ruta)`.
- 🔧 **Puntos de control:**

| Nivel | Qué hace | Dónde |
|---|---|---|
| Menú y dashboard | Oculta lo no permitido (comodidad, **no seguridad**) | `src/components/sidebar.tsx`, `src/app/page.tsx` |
| Página (layout) | Redirige sin permiso | `src/app/{usuarios,roles,bitacora}/layout.tsx` → `requerirAccesoModulo` (`permisos.ts:93`) |
| Acción | Rechaza sin permiso | `exigirAccesoUsuarios` (`usuarios.ts:47`), `roles.ts:59,109`, `bitacora.ts:13` |
| Reglas por dato | ADMINISTRADOR protegido, no cambiar el propio rol, no desactivarse a sí mismo | `usuarios.ts:156,199,206`, `roles.ts:128` |

- 🔧 **Fail-closed:** si falla la lectura de permisos, se devuelve `[]` y se niega todo (`permisos.ts:52-55`).
- **Brechas:**
  - ⚠️ No hay permisos por **acción**: CRUD y procesar están en `ROL_FUNCION`, que no se usa.
  - ⚠️ `/perfil` no comprueba `PERFIL`.
  - ⚠️ `tienePermisoModulo` devuelve `true` para rutas que no están en `MODULOS` (`permisos.ts:81`).
  - ⚠️ `crearClienteAction` no comprueba el permiso de módulo.
  - ⚠️ Un usuario con el permiso `USUARIOS` puede asignar el rol ADMINISTRADOR a otros.
  - ⚠️ Un ADMINISTRADOR puede quitarle permisos a su propio rol y quedarse sin acceso a `/roles`.

## 5. Recuperación de contraseña

| Etapa | Implementación | Evidencia | Estado |
|---|---|---|---|
| Emisión | Token de 32 bytes con `crypto.randomBytes` | `src/backend/recuperar/service.ts:21-23` | ✅ |
| Almacenamiento | Solo el SHA-256 en `token_recuperacion.hash_token` | `service.ts:17-19,61-65` | ✅ |
| Envío | ❌ **No hay correo.** `console.log` + **el enlace se devuelve y se muestra en la pantalla** | `service.ts:26-28,76-78`; `src/app/recuperar/recuperar-form.tsx:88-101` | ❌ 🔴 riesgo |
| Vencimiento | 15 min | `service.ts:15,59,97-98` | ✅ (⚠️ columna `TIMESTAMP` sin zona, ver [05](05-base-de-datos.md#token_recuperacion)) |
| Uso único | `usado=true` tras restablecer; se rechaza si ya se usó | `service.ts:94,130-136` | ✅ |
| Validación | Token, política de contraseña y confirmación | `service.ts:113-115` | ✅ |
| Invalidación de sesiones | `version_sesion + 1` | `src/lib/sesiones.ts:13-31` | ✅ |
| Auditoría | `SOLICITAR_RECUPERACION`, `RECUPERAR_CONTRASENA` | `service.ts:70-74,138-142` | ✅ |

**🔴 Riesgo principal:** quien conozca un correo registrado puede pedir el enlace, **verlo en pantalla** y cambiar la contraseña de esa cuenta, incluida la del administrador.

**Qué decir en la defensa:** «Es un simulador porque no hay SMTP. En producción el enlace solo debe viajar por correo.»

💡 PROPUESTA — NO IMPLEMENTADO: integrar un proveedor SMTP o transaccional, no devolver `enlace` al cliente y responder con un mensaje neutro, igual exista o no el correo.

**Otros puntos:**
- ⚠️ Los tokens anteriores de un usuario **no se invalidan** al pedir uno nuevo.
- ⚠️ No hay límite de solicitudes.

## 6. RLS y la service role

- 🟢 RLS sería una segunda cerradura dentro de la base de datos. Hoy **no está puesta**. La única cerradura es el servidor de la aplicación.
- 🔧 **Evidencia:**
  - `schema.sql` no habilita RLS.
  - La app usa `SUPABASE_SERVICE_ROLE_KEY`, que la saltaría de todas formas (`src/lib/supabase/service.ts:7-11`).
  - Las políticas de `auth_bridge.sql` pertenecen al diseño abandonado con Supabase Auth.
  - ❔ Para saber el estado remoto, usa las consultas 7.7 y 7.8 de [05](05-base-de-datos.md#7-consultas-de-solo-lectura-para-demostrar).
- **Contraste:** RNF05 del PDF (PDF-P p.25) exige RLS por rol → ❌.

## 7. CSRF, XSS y otros

- **CSRF:**
  - 🟢 Evita que otra página web envíe formularios en tu nombre.
  - 🔧 Las Server Actions solo aceptan `POST`, y Next.js compara el encabezado `Origin` con el `Host` (documentación local: `node_modules/next/dist/docs/01-app/02-guides/data-security.md:546-550`). La cookie es `sameSite=lax`.
  - No hay configuración adicional (`next.config.ts` está vacío).
  - ✅ Protección del framework. ❔ No probada por ejecución.
- **Open redirect:** `destinoSeguro` (`auth.ts:40-42`) y `login/page.tsx:14` solo aceptan rutas internas. ✅
- **XSS:**
  - React escapa el contenido.
  - No hay `dangerouslySetInnerHTML` en `src/` (búsqueda sin resultados).
  - Las descripciones de la bitácora se muestran como texto. ✅
- **Inyección SQL:** no se escribe SQL a mano; `supabase-js` (PostgREST) parametriza los filtros. ✅
- **Mensajes de error:** algunos exponen texto técnico de PostgreSQL (`No se pudo …: ${error.message}`). ⚠️
- **Enumeración de cuentas:**
  - el login revela intentos restantes solo si el correo existe (`auth.ts:114`);
  - la recuperación dice «No existe una cuenta…». ⚠️
- **Fuerza bruta:**
  - bloqueo por cuenta: 3 intentos → 1 minuto;
  - no hay límite por IP ni CAPTCHA;
  - los intentos fallidos no se auditan. ⚠️
- **Cabeceras de seguridad (CSP, HSTS…):** no configuradas en el repositorio. ❔ HTTPS depende del hosting (RNF04).

## 8. Matriz de amenazas para la defensa

| Amenaza | ¿Qué pasa realmente? | Evidencia | Resultado |
|---|---|---|---|
| **URL directa sin sesión** (`/usuarios`) | El proxy redirige a `/login?next=/usuarios` | `src/proxy.ts:38-42` | ✅ Bloqueado |
| **URL directa con sesión pero sin permiso** (técnico → `/usuarios`) | El layout redirige a `/?aviso=sin_permiso` y aparece «No tiene permisos…» | `src/app/usuarios/layout.tsx`, `permisos.ts:98` | ✅ Bloqueado |
| **URL directa `/perfil` con `PERFIL` retirado** | Entra igual (solo exige sesión) | No hay `perfil/layout.tsx` | ⚠️ Permitido |
| **DevTools: habilitar un botón o interruptor deshabilitado** (rol ADMINISTRADOR en `/roles`) | La acción rechaza al no administrador | `roles.ts:128` | ✅ |
| **DevTools: añadir un campo `rol_id` en el perfil** | Se ignora; la acción solo lee `nombre` y `telefono` | `perfil.ts:41-47` | ✅ |
| **Petición manual a la Server Action** (sin cookie) | `requireUser`/`tienePermisoModulo` lanzan error o devuelven «No autorizado» | `auth.ts:34-39`, `usuarios.ts:47-52` | ✅ |
| **Petición manual a `crearClienteAction`** con sesión de técnico | ⚠️ Solo exige sesión, no permiso. ❔ Además, no se verificó si Next expone el ID de una acción que ningún cliente importa | `src/app/actions/clientes.ts:20-22` | ⚠️ |
| **Rol alterado en el JWT** | La firma falla y, aun sin fallar, el rol se relee de la BD | `session.ts:51`, `auth.ts:20-24` | ✅ |
| **Rol alterado en el `<select>` al crear un usuario** | Se acepta cualquier rol existente si se tiene `USUARIOS`; no hay regla sobre quién puede crear administradores | `usuarios.ts:110-146` | ⚠️ Por diseño |
| **Usuario inactivo con sesión abierta** | En la siguiente petición `getCurrentUser` devuelve `null`: el proxy lo deja pasar, pero las páginas lo tratan como no autenticado | `auth.ts:28` | ✅ |
| **Usuario inactivo intenta el login** | Mensaje genérico. Si falla la contraseña, acumula intentos | `auth.ts:96-121` | ✅ (⚠️ el mensaje no coincide con el PDF) |
| **Token de recuperación reutilizado** | «Enlace expirado, reinicie el proceso» | `recuperar/service.ts:94` | ✅ |
| **Token vencido** | El mismo mensaje | `service.ts:97-98` | ✅ |
| **Pedir la recuperación de otra persona** | 🔴 El enlace aparece en pantalla y permite cambiar su contraseña | `recuperar-form.tsx:93-98` | ❌ |
| **JWT copiado después del logout** | Sigue siendo válido hasta 7 días | `session.ts:67-69` | ⚠️ |
| **Fuerza bruta distribuida en varias cuentas** | Solo hay bloqueo por cuenta | `auth.ts:99-117` | ⚠️ |
| **Lectura directa de la BD con la anon key** | ❔ Depende de los grants remotos. La app no usa la anon key | `seed.sql:19-21` | ❔ |
| **Borrar un usuario para ocultar su rastro** | La interfaz no ofrece borrado. En la BD, `ON DELETE CASCADE` borraría su bitácora | `schema.sql:149-153` | ⚠️ |
