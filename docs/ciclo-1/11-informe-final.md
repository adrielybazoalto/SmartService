# 11 · INFORME FINAL DE PREPARACIÓN PARA DEFENSA

[← Índice](README.md) · Inspección del 2026-09-29, rama `dev-jorge`, commit `cf0b5a0`.

## 1. Resumen ejecutivo

SmartService Ciclo 1 es una aplicación **Next.js 16 (App Router) + React 19 + TypeScript**. Tiene:
- **autenticación propia**: bcrypt + JWT en una cookie `httpOnly`;
- **RBAC por módulo** guardado en PostgreSQL (`rol_permiso`);
- **Supabase usado solo como base de datos**, mediante una *service role key* exclusiva del servidor.

Los seis CU tienen pantalla y lógica de servidor funcional. Las diferencias principales con el documento son:
- no se usan Supabase Auth ni RLS;
- la recuperación no envía correo;
- los permisos son solo por módulo;
- no hay procedimientos, triggers ni pruebas automatizadas.

## 2. Estado por componente

| Implementado ✅ | Parcial ⚠️ | Pendiente ❌ |
|---|---|---|
| Login con bloqueo 3 intentos → 1 min | CU02: correo simulado, enlace en pantalla | Supabase Auth (decisión: no usarlo) |
| Logout con bitácora | CU04: sin «Nuevo Rol», sin permisos por acción | RLS (RNF05) |
| Sesión JWT + relectura en BD (estado, versión) | CU06: sin detalle, sin IP, muestra el ID | Envío real de correo |
| Política de contraseña (8 caracteres, mayúscula, minúscula, número, especial) | «Recordarme» sin efecto | Cambio obligatorio de la contraseña inicial |
| Hash bcrypt en todos los puntos de escritura | `/perfil` no comprueba el permiso `PERFIL` | Procedimientos y triggers del PDF |
| Recuperación: token SHA-256, 15 min, uso único, invalida sesiones | Bitácora no inmutable en la BD | Pruebas automatizadas |
| CRUD de usuarios (sin borrado), protecciones del administrador | Transacciones (RNF11) | Módulos P3 y P4 (órdenes de trabajo, notas de servicio, tickets, alertas, reportes…) |
| Matriz rol → módulo editable, menú dinámico | Tipos TypeScript escritos a mano | Stripe y OpenAI (instalados, sin uso) |
| Perfil (nombre, teléfono) y cambio de contraseña | | |
| Bitácora con filtros por fecha, usuario y acción | | |

## 3. Errores o brechas detectables en el código (sin corregir)

| # | Brecha | Evidencia | Gravedad |
|---|---|---|---|
| 1 | El enlace de recuperación se devuelve y se muestra en pantalla | `src/backend/recuperar/service.ts:76-78`, `src/app/recuperar/recuperar-form.tsx:93-98` | 🔴 Alta |
| 2 | `schema.sql` sin `rol_permiso.descripcion`; `seed.sql` fallaría | `schema.sql:40-59` frente a `seed.sql:133` | 🔴 Alta (instalación) |
| 3 | Sin RLS; la autorización es solo de aplicación | `schema.sql` | 🟠 Media |
| 4 | Al editar un usuario, el correo no se normaliza a minúsculas (podría impedir su login) | `src/backend/usuarios/service.ts:190-206` frente a `auth.ts:63` | 🟠 Media |
| 5 | `guardarPermisosRol` no es atómico | `src/app/actions/roles.ts:151-163` | 🟠 Media |
| 6 | El logout no invalida el JWT | `src/lib/session.ts:67-69` | 🟠 Media |
| 7 | El login revela si el correo existe (intentos restantes) y la recuperación también | `auth.ts:114`, `service.ts:56` | 🟡 Baja/Media |
| 8 | `token_recuperacion.fecha_expiracion` es `TIMESTAMP` sin zona | `schema.sql:127-140` | 🟡 Depende del servidor |
| 9 | Bitácora con `ON DELETE CASCADE` | `schema.sql:149-153` | 🟡 |
| 10 | El administrador puede quitarse permisos a sí mismo | `roles.ts:128` (solo restringe a los no administradores) | 🟡 |
| 11 | `/perfil` sin comprobar `PERFIL`; `crearClienteAction` sin comprobar el permiso de módulo | `src/app/perfil/`, `src/app/actions/clientes.ts:21` | 🟡 |
| 12 | Mensajes técnicos de la BD visibles para el usuario (por ejemplo, correo duplicado) | `service.ts:186`, `mensajeDeError` | 🟡 |
| 13 | Intentos fallidos y bloqueos no auditados | `auth.ts:99-117` | 🟡 |
| 14 | El cambio de contraseña en el perfil no invalida otras sesiones | `service.ts:215-245` | 🟡 |
| 15 | ESLint: 2 errores de reglas de hooks | `fecha-hora.tsx:53`, `recuperar/page.tsx:27` | 🟢 Calidad |
| 16 | Dos catálogos de módulos que deben coincidir | `src/lib/permisos.ts:28`, `src/lib/navigation.ts:40` | 🟢 Mantenimiento |

