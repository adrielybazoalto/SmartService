# 07 · Trazabilidad: requisito → CU → PUDS → código → prueba

[← Índice](README.md) · Relacionados: [02 CU](02-casos-de-uso.md) · [03 Backend](03-backend-profundo.md) · [05 BD](05-base-de-datos.md)

> **Pruebas:** en el repositorio **no hay pruebas automatizadas**. En la columna «Prueba», «Manual» significa que es una comprobación sugerida en [10-guia-defensa.md](10-guia-defensa.md#checklist-manual-por-cu), no una prueba existente.
> **Análisis y diseño UML:** los diagramas de comunicación (PDF-P p.128-130), de clases de análisis (p.131-133) y de arquitectura (p.138) son imágenes. Su correspondencia uno a uno con el código es ❔ NO VERIFICABLE. Hay indicios por los nombres del código: `ControlRecuperarContrasena`, `GestorSesiones`, «Mensaje 1, 2, 5 (Diagrama)» en `src/app/usuarios/page.tsx:53`.

## 1. Cadena PUDS del Ciclo 1

| Flujo de trabajo PUDS | Artefacto en el PDF | Artefacto en el repositorio |
|---|---|---|
| Requisitos | RF01–RF05 (p.18), RNF (p.24-27), CU01–CU06 detallados (p.104-112), prototipos (p.113) | — |
| Análisis | Paquetes (p.120-121), comunicación (p.128), clases (p.131), paquetes (p.134-136) | `src/lib/navigation.ts` (P1–P3), nombres de clases de control en `src/backend/recuperar/service.ts:36` y `src/lib/sesiones.ts:12` |
| Diseño | Datos lógico y físico (p.138-191), procedimientos y triggers (p.288-295) | `schema.sql`, migraciones, `src/lib/supabase/database.types.ts` |
| Implementación | — | `src/app/**`, `src/backend/**`, `src/lib/**` |
| Pruebas | «unitarias y de caja negra» (p.17) | ❌ Ninguna automatizada |

## 2. Matriz de requisitos

| RF/RNF y fuente | CU | Frontend (ruta) | Lógica / servidor (ruta) | Auth / BD / RLS | Prueba | Estado | Brecha |
|---|---|---|---|---|---|---|---|
| **RF01** Gestión de cuentas (PDF-P p.18) | CU03 | `src/app/usuarios/page.tsx` | `src/app/actions/usuarios.ts`, `src/backend/usuarios/service.ts:173,190` | `usuario`, `rol`. Sin RLS | Manual | ✅ | Sin cambio de contraseña por el administrador. El correo no se pasa a minúsculas al editar |
| **RF02** RBAC con consulta, creación, modificación, anulación y procesamiento (p.18) | CU04 | `src/app/roles/page.tsx`, `src/components/sidebar.tsx` | `src/app/actions/roles.ts`, `src/lib/permisos.ts` | `rol_permiso`, `permiso`. `rol_funcion` sin uso | Manual | ⚠️ | Solo por módulo; sin granularidad por acción; sin «Nuevo Rol» |
| **RF03** Login con correo y contraseña + recuperación por correo (p.18) | CU01, CU02 | `src/app/login/login-form.tsx` | `src/app/actions/auth.ts:54` | `usuario`. Auth propia (JWT) | Manual | ✅ / ⚠️ | La recuperación no usa correo real |
| **RF04** Enlaces temporales de un solo uso (p.18) | CU02 | `src/app/recuperar/recuperar-form.tsx` | `src/backend/recuperar/service.ts` | `token_recuperacion` | Manual | ⚠️ | Sin envío; el enlace se ve en pantalla |
| **RF05** Bitácora automática e inmutable (p.18) | CU06 | `src/app/bitacora/page.tsx` | `src/backend/bitacora/service.ts` | `bitacora` (CASCADE) | Manual | ⚠️ | Sin IP ni navegador; no inmutable en la BD; aún no hay eventos de caja ni inventario (no existen esos módulos) |
| **RNF04** HTTPS/TLS (p.25) | Todos | — | `session.ts:37` (`secure` en producción) | — | — | ❔ | Depende del hosting |
| **RNF05** RLS por rol (p.25) | Todos | — | — | ❌ Sin RLS en `schema.sql` | — | ❌ | Autorización solo en la aplicación |
| **RNF06** Contraseñas mínimas y sesiones con token y expiración (p.25) | CU01, CU02, CU03, CU05 | Formularios | `src/lib/password.ts:11`, `src/lib/session.ts:31` | JWT 7 días | Manual | ✅ | Sin expiración por inactividad; el logout no invalida el JWT |
| **RNF07** Responsive con Tailwind (p.25) | Todos | Clases `sm:`, `md:`, `lg:` en las páginas | — | — | Manual | ⚠️ | El Sidebar tiene ancho fijo `w-64` sin menú móvil (`sidebar.tsx:31`) |
| **RNF11** Transacciones atómicas (p.26) | CU04 (y ciclos futuros) | — | `roles.ts:151-163` (DELETE + INSERT) | Sin transacción | — | ❌ | 💡 Usar `rpc` con una función SQL |
| **RNF12** TypeScript estricto (p.26) | Todos | `.tsx` | `.ts` | `database.types.ts` hecho a mano | `tsc --noEmit` → 0 errores | ✅ | Los tipos no se regeneran desde la BD |
| **RNF13** Modularidad (p.27) | Todos | `src/components/` | `src/backend/<dominio>/` | — | ESLint → 2 errores | ✅ | — |
| **Apuntes:** contraseña de 8 caracteres con mayúscula, minúscula, número y especial (PDF-A p.12, p.19) | CU02, CU03, CU05 | Texto de ayuda en los formularios | `src/lib/password.ts:13-20` | — | Manual | ✅ | — |
| **Apuntes:** bloquear al 3.er intento (PDF-A p.19) | CU01 | Mensajes en `login-form.tsx:66-70` | `src/lib/bloqueo-cu01.ts:17`, `auth.ts:102` | `usuario.intentos_fallidos`, `bloqueado_hasta` | Manual | ✅ | El bloqueo es temporal (1 min); no se audita |
| **Apuntes:** bitácora con IP, fecha y hora de entrada y salida, acciones (PDF-A p.9, p.19) | CU06 | — | `auth.ts:140,170` | `bitacora` sin IP | Manual | ⚠️ | Sin IP ni nombre visible |
| **Apuntes:** que el usuario cambie su contraseña al inicio (PDF-A p.18) | CU01, CU05 | — | — | Sin columna | — | ❌ | 💡 Ver [08](08-cambios-defensa.md#c10--cambio-obligatorio-de-contraseña-inicial) |

## 3. Matriz de casos de uso

| Caso de uso | Pantalla / componente | URL o acción real | Handler / función | Servicio | Tabla / Auth | Protección | Permiso | Estado |
|---|---|---|---|---|---|---|---|---|
| CU01 login | `src/app/login/login-form.tsx` `LoginForm` | `/login` → Server Action | `loginAction` (`auth.ts:54`) | (en la acción) + `password.ts`, `session.ts` | `usuario`, `rol`, `bitacora`. Auth propia | Pública | — | ✅ |
| CU01 logout | `src/components/sidebar.tsx` | Server Action | `logoutAction` (`auth.ts:162`) | `session.ts:67` | `bitacora` | Sesión | — | ✅ |
| CU02 solicitar | `recuperar-form.tsx` `FormularioEmail` | `/recuperar` | `solicitarRecuperacionAction` (`recuperar.ts:32`) | `ControlRecuperarContrasena.solicitarRecuperacion` | `usuario`, `token_recuperacion`, `bitacora` | Pública | — | ⚠️ |
| CU02 restablecer | `recuperar-form.tsx` `FormularioNuevaContrasena` | `/recuperar?token=` | `restablecerContrasenaAction` (`recuperar.ts:56`) | `restablecerContrasena`, `GestorSesiones` | `usuario`, `token_recuperacion`, `bitacora` | Token | — | ✅ |
| CU03 listar | `usuarios/page.tsx` | `/usuarios` | `listarUsuarios` (`usuarios.ts:85`) | `listarUsuarios`, `listarRoles` | `usuario`, `rol` | Layout + acción | `USUARIOS` | ✅ |
| CU03 crear/editar | Modal de `usuarios/page.tsx` | Server Action | `registrarUsuario` (L110) / `actualizarUsuario` (L148) | `crearUsuario` / `actualizarUsuario` | `usuario`, `bitacora` | Acción | `USUARIOS` | ✅ |
| CU03 activar/desactivar | Interruptor de `usuarios/page.tsx` | Server Action | `cambiarEstadoCuenta` (L181) | (consulta directa en la acción) | `usuario`, `bitacora` | Acción + reglas | `USUARIOS` | ✅ |
| CU04 ver/guardar | `roles/page.tsx` | `/roles` | `fetchRolesYPermisos` (L52) / `guardarPermisosRol` (L104) | (en la acción) | `rol`, `permiso`, `rol_permiso`, `bitacora` | Layout + acción + regla ADMINISTRADOR | `ROLES` | ⚠️ |
| CU05 datos | `perfil-form.tsx` | `/perfil` | `actualizarPerfilAction` (`perfil.ts:34`) | `actualizarPerfil` (`service.ts:122`) | `usuario`, `bitacora` | Sesión | (no comprueba `PERFIL`) | ✅ |
| CU05 contraseña | `perfil-form.tsx` | `/perfil` | `cambiarContrasenaAction` (`perfil.ts:75`) | `cambiarContrasena` (`service.ts:215`) | `usuario`, `bitacora` | Sesión + contraseña actual | — | ✅ |
| CU06 consultar | `bitacora/page.tsx`, `filtros-bitacora.tsx` | `/bitacora?filtros` | `listarBitacoraAction` (`bitacora.ts:11`) | `listarBitacora` (`service.ts:52`) | `bitacora` | Layout + acción | `BITACORA` | ⚠️ |
| CU06 detalle | ❌ | ❌ | ❌ | `getEventoPorId` (sin uso) | `bitacora` | — | — | ❌ |

## 4. Contradicciones entre fuentes

| PDF del proyecto | Apuntes | Código | Consecuencia para la defensa |
|---|---|---|---|
| Autenticación con **Supabase Auth** (p.45, p.65, p.17) | — | Autenticación **propia**: bcrypt + JWT; Supabase solo como BD | Explicar la decisión: control total de intentos, bloqueo y sesión. Actualizar el PDF |
| **RLS** por rol (RNF05, p.25) | — | Sin RLS; service role | No afirmar que hay RLS. Decir que la autorización es de aplicación y que RLS está pendiente |
| RBAC con `ROL_FUNCION` (módulo × función × acción) (p.138) | Privilegios por perfil, nivel o grupo (PDF-A p.49) | `ROL_PERMISO` por módulo; `ROL_FUNCION` sin uso | Explicar que se implementó el primer nivel (módulo) |
| 30 tablas; `TOKEN_RECUPERACION.token` en claro (p.139) | — | 32 tablas; `hash_token` (SHA-256) | Mejora de seguridad respecto al diseño |
| 5 procedimientos + 5 triggers (p.288-295) | Entrega de triggers y procedimientos (PDF-A p.6) | Ninguno en `schema.sql` | Si preguntan, están solo en el documento y el script del PDF, no en el repositorio |
| CU01: «Cuenta desactivada. Contacte al administrador» (p.104) | — | Mensaje genérico | Diferencia menor; se puede justificar por seguridad |
| CU01: no menciona el bloqueo | Bloquear al 3.er intento | 3 intentos → 1 min | Cumple los apuntes; el PDF debe actualizarse |
| CU02: el sistema **envía** el enlace (p.105) | — | Enlace en pantalla | Reconocer que es un simulador |
| CU03: solo el Administrador (p.107) | — | Cualquier rol con `USUARIOS` | Es RBAC configurable: por defecto solo el administrador |
| CU04: «Nuevo Rol»; el administrador no pierde permisos (p.108) | — | Sin «Nuevo Rol»; el administrador puede perder permisos | Brecha real |
| CU05: correo editable; «include» CU02 (p.110, p.118) | — | Correo de solo lectura; flujo propio | Diferencia de diseño |
| CU06: nombre de usuario y detalle (p.112-113) | IP, entrada y salida (PDF-A p.19) | ID de usuario, sin IP, sin detalle | Brecha real |
| Paquetes: **4** en 2.5.1 (p.117) y **6** en 3.1 (p.120) | «Paquete: Administración de usuarios» (PDF-A p.18) | 3 en `navigation.ts` (P1–P3), con los nombres de 3.1 | El PDF es incoherente consigo mismo; el código sigue la versión de 6 paquetes solo hasta P3 |
| «19 casos de uso», pero lista 20 (p.99) | «Realizar los 30» (PDF-A p.19) | CU01–CU06 | Corregir el texto del PDF |
| Stack Next.js | Marco teórico con **PHP 8 / Laravel 11** (PDF-A p.15, sugerencia generada) | Next.js 16 | **No mencionar Laravel.** No existe en el proyecto |
| Pruebas unitarias y de caja negra (p.17) | — | Ninguna | Decir que las pruebas fueron manuales |
