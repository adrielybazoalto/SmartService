# 09 · Banco de preguntas para la defensa

[← Índice](README.md)

> **Formato de cada pregunta:**
> 🗣️ **respuesta corta** para decir en voz alta · 🔧 explicación técnica · 📍 referencia · estado.
> Son preguntas **posibles**, deducidas del código y los documentos. No son peticiones reales de la Ing.

## A. Conceptos

**A1. ¿Qué diferencia hay entre autenticación y autorización en su sistema?**
- 🗣️ Autenticar es comprobar quién es el usuario con su correo y contraseña. Autorizar es decidir qué módulos puede usar según su rol.
- 🔧 La autenticación está en `loginAction` (bcrypt + JWT). La autorización está en `src/lib/permisos.ts`, que lee `rol_permiso`.
- 📍 `src/app/actions/auth.ts:54` · `src/lib/permisos.ts:44-99`
- ✅

**A2. ¿Qué es una sesión en SmartService?**
- 🗣️ Es una cookie segura con un token firmado que dice quién eres; el servidor la valida en cada petición.
- 🔧 JWT HS256 en la cookie `sesion`, `httpOnly`, `sameSite=lax`, 7 días. `getCurrentUser` además relee el usuario en la BD.
- 📍 `src/lib/session.ts:27-43` · `src/lib/auth.ts:16-32`
- ✅

**A3. ¿Qué es RBAC y cómo lo aplican?**
- 🗣️ Control de acceso por roles: los permisos se asignan al rol, no a cada persona.
- 🔧 `usuario.rol_id` → `rol` → `rol_permiso` → `permiso(nombre, ruta)`. Cambiar la matriz no requiere tocar código.
- 📍 `schema.sql:20-59` · `/roles`
- ✅ por módulo · ⚠️ sin acciones CRUD

**A4. ¿Para qué sirve la tabla intermedia `rol_permiso`?**
- 🗣️ Resuelve la relación muchos a muchos: un rol tiene muchos permisos y un permiso puede estar en muchos roles.
- 🔧 PK `id`, FK `rol_id` y `permiso_id` con `ON DELETE CASCADE`, y `UNIQUE (rol_id, permiso_id)` para evitar duplicados.
- 📍 `schema.sql:40-59`
- ✅

**A5. ¿Qué es un hash y por qué no cifran la contraseña?**
- 🗣️ Un hash es irreversible. No necesitamos recuperar la contraseña, solo comprobarla.
- 🔧 bcrypt con *salt* y costo 10: es lento a propósito, contra la fuerza bruta. Cifrar implicaría guardar una clave capaz de descifrar todas las contraseñas.
- 📍 `src/lib/password.ts:5,28-37`
- ✅

**A6. ¿Qué es un token de recuperación?**
- 🗣️ Una cadena aleatoria de un solo uso, con 15 minutos de vigencia, que demuestra que pediste recuperar la cuenta.
- 🔧 32 bytes de `crypto.randomBytes`. En la BD solo se guarda el SHA-256, con `fecha_expiracion` y `usado`.
- 📍 `src/backend/recuperar/service.ts:15-23,61-65`
- ✅