## 4. Contradicciones entre el código y los documentos

La tabla completa está en [07 §4](07-trazabilidad.md#4-contradicciones-entre-fuentes). Las cinco que más importan:
1. **Supabase Auth** (PDF) frente a **autenticación propia** (código).
2. **RLS** (RNF05) frente a **sin RLS**.
3. **ROL_FUNCION** con acciones (PDF) frente a **ROL_PERMISO** por módulo (código).
4. **Procedimientos y triggers** (PDF p.288-295) frente a **ninguno**.
5. **Laravel/PHP** en el marco teórico sugerido en los apuntes (PDF-A p.15) frente a **Next.js**. No lo menciones como tecnología del proyecto.

## 5. Cambios rápidos frente a cambios multicapa

| Rápidos (1 archivo) | Multicapa |
|---|---|
| Intentos: `src/lib/bloqueo-cu01.ts:17` | IP y navegador en la bitácora (BD + servicio + acciones + UI) |
| Minutos de bloqueo: `bloqueo-cu01.ts:20` | Cambio obligatorio de la contraseña inicial (BD + servicios + layouts + UI) |
| Política de contraseña: `src/lib/password.ts:13-20` (+ textos) | Envío real de correo (proveedor SMTP + variables de entorno + servicio + UI) |
| Vigencia del enlace: `src/backend/recuperar/service.ts:15` (+ texto L100) | RLS (SQL + comprobar grants) |
| Mensaje de usuario inactivo: `src/app/actions/auth.ts:120` | «Nuevo Rol» (UI + acción + permisos) |
| Duración de la sesión: `src/lib/session.ts:5,31` | «Recordarme» funcional (`auth.ts` + `session.ts`) |
| Permisos por rol: pantalla `/roles` (sin código) | Registrar los intentos fallidos (solo `auth.ts`; cambio de mediana dificultad) |

Detalle en [08-cambios-defensa.md](08-cambios-defensa.md).

## 6. Archivos esenciales para memorizar

| Archivo | Una frase para recordarlo |
|---|---|
| `src/proxy.ts` | Portero rápido: sin JWT válido, a `/login` |
| `src/lib/session.ts` | Crea, lee y borra la cookie JWT (HS256, 7 días, `httpOnly`) |
| `src/lib/auth.ts` | `getCurrentUser`: relee el usuario; rechaza si está inactivo o su versión cambió |
| `src/lib/password.ts` | Política de contraseña + bcrypt de costo 10 |
| `src/lib/permisos.ts` | RBAC desde `rol_permiso`; *fail-closed*; `requerirAccesoModulo` |
| `src/lib/bloqueo-cu01.ts` | 3 intentos, 1 minuto |
| `src/lib/navigation.ts` | Paquetes oficiales P1–P4: P1 y P2 (activos), P3 y P4 (bloqueados) |
| `src/app/actions/auth.ts` | `loginAction` / `logoutAction` |
| `src/app/actions/usuarios.ts` | CU03 con sus guardias |
| `src/app/actions/roles.ts` | CU04: leer y guardar la matriz |
| `src/app/actions/perfil.ts` | CU05 |
| `src/backend/recuperar/service.ts` | CU02: `ControlRecuperarContrasena` |
| `src/backend/bitacora/service.ts` | Registrar y listar eventos |
| `src/lib/supabase/service.ts` | Cliente único con la service role |
| `schema.sql` / `seed.sql` | Tablas y datos iniciales |

**Funciones clave:** `loginAction`, `logoutAction`, `createSession`, `getSession`, `getCurrentUser`, `requireUser`, `getPermisosDeRol`, `tienePermisoModulo`, `requerirAccesoModulo`, `hashContrasena`, `verificarContrasena`, `ControlRecuperarContrasena.{solicitarRecuperacion, verificarEnlace, restablecerContrasena}`, `GestorSesiones.invalidarSesiones`, `registrarUsuario`, `cambiarEstadoCuenta`, `guardarPermisosRol`, `actualizarPerfil`, `cambiarContrasena`, `registrarEvento`, `listarBitacora`.

**Tablas clave:** `usuario`, `rol`, `permiso`, `rol_permiso`, `token_recuperacion`, `bitacora` (y saber que `rol_funcion`, `modulo`, `accion` y `funcion` existen pero no autorizan nada).

## 7. Los 20 puntos prioritarios para dominar

1. El stack real: Next.js 16 App Router, React 19, TypeScript, Tailwind 4, Supabase **solo como PostgreSQL**.
2. No hay API REST propia: hay **Server Actions** (`src/app/actions/`).
3. Server frente a Client Components, con un ejemplo de cada uno (`sidebar.tsx` / `login-form.tsx`).
4. El orden exacto del login: bloqueo → bcrypt → intentos → estado → JWT → bitácora (`auth.ts:83,96,102,119,126,138`).
5. Bloqueo: 3 intentos → 1 minuto, configurable en `bloqueo-cu01.ts`.
6. Cómo es la cookie `sesion`: JWT HS256, `httpOnly`, `sameSite=lax`, 7 días.
7. Por qué se relee el usuario en cada petición: estado y `version_sesion`.
8. Contraseña: bcrypt de costo 10 en `usuario.contrasena`, nunca en texto plano ni en `auth.users`.
9. La política de contraseña está en un solo lugar: `password.ts`.
10. RBAC: `usuario.rol_id` → `rol_permiso` → `permiso`; se edita en `/roles`, sin código.
11. Tres niveles de control: menú (comodidad) → layout (redirige) → acción (rechaza).
12. Qué pasa con la URL directa, DevTools y las peticiones manuales ([06 §8](06-seguridad.md#8-matriz-de-amenazas-para-la-defensa)).
13. Recuperación: 32 bytes aleatorios, SHA-256 en la BD, 15 min, uso único, `version_sesion + 1`.
14. La recuperación **simula** el correo: saberlo decir con honestidad.
15. La service role salta RLS, y **no hay RLS**. La autorización es de aplicación.
16. Qué eventos registra la bitácora y cuáles no.
17. Protecciones del administrador: no desactivarlo, no cambiar el propio rol, solo un admin edita el rol admin.
18. Diferencias con el PDF: Supabase Auth, RLS, `ROL_FUNCION`, triggers, «Nuevo Rol», correo editable.
19. Cómo cambiar en vivo los intentos, el bloqueo, la política y los permisos de un rol.
20. El hallazgo `schema.sql`/`seed.sql` (`rol_permiso.descripcion`) y que no hay pruebas automatizadas.

## 8. Las 20 preguntas más conectadas con el código actual

Las respuestas están en [09](09-preguntas-ingeniera.md).

1. ¿Qué ocurre desde que pulso «Iniciar sesión»? (C1)
2. ¿Dónde está la regla de los 3 intentos y cómo la cambio a 5? (C2, H1)
3. ¿Dónde y cómo se guarda la contraseña? (F2, A5)
4. ¿Qué contiene la cookie de sesión y por qué es `httpOnly`? (A2)
5. ¿Qué pasa si modifico el JWT para ser administrador? (G3)
6. ¿Qué impide entrar a `/usuarios` escribiendo la URL? (D3)
7. ¿Qué pasa si habilito un botón con DevTools? (D4)
8. ¿Por qué el técnico no ve «Usuarios»? (D2)
9. ¿Cómo se asignan los permisos y dónde se guardan? (C7, A4)
10. ¿Qué pasa con la sesión de un usuario desactivado? (C5)
11. ¿Cómo funciona la recuperación y cómo evitan reutilizar el enlace? (C4, G1)
12. ¿Qué pasa con las sesiones abiertas al recuperar la contraseña? (G2)
13. ¿Usan RLS? ¿Por qué usan la service role? (A7)
14. ¿Tienen API REST? ¿Qué es una Server Action? (E1)
15. ¿Dónde se valida en el servidor? (E2, D5)
16. ¿Qué registra la bitácora? ¿Es inmutable? (C10, F5)
17. ¿Qué puede editar el usuario en su perfil y por qué no el correo? (C9)
18. ¿Pueden crear un rol nuevo? (C8)
19. ¿Por qué Next.js y PostgreSQL/Supabase? (F1)
20. ¿Cuál es el punto más débil hoy y cómo lo resolverían? (G4)

## 9. Plan de estudio priorizado

| Prioridad | Tiempo | Qué hacer |
|---|---|---|
| 1 | 30 min | Leer `src/app/actions/auth.ts` completo con [03 §3.1](03-backend-profundo.md#31-login-completo-paso-a-paso) al lado. Explicarlo en voz alta |
| 2 | 20 min | Leer `src/lib/session.ts`, `auth.ts`, `permisos.ts` y `password.ts` (unas 250 líneas en total) |
| 3 | 30 min | Recorrer la checklist de [10](10-guia-defensa.md#checklist-manual-por-cu) en el navegador |
| 4 | 20 min | Practicar C1, C3 y C6 de [08](08-cambios-defensa.md) (y revertir sin guardar) |
| 5 | 30 min | Banco de preguntas [09](09-preguntas-ingeniera.md), secciones C, D y G |
| 6 | 20 min | Contradicciones ([07 §4](07-trazabilidad.md#4-contradicciones-entre-fuentes)) y cómo responderlas |
| 7 | 15 min | BD: [05 §3](05-base-de-datos.md#3-tablas-del-ciclo-1-en-detalle) y las consultas 7.2 y 7.3 |

## 10. Qué **no** debemos afirmar en la defensa sin comprobarlo

- ❌ «Usamos Supabase Auth.» No se usa.
- ❌ «Tenemos RLS por rol.» No está en `schema.sql`. ❔ Solo podrías afirmarlo tras ejecutar la consulta 7.7 en la BD real.
- ❌ «La recuperación envía un correo.» Es un simulador.
- ❌ «Los permisos controlan crear, leer, actualizar, eliminar y procesar.» Solo controlan el acceso al módulo.
- ❌ «La bitácora es inmutable.» Solo por convención de la aplicación.
- ❌ «Tenemos triggers y procedimientos almacenados en el sistema.» Solo están en el PDF.
- ❌ «Hay pruebas unitarias.» No hay.
- ❌ «Está desplegado en Vercel.» ❔ No hay evidencia en el repositorio; solo afírmalo si lo muestras.
- ❌ «El logout invalida la sesión en el servidor.» Solo borra la cookie.
- ❌ «“Recordarme” mantiene la sesión.» No tiene efecto.
- ❌ «Se registra la IP.» No se registra.
- ❌ «El backend es Laravel.» No lo es.
- ❌ «`schema.sql` + `seed.sql` instalan todo desde cero.» Hoy fallaría por `rol_permiso.descripcion`.
- ⚠️ «Sin JavaScript funciona»: no está probado por ejecución.
