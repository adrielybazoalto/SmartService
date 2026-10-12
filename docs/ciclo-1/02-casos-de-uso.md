# 02 · Casos de uso CU01–CU06: diseño frente a software real

[← Índice](README.md) · Relacionados: [03 Backend](03-backend-profundo.md) · [04 Frontend](04-frontend-profundo.md) · [05 BD](05-base-de-datos.md) · [06 Seguridad](06-seguridad.md)

> Cada CU separa **lo que exige el diseño** (PDF-P / PDF-A) de **lo que hace el software**, siempre con ruta y línea.
> Los diagramas de comunicación y de clases del PDF (PDF-P p.128–134) son imágenes: su contenido es ❔ NO VERIFICABLE desde el texto. Aun así, el código usa nombres que parecen venir de ellos: `ControlRecuperarContrasena`, `GestorSesiones`, «Mensaje 6 (Diagrama)», `lblMensajeError`, `IU_AdministrarUsuarios`.

## Resumen

| CU | Pantalla (URL) | Server Action principal | Servicio | Tablas | Estado |
|---|---|---|---|---|---|
| CU01 | `/login` | `loginAction`, `logoutAction` (`src/app/actions/auth.ts:54,162`) | — (lógica en la acción) | `usuario`, `rol`, `bitacora` | ✅ con matices |
| CU02 | `/recuperar`, `/recuperar?token=…` | `solicitarRecuperacionAction`, `restablecerContrasenaAction` (`src/app/actions/recuperar.ts:32,56`) | `ControlRecuperarContrasena` (`src/backend/recuperar/service.ts:36`) | `usuario`, `token_recuperacion`, `bitacora` | ⚠️ correo simulado |
| CU03 | `/usuarios` | `listarUsuarios`, `registrarUsuario`, `actualizarUsuario`, `cambiarEstadoCuenta` (`src/app/actions/usuarios.ts`) | `src/backend/usuarios/service.ts` | `usuario`, `rol`, `bitacora` | ✅ |
| CU04 | `/roles` | `fetchRolesYPermisos`, `guardarPermisosRol` (`src/app/actions/roles.ts:52,104`) | — (consultas en la acción) | `rol`, `permiso`, `rol_permiso`, `bitacora` | ⚠️ |
| CU05 | `/perfil` | `actualizarPerfilAction`, `cambiarContrasenaAction` (`src/app/actions/perfil.ts:34,75`) | `actualizarPerfil`, `cambiarContrasena` | `usuario`, `bitacora` | ✅ |
| CU06 | `/bitacora` | `listarBitacoraAction` (`src/app/actions/bitacora.ts:11`) | `listarBitacora` | `bitacora` | ⚠️ |

---

## CU01 — Gestionar Inicio y Cierre de Sesión

### Diseño (PDF-P p.104)
- **Actores:** Administrador, Encargado y Técnico. **Prioridad:** Alta.
- **Precondición:** usuario registrado y activo.
- **Flujo:** ingresar correo y contraseña → «Iniciar Sesión» → validar credenciales → identificar el rol → registrar en la bitácora → redirigir.
- **Subflujo de cierre:** registrar en la bitácora, destruir la sesión e ir al login.
- **Excepciones:**
  - «Usuario o contraseña incorrectos»;
  - «Cuenta desactivada. Contacte al administrador».
- **Requisito:** RF03 (PDF-P p.18).
- **Prototipo** (PDF-P p.113): incluye la casilla «Recordarme».
- **Apuntes** (PDF-A p.13, p.19): «manejar intentos fallidos», «bloquear 3er intento».

### Software real

**Pantalla:**
- `src/app/login/page.tsx` → `PaginaLogin` (Server Component, L8). Sanea el parámetro `next`.
- `src/app/login/login-form.tsx` → `LoginForm` (Client Component, L18).

**Flujo real de login** (orden exacto de `loginAction`, `src/app/actions/auth.ts:54-160`):