**A7. ¿Qué es RLS? ¿La usan?**
- 🗣️ Son reglas de PostgreSQL por fila. Hoy no la usamos: la autorización se hace en el servidor de la aplicación.
- 🔧 `schema.sql` no ejecuta `ENABLE ROW LEVEL SECURITY`. La app usa la service role, que la saltaría de todos modos. RNF05 queda pendiente.
- 📍 [05 §4](05-base-de-datos.md#4-rls-row-level-security)
- ❌

**A8. ¿Qué es CSRF y cómo se protegen?**
- 🗣️ Es cuando otra página intenta enviar acciones en tu nombre. Next.js solo acepta Server Actions por POST y desde el mismo origen, y nuestra cookie es `sameSite=lax`.
- 🔧 Next.js compara `Origin` con `Host` (documentación local `node_modules/next/dist/docs/01-app/02-guides/data-security.md:546-550`) y `sameSite: 'lax'` (`session.ts:38`).
- ✅ del framework · ❔ no probado

## B. PUDS / UML

**B1. ¿Cómo aplicaron PUDS en este ciclo?**
- 🗣️ Iteración 1, dirigida por casos de uso. Priorizamos CU01–CU06 por su riesgo y su dependencia, e hicimos requisitos, análisis, diseño e implementación de ese paquete.
- 🔧 Priorización en PDF-P p.100-103 · paquete en p.117 · análisis en p.120-136 · diseño de datos en p.138+. Implementación en `src/`.
- ⚠️ Falta el flujo de pruebas automatizadas.

**B2. ¿Por qué CU01–CU06 primero?**
- 🗣️ Porque todo el sistema depende de saber quién entra y qué puede hacer; tienen la mayor significancia arquitectónica.
- 🔧 PDF-P p.100 (criterios) y p.136 («todos los paquetes dependen de P1»).

**B3. ¿Qué relaciones hay entre los casos de uso?**
- 🗣️ CU02 extiende a CU01, y en el diseño CU05 incluye a CU02. CU01 es precondición de los demás.
- 🔧 PDF-P p.118. En el código, CU02 se abre desde el enlace del login (`login-form.tsx:171-176`). CU05 **no reutiliza** el código de CU02; solo comparten `contrasenaSchema`.
- ⚠️

**B4. ¿Dónde están en el código las clases de análisis?**
- 🗣️ Las clases de control aparecen con su nombre, como `ControlRecuperarContrasena` y `GestorSesiones`; las interfaces son las páginas y las entidades son las tablas.
- 🔧 `src/backend/recuperar/service.ts:36` · `src/lib/sesiones.ts:12`. Los diagramas del PDF (p.131-133) son imágenes: ❔ no se puede verificar su correspondencia exacta.

**B5. ¿Cómo se organiza en paquetes?**
- 🗣️ P1 Seguridad y Accesos está activo; P2 y P3 aparecen bloqueados hasta los siguientes ciclos.
- 🔧 `src/lib/navigation.ts:40-100`. El PDF tiene 4 paquetes en p.117 y 6 en p.120; el código sigue los nombres de la versión de 6.

## C. Casos de uso

**C1. ¿Qué pasa desde que pulso «Iniciar sesión»?** (la más probable)
- 🗣️ El formulario envía el correo y la contraseña a una función del servidor. Esta valida el formato, busca al usuario, revisa si está bloqueado, compara la contraseña con bcrypt, cuenta los intentos, comprueba que esté activo, crea la cookie de sesión, registra en la bitácora y redirige.
- 🔧 Traza completa en [03 §3.1](03-backend-profundo.md#31-login-completo-paso-a-paso): `auth.ts` L58 → L62 → L67 → L83 → L96 → L99 → L119 → L126 → L138 → L156.
- ✅

**C2. ¿Qué pasa al tercer intento fallido?**
- 🗣️ La cuenta queda bloqueada un minuto y se muestra cuánto falta.
- 🔧 `CU01.maxIntentos=3` y `minutosBloqueo=1` (`src/lib/bloqueo-cu01.ts:17,20`). Se guarda en `bloqueado_hasta` (`auth.ts:102-110`).
- ✅

**C3. ¿Cómo cierra sesión?**
- 🗣️ Registra el cierre en la bitácora, borra la cookie y vuelve al login.
- 🔧 `logoutAction` (`auth.ts:162-181`). ⚠️ El JWT no se invalida en el servidor.

**C4. ¿Cómo funciona la recuperación?**
- 🗣️ Se genera un enlace seguro que vence en 15 minutos y sirve una sola vez. Al usarlo se cambia la contraseña, se cierran las demás sesiones y se registra en la bitácora.
- 🔧 [02 → CU02](02-casos-de-uso.md#cu02--recuperar-contraseña). ⚠️ **Sin SMTP: el enlace se muestra en pantalla (simulador).**

**C5. ¿Cómo desactivan un usuario y qué pasa con su sesión?**
- 🗣️ Con el interruptor de `/usuarios`. Desde su siguiente petición deja de estar autenticado.
- 🔧 `cambiarEstadoCuenta` (`usuarios.ts:181`) y `getCurrentUser` con `estado=false` → `null` (`src/lib/auth.ts:28`).
- ✅

**C6. ¿Puede un administrador desactivarse a sí mismo o a otro administrador?**
- 🗣️ No, el servidor lo impide.
- 🔧 `usuarios.ts:199` (rol ADMINISTRADOR) y `:206` (uno mismo).
- ✅

**C7. ¿Cómo se asignan los permisos a un rol?**
- 🗣️ En `/roles`: se elige el rol, se activan los módulos y se guarda; queda en `rol_permiso` y el menú cambia al instante.
- 🔧 `guardarPermisosRol` (`roles.ts:104-179`): `DELETE` + `INSERT` + bitácora + `revalidatePath`.
- ⚠️ No es atómico.

**C8. ¿Pueden crear un rol nuevo?**
- 🗣️ Hoy no desde la interfaz; está previsto en el diseño.
- 🔧 `crearRol` existe (`src/backend/usuarios/service.ts:31`) sin pantalla.
- ❌

**C9. ¿Qué puede editar el usuario en su perfil?**
- 🗣️ Nombre, teléfono y contraseña. El correo, el rol y el estado son de solo lectura.
- 🔧 `perfil-form.tsx:63-134` · `actualizarPerfil` solo actualiza `nombre` y `telefono` (`service.ts:139`).
- ✅ (el PDF decía que el correo sería editable)

**C10. ¿Qué registra la bitácora?**
- 🗣️ Inicio y cierre de sesión, recuperación, alta, edición y cambio de estado de usuarios, cambios de permisos, perfil y contraseña.
- 🔧 Lista con líneas en [02 → CU06](02-casos-de-uso.md#cu06--gestionar-bitácora-de-auditoría). ❌ Sin intentos fallidos ni IP.

## D. Frontend

**D1. ¿Qué es un Server Component y un Client Component? Deme un ejemplo.**
- 🗣️ El de servidor se ejecuta solo en el servidor y puede consultar la BD. El de cliente se ejecuta en el navegador y maneja clics y estado.
- 🔧 Servidor: `src/components/sidebar.tsx` (lee los permisos). Cliente: `src/app/login/login-form.tsx` (`'use client'`, `useActionState`).

**D2. ¿Por qué el técnico no ve «Usuarios» en el menú?**
- 🗣️ Porque su rol no tiene ese permiso en la BD, y el menú se arma con esos permisos.
- 🔧 `sidebar.tsx` filtra por `getPermisosDeRol`; en el seed, el técnico tiene PERFIL, COTIZACIONES y ORDENES_TRABAJO (`seed.sql:146-148`).

**D3. ¿Y si escribe `/usuarios` en la barra de direcciones?**
- 🗣️ El servidor lo redirige al inicio con el mensaje «No tiene permisos para acceder a este módulo».
- 🔧 `src/app/usuarios/layout.tsx` → `requerirAccesoModulo` (`permisos.ts:93-99`) → `src/app/page.tsx:22,43`.
- ✅

**D4. Si con DevTools habilito un botón deshabilitado, ¿qué pasa?**
- 🗣️ Nada: el servidor vuelve a comprobarlo todo.
- 🔧 Ejemplo: el interruptor del rol ADMINISTRADOR (`roles/page.tsx:258`) frente a la regla en el servidor (`roles.ts:128`).
- ✅

**D5. ¿La validación de la contraseña es solo en el navegador?**
- 🗣️ No. El navegador solo ayuda; la regla real la aplica el servidor con Zod.
- 🔧 [04 §5](04-frontend-profundo.md#5-validación-visual-frente-a-validación-exigida-en-el-servidor). El formulario de alta de usuario solo tiene `required`; la política está en `src/lib/password.ts`.

**D6. ¿Qué datos de usuarios llegan al navegador?**
- 🗣️ Nombre, correo, teléfono, rol y estado; nunca la contraseña ni su hash.
- 🔧 `usuarioAEntidad` (`usuarios.ts:55-66`).

## E. Servidor

**E1. ¿Tienen API REST o controladores?**
- 🗣️ No hay una API propia. Usamos Server Actions de Next.js, funciones del servidor que el formulario invoca directamente.
- 🔧 No existe `src/app/api/` ni `route.ts`. Las acciones están en `src/app/actions/*.ts` (`'use server'`).

**E2. ¿Dónde se valida en el servidor?**
- 🗣️ Con esquemas Zod en cada dominio, antes de tocar la BD.
- 🔧 `src/backend/usuarios/schema.ts`, `src/backend/recuperar/schema.ts`, `src/backend/bitacora/schema.ts` y `loginSchema` (`auth.ts:13`).

**E3. ¿Qué pasa si alguien llama a una Server Action sin sesión?**
- 🗣️ Recibe «No autorizado» y no se ejecuta nada.
- 🔧 `requireUser` lanza un error (`src/lib/auth.ts:34-39`); `tienePermisoModulo` devuelve `false` sin usuario (`permisos.ts:78`).

**E4. ¿Por qué el proxy no basta?**
- 🗣️ Porque solo revisa que el token esté firmado; no sabe si el usuario fue desactivado ni sus permisos. Eso se revisa en cada página y acción.
- 🔧 `src/proxy.ts:22-49` frente a `src/lib/auth.ts:28-30`.

## F. Base de datos

**F1. ¿Por qué PostgreSQL y Supabase?**
- 🗣️ PostgreSQL es relacional, robusto e integra bien restricciones y FK. Supabase nos da PostgreSQL gestionado en la nube, con una API REST y respaldo.
- 🔧 PDF-P p.25-26 (RNF). En el código, Supabase se usa **solo como BD**.

**F2. ¿Dónde se guarda la contraseña?**
- 🗣️ En la columna `contrasena` de `usuario`, como hash bcrypt; no en Supabase Auth.
- 🔧 `schema.sql:113` · consulta 7.3 de [05](05-base-de-datos.md#7-consultas-de-solo-lectura-para-demostrar) (muestra el prefijo `$2a$`/`$2b$` sin revelar el hash).

**F3. ¿Un usuario puede tener varios roles?**
- 🗣️ No, uno solo. Es una FK en `usuario`.
- 🔧 `usuario.rol_id` (`schema.sql:110,119-123`). No existe `usuario_rol`.

**F4. ¿Tienen triggers o procedimientos?**
- 🗣️ Están en el documento del diseño, pero la aplicación resuelve esas reglas en el código del servidor; en el script actual del repositorio no están.
- 🔧 PDF-P p.288-295 frente a `schema.sql` (ninguno).
- ❌

**F5. ¿La bitácora se puede alterar?**
- 🗣️ La aplicación no tiene ninguna función para editarla ni borrarla. A nivel de BD falta blindarla.
- 🔧 Sin `update` en `src/backend/bitacora/`. `ON DELETE CASCADE` desde `usuario` (`schema.sql:149-153`).
- ⚠️

## G. Seguridad

**G1. ¿Qué impide reutilizar un enlace de recuperación?**
- 🗣️ Al usarlo se marca como usado, y cualquier intento posterior se rechaza.
- 🔧 `service.ts:94` (verificación) y `:130-136` (`usado=true`).
- ✅

**G2. ¿Qué pasa con las sesiones abiertas al recuperar la contraseña?**
- 🗣️ Se invalidan todas.
- 🔧 `version_sesion + 1` (`src/lib/sesiones.ts:25`) y comparación en `src/lib/auth.ts:30`.
- ✅

**G3. ¿Qué pasa si alguien modifica su token para ser administrador?**
- 🗣️ La firma deja de coincidir y se rechaza; además, el rol se lee de la BD, no del token.
- 🔧 `jwtVerify` (`session.ts:51`) · `auth.ts:20-24`.
- ✅

**G4. ¿Cuál es el punto más débil hoy?**
- 🗣️ La recuperación todavía muestra el enlace en pantalla porque no tenemos servidor de correo, y la base no tiene RLS. Ambos están identificados como siguiente paso.
- 🔧 [06 §5](06-seguridad.md#5-recuperación-de-contraseña) y [06 §6](06-seguridad.md#6-rls-y-la-service-role).
- *(Responder con honestidad suma puntos.)*

## H. Cambios en vivo

**H1. «Cambie el bloqueo a 5 intentos.»**
- 🗣️ Es un valor de configuración.
- 🔧 `src/lib/bloqueo-cu01.ts:17` → `maxIntentos: 5`. Los mensajes se adaptan solos. [08 C1](08-cambios-defensa.md#c1--número-de-intentos-de-login)

**H2. «Que el encargado pueda ver la bitácora.»**
- 🗣️ No hace falta programar: lo configuro en Roles y Permisos.
- 🔧 `/roles` → ENCARGADO → Bitácora → Guardar. [08 C6](08-cambios-defensa.md#c6--permisos-del-técnico-y-del-encargado)

**H3. «Exija 10 caracteres.»**
- 🔧 `src/lib/password.ts:13` más los textos de ayuda. [08 C3](08-cambios-defensa.md#c3--longitud-mínima-y-política-de-contraseña)

**H4. «Muestre “Cuenta desactivada”.»**
- 🔧 `src/app/actions/auth.ts:120`. [08 C7](08-cambios-defensa.md#c7--estado-activo-o-inactivo-y-su-mensaje)

**H5. «¿Cómo termina un caso de uso en código?»**
- 🗣️ Del CU salen la pantalla (`page.tsx`), la función de servidor (acción), el servicio con su validación y las tablas; por ejemplo, CU03 va de `usuarios/page.tsx` a `usuarios.ts`, luego a `backend/usuarios` y termina en `usuario`/`bitacora`.
- 🔧 [07 §3](07-trazabilidad.md#3-matriz-de-casos-de-uso).