1. El navegador envía el `<form action={formAction}>` (`login-form.tsx:62`) con los campos `email`, `password`, `next` y `recordarme`.
2. `destinoSeguro(next)` (L40-42) acepta solo rutas internas que empiezan por `/` y no por `//`. Esto evita *open redirect*.
3. Zod `loginSchema` (L13-16, aplicado en L62-65): el correo debe tener formato válido y la contraseña no puede estar vacía. El correo se pasa a minúsculas.
4. Consulta de `usuario` junto con `rol` por correo (L67-72).
5. **Si el correo no existe:** «Correo o contraseña incorrectos.» (L76-78).
6. **Si hay un bloqueo vigente:** se rechaza **antes** de comprobar la contraseña, informando los segundos restantes (L83-91). Si el bloqueo ya venció, los contadores se reinician (L94).
7. `verificarContrasena` compara con bcrypt (L96).
8. **Contraseña incorrecta:** suma un intento.
   - Si llega a `CU01.maxIntentos` (3), fija `bloqueado_hasta = ahora + 1 min` y reinicia el contador (L102-110).
   - Si no, responde «Contraseña incorrecta. Te quedan N intento(s).» (L112-116).
9. **Usuario inactivo** (`estado=false`): «Correo o contraseña incorrectos.» (L119-121). ⚠️ Esta comprobación va **después** de la contraseña.
10. Contadores a 0 (L124) → `createSession` con el JWT en la cookie (L126-133).
11. Bitácora `INICIO_SESION` (L135-145). Si falla, se registra en consola y el login continúa.
12. `revalidatePath('/', 'layout')` y `redirect(destino)` (L154-157).

**Cierre de sesión:** `logoutAction` (L162-181) lo ejecuta el botón del Sidebar (`src/components/sidebar.tsx`, `<form action={logoutAction}>`).
1. Registra `CIERRE_SESION` si hay un usuario.
2. `destroySession()` borra la cookie.
3. Redirige a `/login`.

**Tablas:** `usuario` (lee `correo`, `contrasena`, `estado`, `intentos_fallidos`, `bloqueado_hasta`, `version_sesion`; escribe los contadores), `rol` y `bitacora`.

**Permisos:** no aplica; la pantalla es pública (`RUTAS_PUBLICAS`, `src/proxy.ts:9`). Si alguien con sesión válida visita `/login`, se le redirige a `/` (`proxy.ts:44-46`).

### Variaciones y errores

| Situación | Mensaje real | Evidencia |
|---|---|---|
| Correo inexistente | «Correo o contraseña incorrectos.» | `auth.ts:77` |
| Contraseña incorrecta, 1.º o 2.º intento | «Contraseña incorrecta. Te quedan N intento(s).» | `auth.ts:114` |
| 3.er intento | «Has superado el límite de 3 intentos fallidos. Tu cuenta estará bloqueada durante 1 minuto.» | `auth.ts:106-109` |
| Durante el bloqueo | «Tu cuenta ha sido bloqueada temporalmente… en N segundos.» | `auth.ts:88-90` |
| Usuario inactivo y contraseña correcta | «Correo o contraseña incorrectos.» | `auth.ts:120` |
| Falla de BD | «No se pudo consultar el usuario.» | `auth.ts:73` |

### Contraste

| Aspecto | PDF | Apuntes | Código |
|---|---|---|---|
| Mensaje de credenciales | «Usuario o contraseña incorrectos» | — | Genérico para correo inexistente, pero **revela los intentos restantes** si el correo existe |
| Usuario inactivo | «Cuenta desactivada. Contacte al administrador» | — | Mensaje genérico; ❌ no coincide |
| Intentos | No lo menciona | Bloquear al 3.er intento | ✅ 3 intentos → bloqueo **temporal de 1 minuto** |
| «Recordarme» | En el prototipo | — | ⚠️ La casilla existe (`login-form.tsx:164-169`), pero **`loginAction` no la lee**: la sesión dura siempre 7 días |
| Registro en bitácora | Sí | Accesos y salidas | ✅ `INICIO_SESION` / `CIERRE_SESION`. ❌ Los intentos fallidos y los bloqueos **no** se registran |
| Sesión invalidada en el servidor al salir | Sí («queda invalidada en el servidor») | — | ⚠️ Solo se borra la cookie. El JWT es *stateless*: una copia sigue siendo válida hasta que expira (ver [06](06-seguridad.md#2-sesión-cookie-y-jwt)) |

**Estado:** ✅ IMPLEMENTADO, con las diferencias anteriores.

### ¿Qué sucede al presionar este botón?

**«Iniciar sesión»** (`login-form.tsx:180-186`)
- **Evento y llamada:** el formulario (`useActionState`) hace un POST a la Server Action `loginAction`.
- **Validación:** HTML (`type=email`, `required`) en el navegador y Zod en el servidor.
- **BD:** `SELECT usuario` y luego `UPDATE` de contadores; bcrypt en Node.
- **Respuesta:** `{ok:false, error}` o una redirección.
- **Lo que se ve:** un recuadro rojo con el error, o el dashboard `/`. Mientras tanto, el botón muestra «Validando...» (`pendiente`).

**«Cerrar sesión»** (Sidebar)
- **Evento y llamada:** el formulario hace un POST a `logoutAction`.
- **Operación:** `INSERT` en `bitacora`, borrado de la cookie.
- **Lo que se ve:** la pantalla `/login`.

**Ojo (mostrar/ocultar contraseña):** solo cambia el `type` del input en el navegador (`login-form.tsx:130-132`). No hay servidor de por medio.

### Cómo demostrarlo
1. Entra con un usuario del seed y observa la redirección a `/` y el Sidebar según su rol.
2. Falla la contraseña 3 veces: verás los mensajes de intentos restantes y el mensaje de bloqueo.
3. Espera 1 minuto y vuelve a entrar.
4. En `/bitacora`, filtra por `INICIO_SESION`.
5. Consulta de solo lectura: ver [05 → consultas](05-base-de-datos.md#7-consultas-de-solo-lectura-para-demostrar).

---

## CU02 — Recuperar Contraseña

### Diseño (PDF-P p.105)
- **Flujo:** «¿Olvidaste tu contraseña?» → ingresar correo → «el sistema **envía** un enlace con vigencia limitada» → nueva contraseña → validar el formato y actualizar.
- **Excepciones:** «No existe una cuenta asociada a este correo» y «enlace expirado».
- **Postcondición:** se invalidan las sesiones previas y se registra en la bitácora.
- **Requisitos:** RF04: enlace temporal de un solo uso (PDF-P p.18). **Apuntes:** «Recuperar pw» (PDF-A p.19).

### Software real

**Pantalla:** `src/app/recuperar/page.tsx` → `PaginaRecuperar` (Server Component, L16).
- Sin `token`, muestra el formulario 1 (correo).
- Con `?token=`, ejecuta `verificarEnlace` en el servidor (L26). Si es válido muestra el formulario 2; si no, vuelve al formulario 1 con el error (L28-32).
- Componentes cliente: `src/app/recuperar/recuperar-form.tsx` (`FormularioEmail` L73, `FormularioNuevaContrasena` L141).

**Paso 1 · solicitar** (`solicitarRecuperacionAction`, `src/app/actions/recuperar.ts:32`):
1. Llama a `ControlRecuperarContrasena.solicitarRecuperacion` (`src/backend/recuperar/service.ts:43`).
2. Zod valida el correo, que se normaliza a minúsculas.
3. Busca el `usuario`. Si no existe, lanza «No existe una cuenta asociada a este correo» (L56).
4. `crearTokenSeguro()` genera `randomBytes(32)` en hexadecimal (L21-23).
5. Inserta en `token_recuperacion` **solo el hash SHA-256** junto con `fecha_expiracion = ahora + 15 min` (L59-68; `VIGENCIA_MINUTOS=15`, L15).
6. Registra `SOLICITAR_RECUPERACION` en la bitácora (L70-74).
7. `enviarCorreoRecuperacion` **solo hace `console.log`** (L26-28).
8. Devuelve `{correo, enlace}`, y **la pantalla muestra el enlace** (`recuperar-form.tsx:80-100`).

**Paso 2 · restablecer** (`restablecerContrasenaAction`, `recuperar.ts:56` → `restablecerContrasena`, `service.ts:109`):
1. `verificarEnlace` (L86-101): el token debe existir, no estar `usado` y no haber vencido. Si no, lanza «Enlace expirado, reinicie el proceso».
2. Zod `nuevaContrasenaSchema` exige la política de contraseña y que la confirmación coincida.
3. Aplica el hash bcrypt y hace `UPDATE usuario.contrasena` (L115-122).
4. `GestorSesiones.invalidarSesiones` hace `version_sesion + 1` (L127; `src/lib/sesiones.ts:13`).
5. Marca el token como `usado = true` (L130-136).
6. Registra `RECUPERAR_CONTRASENA` en la bitácora (L138-142).

**Permisos:** ruta pública (`src/proxy.ts:9`).

### Contraste

| Aspecto | Diseño | Código |
|---|---|---|
| Envío por correo | Obligatorio (RF03/RF04) | ❌ No hay SMTP. ⚠️ **El enlace se muestra en pantalla**, lo que en producción permite restablecer la cuenta de cualquier correo conocido (ver [06](06-seguridad.md#5-recuperación-de-contraseña)) |
| Vigencia limitada | Sí | ✅ 15 min (`service.ts:15`) |
| Un solo uso | Sí | ✅ Campo `usado` (`service.ts:94,132`) |
| Invalidar sesiones | Sí | ✅ `version_sesion` |
| Bitácora | Sí | ✅ `SOLICITAR_RECUPERACION` y `RECUPERAR_CONTRASENA` |
| «Correo no registrado» | Mensaje explícito | ✅ Igual. Esto permite **enumerar cuentas** (práctica de seguridad discutible) |

**Estado:** ⚠️ PARCIALMENTE IMPLEMENTADO. Falta el envío real por correo.

### Botones
- **«Enviar enlace de recuperación»** (`recuperar-form.tsx:129-135`): POST a `solicitarRecuperacionAction` → `INSERT` en `token_recuperacion` y `bitacora` → la pantalla muestra «Revisa tu correo…» junto con el enlace simulado.
- **«Restablecer contraseña»** (`recuperar-form.tsx:205-211`): POST con los campos ocultos `token`, `contrasena` y `confirmacion` → `UPDATE` en `usuario` y `token_recuperacion` → mensaje verde con el enlace «Iniciar sesión».

### Cómo demostrarlo
1. En `/login`, pulsa «¿Olvidaste tu contraseña?», ingresa un correo existente y abre el enlace mostrado.
2. Cambia la contraseña.
3. Vuelve a abrir el **mismo** enlace: debe decir «Enlace expirado, reinicie el proceso» (uso único).
4. Si tenías otra sesión abierta con ese usuario, al recargar te lleva a `/login` (`version_sesion`).

---

## CU03 — Administrar Usuarios

### Diseño (PDF-P p.107)
- **Actor:** Administrador.
- **Flujo:** listar → «Crear Usuario» → datos y rol → guardar → validar y registrar.
- **Subflujos:** modificar, consultar y filtrar por nombre, rol o estado, y activar o desactivar «con revocación de sesiones».
- **Excepciones:** «El correo electrónico ya se encuentra registrado» y campos incompletos.
- **Requisito:** RF01 (PDF-P p.18). **Prototipo:** tabla con modal (PDF-P p.113).

### Software real

**Protección:** `src/app/usuarios/layout.tsx` (Server Component) llama a `requerirAccesoModulo('/usuarios')`. Si el rol no tiene `USUARIOS` en `rol_permiso`, redirige a `/?aviso=sin_permiso`.

**Pantalla:** `src/app/usuarios/page.tsx` → `AdministrarUsuariosPage` (Client Component, L15).
- Al montarse (`useEffect`, L79-94) llama a las Server Actions `listarUsuarios()` y `obtenerRolesActivos()`.
- **El filtrado es local**, en el navegador (L170-184).

**Server Actions** (`src/app/actions/usuarios.ts`). Todas empiezan con `exigirAccesoUsuarios()` (L47-52), que ejecuta `tienePermisoModulo('/usuarios')` y luego `requireUser()`:

| Acción | Líneas | Qué hace |
|---|---|---|
| `listarUsuarios` | L85-91 | Lee `usuario` y `rol`; mapea a `UsuarioEntity` **sin el hash** (`usuarioAEntidad`, L55-66) |
| `obtenerRolesActivos` | L93-103 | Lista `rol` |
| `registrarUsuario` | L110-146 | `crearUsuario` (`service.ts:173`): Zod `crearUsuarioSchema` más hash bcrypt y correo en minúsculas. Bitácora `REGISTRO_USUARIO` |
| `actualizarUsuario` | L148-179 | Impide cambiar **el propio rol** (L156). `actualizarUsuario` del servicio (L190). Bitácora `MODIFICACION_USUARIO` |
| `cambiarEstadoCuenta` | L181-233 | Rechaza si el objetivo tiene rol `ADMINISTRADOR` (L199) o si es uno mismo (L206). `UPDATE estado`. Bitácora `CAMBIO_ESTADO` |

**«Revocación de sesiones» al desactivar:** ✅ se cumple de forma indirecta. `getCurrentUser()` rechaza a cualquier usuario con `estado=false` en cada petición (`src/lib/auth.ts:28`). No incrementa `version_sesion`, pero no hace falta.

### Variaciones y errores

| Caso | Resultado real |
|---|---|
| Correo duplicado | ⚠️ No hay mensaje propio. Se muestra «No se pudo registrar el usuario: …» seguido del **texto técnico de PostgreSQL** por la restricción `UNIQUE` (`service.ts:186`) |
| Contraseña débil | Mensaje de Zod de `contrasenaSchema` (`src/lib/password.ts:11-25`) |
| Desactivar a un ADMINISTRADOR | «Acción denegada: no se puede desactivar a un Administrador principal.» |
| Desactivarse a sí mismo | «Acción denegada: no puedes desactivar tu propia cuenta.» |
| Cambiar el propio rol | «No puedes cambiar tu propio rol de usuario.» |
| Rol sin permiso USUARIOS | La página redirige. Las acciones lanzan «No autorizado…» |

**Hallazgos del código:**
- ⚠️ Al **editar**, el correo no se convierte a minúsculas (`actualizarUsuario`, `service.ts:190-206`). El login sí convierte a minúsculas (`auth.ts:63`), así que un correo editado con mayúsculas **no podría iniciar sesión**.
- ⚠️ En modo edición no se puede cambiar la contraseña desde la interfaz (el campo se oculta, `page.tsx:414`), aunque el servicio lo soporta.
- ⚠️ La regla del ADMINISTRADOR (L199) también impide **reactivar** a un administrador inactivo, y el mensaje habla de «desactivar».
- ⚠️ Los límites de Zod (correo 100, teléfono 20) difieren de la BD (`VARCHAR(150)` y `VARCHAR(30)`, `schema.sql:108-119`).

### Contraste
| Aspecto | PDF | Código |
|---|---|---|
| Actor | Solo Administrador | Cualquier rol que tenga `USUARIOS` en `rol_permiso`. En el seed, solo el ADMINISTRADOR lo tiene |
| Mensaje de correo duplicado | Explícito | Mensaje técnico |
| Filtros por nombre, rol y estado | Sí | ✅ En el cliente |

**Estado:** ✅ IMPLEMENTADO, con los hallazgos anteriores.

### Botones
- **«+ Agregar Nuevo Usuario»** (L216-221): abre el modal (`solicitarCreacionUsuario`, L97). No hay llamada al servidor.
- **«Guardar» del modal** (L462-467):
  1. `onSubmit={handleGuardarFormulario}` (L120) llama a `registrarUsuario(...)` o a `actualizarUsuario(...)`.
  2. En el servidor: permiso → Zod → hash → `INSERT/UPDATE usuario` → `INSERT bitacora`.
  3. En la pantalla: mensaje verde durante 3,5 s y recarga de la lista (`cargarDatos`), o mensaje rojo durante 4 s.
- **✏️ Editar** (L345-351): precarga el modal. No hay servidor.
- **Interruptor activo/inactivo** (L355-360): `onChange` → `cambiarEstadoCuenta(id, !estado)` → `UPDATE usuario.estado` → mensaje y recarga.

### Cómo demostrarlo
1. Entra como ADMINISTRADOR y crea un usuario TECNICO con una contraseña débil: aparece el error de política. Repite con una contraseña válida.
2. Desactiva ese usuario e intenta iniciar sesión con él: verás el mensaje genérico.
3. Intenta desactivar al ADMINISTRADOR: verás el mensaje de denegación.
4. En `/bitacora`, filtra `REGISTRO_USUARIO` y `CAMBIO_ESTADO`.

---

## CU04 — Configurar Roles y Asignar Permisos

### Diseño (PDF-P p.108)
- **Flujo:** ver los roles → seleccionar uno o **«Nuevo Rol»** → marcar o desmarcar permisos por módulo → guardar → actualizar la matriz.
- **Excepción:** «El rol Administrador Principal no puede perder permisos del sistema».
- **Requisito:** RF02: permisos de «consulta, creación, modificación, anulación y procesamiento» (PDF-P p.18).
- **Apuntes:** privilegios por «Perfil / Nivel / Grupo» (PDF-A p.49).

### Software real

**Protección:** `src/app/roles/layout.tsx` → `requerirAccesoModulo('/roles')`.

**Pantalla:** `src/app/roles/page.tsx` → `RolesPage` (Client Component, L20).
- Carga `fetchRolesYPermisos()` al montarse (L58-73).
- Muestra una columna de roles y otra de interruptores por módulo.

**Server Actions** (`src/app/actions/roles.ts`):
- **`fetchRolesYPermisos`** (L52-101):
  1. Comprueba el permiso `/roles`.
  2. Calcula `esSesionAdministrador` (L63).
  3. Lee `rol`, `permiso` y `rol_permiso ⋈ permiso`.
- **`guardarPermisosRol(rolId, nombresPermisos)`** (L104-179):
  1. Permiso `/roles`.
  2. Verifica que el rol exista.
  3. **Solo un ADMINISTRADOR puede editar el rol ADMINISTRADOR** (L128).
  4. Valida que los nombres existan en `permiso`.
  5. `DELETE rol_permiso WHERE rol_id` (L151) seguido de `INSERT` de las nuevas filas (L155).
  6. Bitácora `CONFIGURAR_ROLES_PERMISOS` (L165-169).
  7. `revalidatePath` para refrescar el Sidebar y el dashboard (L172-174).

**Cómo se aplica el permiso guardado:** `getPermisosDeRol` (`src/lib/permisos.ts:44-60`) lee `rol_permiso` en cada petición, y lo usan:
- el Sidebar (`src/components/sidebar.tsx`);
- el dashboard (`src/app/page.tsx`);
- los layouts protegidos y las Server Actions.

### Contraste

| Aspecto | Diseño | Código |
|---|---|---|
| «Nuevo Rol» | Sí | ❌ No hay interfaz. `crearRol` existe en `src/backend/usuarios/service.ts:31`, pero **nadie lo llama** |
| Permisos por acción (CRUD + procesar) | RF02 | ❌ La tabla `ROL_FUNCION` con `ACCION` se carga en el seed (`seed.sql:82-113`) pero **ningún código la consulta para autorizar**. El control real es **por módulo** (`ROL_PERMISO`). «Cotizaciones (solo lectura)» es solo un texto |
| El Administrador no pierde permisos | Excepción explícita | ❌ Un ADMINISTRADOR puede quitarle permisos a su propio rol, incluido `ROLES`. Solo se bloquea a los **no** administradores |
| Guardado atómico | RNF11 (integridad) | ⚠️ `DELETE` + `INSERT` sin transacción. Si el `INSERT` falla, el rol queda sin permisos |
| Bitácora | Sí | ✅ Si la bitácora falla, la acción lanza un error **después** de guardar |

**Estado:** ⚠️ PARCIALMENTE IMPLEMENTADO. Falta crear roles y la granularidad por acción.

### Botones
- **Tarjeta de rol** (L177-202): `setRolSeleccionadoId`. Solo cambia el estado local.
- **Interruptor de módulo** (`role="switch"`, L253-270): `toggleModulo` (L80-88). Solo cambia el estado local; está deshabilitado si `rolBloqueado`.
- **«Guardar Cambios»** (L139-145): `handleGuardarCambios` (L90-111) → `guardarPermisosRol` → `DELETE/INSERT` en `rol_permiso` e `INSERT` en `bitacora` → `router.refresh()` y recarga de la configuración → mensaje verde.

### Cómo demostrarlo
1. Como ADMINISTRADOR, activa `BITACORA` para el rol TECNICO y guarda.
2. Entra como técnico: la Bitácora aparece en el Sidebar y el dashboard.
3. Desactiva el permiso y guarda. El técnico, al navegar a `/bitacora`, es redirigido con el aviso «No tiene permisos para acceder a este módulo» (`src/app/page.tsx`).

---

## CU05 — Configurar Perfil Personal

### Diseño (PDF-P p.110)
- **Actores:** todos los usuarios autenticados.
- **Campos editables:** «nombre, teléfono, **correo de contacto**, contraseña».
- **Cambio de contraseña:** «include» CU02 (PDF-P p.118).
- **Excepciones:** contraseña actual incorrecta y formato inválido. **Postcondición:** bitácora.

### Software real

**Pantalla:** `src/app/perfil/page.tsx` → `PaginaPerfil` (Server Component, L11).
- Llama a `getPerfil(db)` (`src/backend/usuarios/service.ts:105`), que internamente usa `requireUser()`.
- Pasa a `PerfilForm` (Client Component, `src/app/perfil/perfil-form.tsx:27`) solo: nombre, teléfono, correo, nombre del rol y estado.

**Formulario 1, «Guardar cambios»:** `actualizarPerfilAction` (`src/app/actions/perfil.ts:34-68`).
1. `requireUser()`.
2. `actualizarPerfil` (`service.ts:122-166`): Zod (nombre de 2 a 150 caracteres, teléfono hasta 20) → lee el estado previo → `UPDATE usuario (nombre, telefono)`.
3. Bitácora `ACTUALIZAR_PERFIL`, con el antes y el después (L147-165).
4. `createSession` de nuevo, para refrescar el nombre en el JWT (L50-57).

**Formulario 2, «Cambiar contraseña»:** `cambiarContrasenaAction` (`perfil.ts:75-95`) → `cambiarContrasena` (`service.ts:215-245`).
1. Zod: actual no vacía, nueva según `contrasenaSchema`, confirmación igual.
2. bcrypt compara la contraseña actual. Si no coincide, lanza «Contraseña actual incorrecta» sin tocar la BD (L230).
3. Nuevo hash → `UPDATE usuario.contrasena`.
4. Bitácora `CAMBIAR_CONTRASENA`, sin incluir contraseñas.

**Permisos:** solo exige sesión. ⚠️ **No** verifica el permiso `PERFIL` de `rol_permiso`: no hay `src/app/perfil/layout.tsx`. Aunque se le quite `PERFIL` a un rol, `/perfil` sigue accesible por URL; solo desaparece del menú.

### Contraste
| Aspecto | Diseño | Código |
|---|---|---|
| Editar correo | Sí | ❌ Solo lectura (`perfil-form.tsx:69-80`) |
| «include» CU02 | Sí | ⚠️ Flujo propio; solo comparte `contrasenaSchema` |
| Contraseña actual incorrecta | Mensaje y cancelación | ✅ |
| Invalidar otras sesiones al cambiar la contraseña | No lo exige | ❌ No se hace (CU02 sí lo hace) |
| Bitácora | Sí | ✅ Si la bitácora falla, el usuario ve un error aunque el cambio **ya se guardó** |

**Estado:** ✅ IMPLEMENTADO, con diferencias respecto al diseño.

### Botones
- **«Guardar cambios»** (`perfil-form.tsx:136-142`): POST a `actualizarPerfilAction` → `UPDATE usuario` e `INSERT bitacora` → cookie renovada → «Perfil actualizado correctamente.»
- **«Cambiar contraseña»** (`perfil-form.tsx:207-213`): POST a `cambiarContrasenaAction` → comparación bcrypt → `UPDATE` e `INSERT` → «Contraseña cambiada correctamente.»

---

## CU06 — Gestionar Bitácora de Auditoría

### Diseño (PDF-P p.112)
- **Actor:** Administrador.
- **Flujo:** listado cronológico con ID de usuario, marca de tiempo, acción y descripción → filtros por fechas, usuario y acción → **ver detalle** del evento.
- **Excepción:** «No se encontraron registros de bitácora para los filtros seleccionados».
- **Requisito:** RF05, registro «automático e inmutable» (PDF-P p.18).
- **Prototipo** (PDF-P p.113): muestra **el nombre del usuario**.
- **Apuntes:** «IP de la máquina, fecha entrada, hora entrada, acciones, fecha salida» (PDF-A p.19) y «Ip maquina, Nombre de Usuario» (PDF-A p.9).

### Software real

**Protección:** `src/app/bitacora/layout.tsx` → `requerirAccesoModulo('/bitacora')`.

**Pantalla:** `src/app/bitacora/page.tsx` → `BitacoraPage` (Server Component, L19).
1. Lee los filtros de `searchParams`.
2. Llama a `listarBitacoraAction(filtros)` directamente en el servidor.
3. Pinta la tabla. Si no hay filas, muestra exactamente el mensaje del PDF (L62-66).

**Filtros:** `src/app/bitacora/filtros-bitacora.tsx` (Client Component). Convierte las fechas a ISO y **navega** con `router.push('/bitacora?…')` (L19-35).

**Acción:** `listarBitacoraAction` (`src/app/actions/bitacora.ts:11-20`) comprueba `tienePermisoModulo('/bitacora')` y aplica Zod `filtrarBitacoraSchema` → `listarBitacora` (`src/backend/bitacora/service.ts:52-64`):
- `ORDER BY fecha_hora DESC`;
- `gte`/`lte` por fecha;
- `eq` por `usuario_id` y por `accion`.

**Hora:** `FechaHoraBolivia` (`src/app/bitacora/fecha-hora.tsx:49`) formatea en `America/La_Paz` en el cliente.

**Eventos que realmente se registran:**

| Acción | Dónde |
|---|---|
| `INICIO_SESION` | `src/app/actions/auth.ts:140` |
| `CIERRE_SESION` | `src/app/actions/auth.ts:170` |
| `SOLICITAR_RECUPERACION` | `src/backend/recuperar/service.ts:72` |
| `RECUPERAR_CONTRASENA` | `src/backend/recuperar/service.ts:140` |
| `REGISTRO_USUARIO` | `src/app/actions/usuarios.ts:133` |
| `MODIFICACION_USUARIO` | `src/app/actions/usuarios.ts:171` |
| `CAMBIO_ESTADO` | `src/app/actions/usuarios.ts:221` |
| `CONFIGURAR_ROLES_PERMISOS` | `src/app/actions/roles.ts:167` |
| `ACTUALIZAR_PERFIL` | `src/backend/usuarios/service.ts:162` |
| `CAMBIAR_CONTRASENA` | `src/backend/usuarios/service.ts:241` |

**Eventos que no se registran:** intentos fallidos de login, bloqueo de cuenta, accesos denegados y la propia consulta de la bitácora.

### Contraste
| Aspecto | Diseño / apuntes | Código |
|---|---|---|
| Actor | Administrador | Cualquier rol con `BITACORA`. En el seed, solo el ADMINISTRADOR |
| Nombre de usuario | Sí | ❌ Se muestra el **ID** (`page.tsx:83`) |
| IP / navegador | Apuntes | ❌ No hay columna ni captura. `BITACORA` no tiene campo de IP (`schema.sql:142-155`) |
| Detalle de un evento | Paso 4 | ❌ `getEventoPorId` existe (`service.ts:67`), pero no tiene pantalla |
| Inmutable | RF05 | ⚠️ En la aplicación no hay funciones de *update* ni *delete* (`types.ts:6`). En la BD, `ON DELETE CASCADE` desde `usuario` **borra la auditoría** de un usuario eliminado, y no hay ningún trigger ni permiso que impida `UPDATE` |
| Eventos de otros módulos (caja, clientes…) | RF05 | ❌ Aún no existen esos módulos, salvo `CREAR_CLIENTE` en una acción sin uso |

**Estado:** ⚠️ PARCIALMENTE IMPLEMENTADO.

### Botones
- **«Filtrar»** (`filtros-bitacora.tsx:103-108`): `handleSubmit` → `router.push` con parámetros en la URL → el Server Component se vuelve a ejecutar → `listarBitacoraAction` → `SELECT … FROM bitacora` → la tabla se actualiza.
- **«Limpiar»**: `router.push('/bitacora')`.

### Cómo demostrarlo
1. Inicia sesión, cambia tu teléfono en el perfil y cierra sesión.
2. Entra como ADMINISTRADOR en `/bitacora` y filtra por tu ID: aparecen `INICIO_SESION`, `ACTUALIZAR_PERFIL` y `CIERRE_SESION`.
3. Filtra por la acción `NO_EXISTE`: aparece el mensaje de «no se encontraron registros».
