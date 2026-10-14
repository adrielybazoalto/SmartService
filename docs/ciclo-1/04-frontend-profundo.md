# 04 · Frontend en profundidad: qué ve y hace el navegador

[← Índice](README.md) · Relacionados: [02 CU](02-casos-de-uso.md) · [03 Backend](03-backend-profundo.md) · [06 Seguridad](06-seguridad.md)

## 1. Rutas del App Router (comprobadas)

En el App Router, **cada carpeta de `src/app/` con un `page.tsx` es una URL**. Un `layout.tsx` envuelve a las páginas de su carpeta.

| URL | Archivo | Tipo | Protección en el servidor | CU |
|---|---|---|---|---|
| (todas) | `src/app/layout.tsx` → `RootLayout` (L21) | Server | Envuelve con `SidebarLayout` | — |
| `/` | `src/app/page.tsx` → `Home` (L15) | Server | Proxy (sesión) | CU01 (panel) |
| `/login` | `src/app/login/page.tsx` + `login-form.tsx` | Server + Client | Pública | CU01 |
| `/recuperar` | `src/app/recuperar/page.tsx` + `recuperar-form.tsx` | Server + Client | Pública | CU02 |
| `/usuarios` | `src/app/usuarios/layout.tsx` + `page.tsx` | Server (layout) + **Client** (page) | `requerirAccesoModulo('/usuarios')` | CU03 |
| `/roles` | `src/app/roles/layout.tsx` + `page.tsx` | Server + **Client** | `requerirAccesoModulo('/roles')` | CU04 |
| `/perfil` | `src/app/perfil/page.tsx` + `perfil-form.tsx` | Server + Client | Proxy + `requireUser()` dentro de `getPerfil` | CU05 |
| `/bitacora` | `src/app/bitacora/layout.tsx` + `page.tsx` + `filtros-bitacora.tsx` + `fecha-hora.tsx` | Server + Client | `requerirAccesoModulo('/bitacora')` | CU06 |

- No hay `pages/` (Pages Router), `loading.tsx`, `error.tsx` ni `not-found.tsx` propios.
- Las rutas `/cotizaciones`, `/ordenes-trabajo`, `/caja` y `/ventas` existen en el catálogo `MODULOS` (`src/lib/permisos.ts:28-37`), pero **no tienen página**: devuelven el 404 por defecto de Next.

## 2. Server Component frente a Client Component (verificado por directiva)

- **Con `'use client'` (se ejecutan en el navegador):**
  - `src/app/login/login-form.tsx`, `src/app/recuperar/recuperar-form.tsx`, `src/app/perfil/perfil-form.tsx`;
  - `src/app/usuarios/page.tsx`, `src/app/roles/page.tsx`;
  - `src/app/bitacora/filtros-bitacora.tsx`, `src/app/bitacora/fecha-hora.tsx`;
  - `src/components/sidebar-nav.tsx`, `src/components/sidebar-enlace.tsx`;
  - `src/components/paquete-seleccionado.tsx`, `src/components/panel-modulos.tsx`.
- **Sin directiva (Server Components por defecto):** todos los demás `page.tsx`, los `layout.tsx` y `src/components/{sidebar,tarjeta-modulo,badge-rol,page-header-badge,icono-modulo}.tsx`.

**Motivo de cada elección:**

| Componente | Tipo | Por qué |
|---|---|---|
| `SidebarLayout` (`src/components/sidebar.tsx:22`) | Server | Lee el usuario y los permisos de la BD antes de pintar el menú; nada de eso viaja al navegador salvo el HTML final |
| `EnlaceSidebar` (`src/components/sidebar-enlace.tsx:13`) | Client | Necesita `usePathname()` para resaltar el enlace activo (L22-23) |
| `Home` (`src/app/page.tsx`) | Server | Filtra los módulos por permiso en el servidor; el filtrado por paquete lo hace `PanelModulos` (Client) con el estado compartido |
| `NavegacionPaquetes` (`src/components/sidebar-nav.tsx`) | Client | Acordeón por paquete (estado de apertura) y comparte la selección con el Dashboard vía contexto |
| `PaqueteSeleccionadoProvider` (`src/components/paquete-seleccionado.tsx`) | Client | Contexto con el paquete seleccionado, montado en el layout para que Sidebar y Dashboard lean/escriban lo mismo |
| `PanelModulos` (`src/components/panel-modulos.tsx`) | Client | Pestañas Todos/P1–P4 y grid de tarjetas filtradas por la selección compartida |
| `LoginForm`, `RecuperarForm`, `PerfilForm` | Client | Usan `useActionState` (estado, errores, botón «pendiente») y `useState` (mostrar contraseña) |
| `AdministrarUsuariosPage` | Client | Tabla con filtros locales, modal y *toggles*. Obtiene los datos llamando a Server Actions desde `useEffect` |
| `RolesPage` | Client | Interruptores y selección de rol con estado local; guarda con una Server Action |
| `BitacoraPage` | Server | Consulta y pinta la tabla en el servidor según los parámetros de la URL |
| `FiltrosBitacora` | Client | Maneja los inputs y navega con `router.push` |
| `FechaHoraBolivia` | Client | Formatea la hora de La Paz después del montaje, para evitar diferencias de hidratación |

## 3. Tabla de acciones de interfaz

| Ruta exacta | Componente / función y líneas | Pantalla / acción | Evento | Datos enviados | Destino real | Resultado visible | CU | Pregunta probable |
|---|---|---|---|---|---|---|---|---|
| `src/app/login/login-form.tsx` | `LoginForm` L18; `<form action={formAction}>` L62 | Iniciar sesión | submit | `email`, `password`, `next` (oculto), `recordarme` (ignorado) | `loginAction` (`src/app/actions/auth.ts:54`) | Error en un recuadro rojo (L66-70) o redirección | CU01 | ¿Qué pasa al pulsar el botón? |
| `src/app/login/login-form.tsx` | botón L130-158 | Mostrar/ocultar contraseña | click | — | Solo `useState` | Cambia `type` a `text`/`password` | CU01 | ¿Eso envía algo? No |
| `src/app/login/login-form.tsx` | `Link` L171-176 | «¿Olvidaste tu contraseña?» | click | — | `/recuperar` | Navega | CU02 | Relación «extend» |
| `src/components/sidebar.tsx` | `<form action={logoutAction}>` L102 | Cerrar sesión | submit | — | `logoutAction` | Navega a `/login` | CU01 | ¿Qué hace el logout? |
| `src/app/recuperar/recuperar-form.tsx` | `FormularioEmail` L73; form L108 | Enviar enlace | submit | `correo` | `solicitarRecuperacionAction` | Mensaje verde con el **enlace simulado** (L80-104) o error | CU02 | ¿Por qué se ve el enlace? |
| `src/app/recuperar/recuperar-form.tsx` | `FormularioNuevaContrasena` L141; form L166 | Restablecer | submit | `token` (oculto, L167), `contrasena`, `confirmacion` | `restablecerContrasenaAction` | Éxito y enlace a «Iniciar sesión» (L148-163) o error | CU02 | ¿Dónde se valida la política? |
| `src/app/usuarios/page.tsx` | `useEffect` L79-94 | Cargar la lista | montaje | — | `listarUsuarios()`, `obtenerRolesActivos()` | Tabla o «Cargando…» | CU03 | ¿Por qué no se cargan en el servidor? |
| `src/app/usuarios/page.tsx` | `solicitarCreacionUsuario` L97; botón L216 | «+ Agregar Nuevo Usuario» | click | — | Estado local | Abre el modal | CU03 | — |
| `src/app/usuarios/page.tsx` | `handleGuardarFormulario` L120; `<form onSubmit>` L389 | «Guardar» del modal | submit (`preventDefault`) | Nombre, correo, contraseña (solo al crear), teléfono, `rol_id` | `registrarUsuario` / `actualizarUsuario` | Mensaje de 3,5 s y recarga, o error de 4 s | CU03 | ¿Qué se valida en el servidor? |
| `src/app/usuarios/page.tsx` | `solicitarCambioEstado` L158; checkbox L355-360 | Activar/desactivar | change | `id`, `!estado` | `cambiarEstadoCuenta` | Mensaje y recarga | CU03 | ¿Y si fuerzo el checkbox del admin? |
| `src/app/usuarios/page.tsx` | filtros L240-275, `usuariosFiltrados` L170 | Buscar / filtrar | change | — | Solo el navegador | Filtra la tabla | CU03 | ¿El filtro es seguro? Es solo de presentación |
| `src/app/roles/page.tsx` | tarjeta de rol L177-202 | Seleccionar rol | click | — | Estado local | Muestra sus módulos | CU04 | — |
| `src/app/roles/page.tsx` | `toggleModulo` L80; interruptor L253-270 | Encender o apagar un módulo | click | — | Estado local | Interruptor verde o gris | CU04 | ¿Se guarda ya? No, hasta pulsar «Guardar» |
| `src/app/roles/page.tsx` | `handleGuardarCambios` L90; botón L139-145 | «Guardar Cambios» | click | `rolId`, `nombresPermisos[]` | `guardarPermisosRol` | Mensaje, `router.refresh()` y recarga | CU04 | ¿Cómo se refleja en el menú? |
| `src/app/perfil/perfil-form.tsx` | form L59-143 | «Guardar cambios» | submit | `nombre`, `telefono` | `actualizarPerfilAction` | «Perfil actualizado correctamente.» (L51-55) | CU05 | ¿Por qué el correo no es editable? |
| `src/app/perfil/perfil-form.tsx` | form L146-214 | «Cambiar contraseña» | submit | `contrasena_actual`, `contrasena_nueva`, `confirmacion` | `cambiarContrasenaAction` | «Contraseña cambiada correctamente.» (L152-154) | CU05 | ¿Qué pasa si la actual es incorrecta? |
| `src/app/bitacora/filtros-bitacora.tsx` | `handleSubmit` L19-35 | «Filtrar» | submit (`preventDefault`) | Parámetros de la URL: fechas ISO, `usuario_id`, `accion` | `router.push('/bitacora?…')` → `BitacoraPage` (servidor) | Tabla filtrada | CU06 | ¿Dónde se filtra, en el cliente o en la BD? En la BD |
| `src/app/bitacora/filtros-bitacora.tsx` | `handleLimpiar` L37-40 | «Limpiar» | click | — | `router.push('/bitacora')` | Tabla completa | CU06 | — |
| `src/components/sidebar-enlace.tsx` | `EnlaceSidebar` L13 | Navegar entre módulos | click | — | `<Link href>` | Módulo resaltado | Todos | ¿Por qué el técnico no ve «Usuarios»? |

## 4. Qué datos pasan al navegador

| Pantalla | Datos enviados al cliente | Datos que **no** se envían |
|---|---|---|
| Sidebar y dashboard | HTML con el nombre, el rol y los enlaces permitidos | Lista de permisos cruda, id de sesión |
| `/usuarios` | `UsuarioEntity[]`: id, rol, nombre, correo, teléfono, estado de **todos** los usuarios | Hash de la contraseña (`usuarioAEntidad`, `src/app/actions/usuarios.ts:55-66`), contadores de bloqueo, `version_sesion` |
| `/roles` | Roles, módulos (nombre, ruta, descripción), asignaciones y `esSesionAdministrador` | — |
| `/perfil` | Nombre, teléfono, correo, nombre del rol y estado (`src/app/perfil/page.tsx:25-31`) | Hash, id |
| `/bitacora` | HTML con las filas: id, fecha, `usuario_id`, acción, descripción. Las descripciones incluyen correos | — |
| `/recuperar?token=` | El **token en claro** está en la URL y en un `input hidden` (`recuperar-form.tsx:167`) | — |
| Cookie `sesion` | JWT `httpOnly`: **JavaScript no puede leerlo** (`src/lib/session.ts:36`) | — |

## 5. Validación visual frente a validación exigida en el servidor

| Formulario / campo | En el navegador (HTML) | En el servidor (lo que realmente se exige) | ¿Se puede saltar lo visual? |
|---|---|---|---|
| Login: correo | `type=email`, `required` (`login-form.tsx:89-98`) | Zod `.email()` (`auth.ts:14`) | Sí, pero el servidor vuelve a validar |
| Login: contraseña | `required` | Zod `min(1)` + bcrypt + intentos | Sí; sin efecto |
| Recuperar: correo | `type=email`, `required` | Zod `.email()` (`src/backend/recuperar/schema.ts:5-11`) | Sí; sin efecto |
| Recuperar: nueva contraseña | `required` + texto de ayuda. **Sin `minLength`** | `contrasenaSchema` completo + confirmación | Sí; el servidor la rechaza |
| Usuarios: contraseña al crear | Solo `required` (`usuarios/page.tsx:417-424`) | `contrasenaSchema` (`crearUsuarioSchema`, `src/backend/usuarios/schema.ts:17`) | Sí; el servidor la rechaza |
| Usuarios: correo | `type=email`, `required` | Zod `.email().max(100)` + `UNIQUE` en la BD | Sí; sin efecto |
| Usuarios: rol | `<select>` con los roles de la BD | Zod `int().positive()` + FK en la BD. Además, no se puede cambiar el propio rol | Se puede enviar cualquier `rol_id`, incluido `ADMINISTRADOR`, **si se tiene el permiso USUARIOS** |
| Perfil: nombre | `required`, `minLength=2`, `maxLength=150` | Zod `min(2).max(150)` | Sí; sin efecto |
| Perfil: correo, rol, estado | `readOnly`, **sin `name`**, así que no se envían (`perfil-form.tsx:73-99`) | La acción solo lee `nombre` y `telefono` (`perfil.ts:41-47`) | Aunque se añada un campo en DevTools, **se ignora** |
| Perfil: nueva contraseña | `minLength=8`, `maxLength=72` | `contrasenaSchema` completo | Sí; sin efecto |
| Roles: interruptor del rol ADMINISTRADOR | `disabled` si no es admin (`roles/page.tsx:258`) | `guardarPermisosRol` rechaza (`roles.ts:128`) | Sí; el servidor rechaza |
| Bitácora: `usuario_id` | `type=number`, `min=1` | Zod `int().positive()` | Sí; un valor inválido produce un error visible |

**Conclusión para la defensa:** ninguna regla de seguridad depende solo del HTML. Todas las que importan están en Zod o en la lógica del servidor. La excepción es de presentación: los filtros de `/usuarios` se aplican en el navegador sobre datos que el usuario ya estaba autorizado a ver.

## 6. ¿Qué pasa si se desactiva JavaScript o se manipula el HTML?

| Pantalla | Sin JavaScript | Manipulación del HTML/DevTools |
|---|---|---|
| Login, Recuperar, Perfil | ❔ NO VERIFICADO POR EJECUCIÓN. Usan `<form action={serverAction}>`, que Next.js documenta como compatible con *progressive enhancement*; en teoría el POST funcionaría sin JavaScript | Todo se revalida en el servidor |
| `/usuarios`, `/roles` | No funcionan: los datos se cargan en `useEffect`. Se queda en «Cargando…» | Llamar a las acciones directamente pasa por `exigirAccesoUsuarios` y por las comprobaciones de roles |
| `/bitacora` | La tabla se pinta en el servidor según la URL. El formulario de filtros no funciona: sus inputs **no tienen `name`** y usa `preventDefault`. Las horas muestran «—» | Los parámetros se validan con Zod |
| Sidebar | Los enlaces `<Link>` funcionan como `<a>` normales | Mostrar un enlace oculto no da acceso: el layout del destino comprueba el permiso |

## 7. Accesibilidad y mensajes al usuario

- ✅ Los inputs del login tienen `aria-label` (`login-form.tsx:95,124`).
- ✅ El botón de mostrar contraseña tiene un `aria-label` dinámico (L133).
- ✅ Los interruptores de roles usan `role="switch"` y `aria-checked` (`roles/page.tsx:254-256`).
- ✅ El Sidebar marca el enlace activo con `aria-current` (`sidebar-enlace.tsx:28`) y cada cabecera de paquete es un botón acordeón con `aria-expanded` / `aria-controls` (`sidebar-nav.tsx`).
- ✅ El perfil usa `<label htmlFor>` (`perfil-form.tsx:70,107…`).
- ⚠️ En el modal de usuarios, los `<label>` no tienen `htmlFor` (L391, L403…): no quedan asociados a su input.
- ⚠️ Los mensajes de error y éxito no usan `aria-live` ni `role="alert"`.
- ⚠️ El modal no gestiona el foco ni se cierra con la tecla Escape.
- ⚠️ Los mensajes de `/usuarios` desaparecen solos (3,5 s y 4 s, L43-51).
- **Estados de carga:**
  - botones con «Validando...», «Enviando…», «Guardando…», «Cambiando…» (`pendiente`);
  - «Cargando listado de usuarios...» (`usuarios/page.tsx:297`);
  - «Cargando roles y permisos del sistema…» (`roles/page.tsx:116`).
- **Estilos:** Tailwind 4 con el tema «PULSE»: fondo `#F4F5F7`, acento `lime`. Las clases reutilizables `.tarjeta`, `.btn-primario`, `.mensaje-error`… están en `src/app/globals.css`. El modo oscuro está desactivado a propósito (`@custom-variant dark`, L7).

## 8. Archivos esenciales: pregunta, respuesta corta y explicación técnica

### `src/app/layout.tsx`
- **Qué hace:** raíz HTML (`lang="es"`), fuentes Geist, y envuelve todo con `SidebarLayout` (L28).
- **Pregunta:** «¿Cómo sabe el sistema si mostrar el menú?»
- **Respuesta corta:** El Sidebar pregunta en el servidor quién es el usuario; si no hay nadie, no pinta el menú.
- **Técnica:** `SidebarLayout` llama a `getCurrentUser()`. Si devuelve `null`, retorna solo `children` (`sidebar.tsx:23-24`), que es el caso de `/login` y `/recuperar`.

### `src/components/sidebar.tsx`
- **Qué hace:** verifica la sesión y delega la navegación en `NavegacionPaquetes` (`src/components/sidebar-nav.tsx`, Client Component).
  - Cada paquete (P1–P4) es una cabecera acordeón clicable con una flecha; al pulsarla se muestran u ocultan sus módulos (estado por paquete). El paquete de la ruta activa abre por defecto.
  - En los paquetes habilitados (P1 y P2), solo aparecen los ítems cuya `clave` está en `getPermisosDeRol()`, o con clave vacía (Inicio); si el rol no tiene ninguno, se indica «Sin módulos asignados a tu rol».
  - P3 y P4, al desplegarse, muestran «Bloqueado · sin permisos»: no hay enlaces.
- **Pregunta:** «¿Ocultar el menú es la seguridad?»
- **Respuesta corta:** No. El menú es comodidad; la seguridad está en el layout y la acción de cada módulo.
- **Técnica:** `src/app/usuarios/layout.tsx` ejecuta `requerirAccesoModulo`, y cada Server Action ejecuta `tienePermisoModulo`.

### `src/app/page.tsx` (dashboard)
- **Qué hace:** muestra el saludo, el rol y las tarjetas de los módulos de los paquetes habilitados (P1 y P2) filtradas por permiso. El grid y las pestañas de filtrado por paquete viven en `PanelModulos` (`src/components/panel-modulos.tsx`).
  - Con `?aviso=sin_permiso` muestra «No tiene permisos para acceder a este módulo.»
  - Las pestañas **Todos / P1–P4** filtran las tarjetas; la selección se comparte con el Sidebar mediante `usePaqueteSeleccionado` (`src/components/paquete-seleccionado.tsx`): pulsar una cabecera de paquete en el menú también filtra el Dashboard.
  - P3 y P4 no tienen módulos: al seleccionarlos se muestra «estará disponible próximamente».
  - Si el rol no tiene módulos, muestra «No tienes módulos asignados a tu rol.»
- **Pregunta:** «¿Qué ve un técnico al entrar?»
- **Respuesta:** Con el seed, solo la tarjeta «Mi Perfil (CU05)». De los permisos del técnico, el único que pertenece a P1 es `PERFIL` (seed.sql:146-148), y las tarjetas excluyen Inicio. `COTIZACIONES` y `ORDENES_TRABAJO` no tienen tarjeta porque sus casos de uso (CU08 y CU10–CU13) aún no tienen ítem en `navigation.ts`.

### `src/app/login/login-form.tsx`
- **Pregunta:** «¿Qué hace la casilla Recordarme?»
- **Respuesta corta:** Hoy, nada: es visual.
- **Técnica:** envía el campo `recordarme` (L166), pero `loginAction` no lo lee. La cookie siempre dura 7 días (`session.ts:5,40`).

### `src/app/recuperar/page.tsx` y `recuperar-form.tsx`
- **Pregunta:** «¿Cómo decide qué formulario mostrar?»
- **Respuesta corta:** Por el `token` de la URL, validado en el servidor antes de pintar.
- **Técnica:** `PaginaRecuperar` ejecuta `verificarEnlace` (L26). Solo si es válido renderiza `FormularioNuevaContrasena`. ESLint marca como error construir JSX dentro de `try/catch` (L27, regla `react-hooks/error-boundaries`).

### `src/app/usuarios/page.tsx`
- **Pregunta:** «¿Por qué es un Client Component si maneja datos sensibles?»
- **Respuesta corta:** Por la interactividad: modal, filtros e interruptores. Los datos y las reglas siguen en el servidor.
- **Técnica:** el layout de servidor bloquea el acceso antes de enviar el JavaScript de la página. Los datos llegan por Server Actions protegidas y sin hash. 💡 PROPUESTA — NO IMPLEMENTADO: cargar la lista inicial en un Server Component y pasarla como *props*, para ahorrar una ida y vuelta.

### `src/app/roles/page.tsx`
- **Pregunta:** «¿Cuándo se aplica el cambio de permisos a los usuarios conectados?»
- **Respuesta corta:** En su siguiente carga o navegación.
- **Técnica:** `guardarPermisosRol` llama a `revalidatePath('/', 'layout')`, y la página hace `router.refresh()`. Como los permisos se leen de la BD en cada petición (`getPermisosDeRol`), cualquier sesión ve el cambio al navegar.

### `src/app/perfil/perfil-form.tsx`
- **Pregunta:** «¿Puedo cambiar mi rol desde el perfil editando el HTML?»
- **Respuesta corta:** No.
- **Técnica:** los campos de solo lectura no tienen `name` y `actualizarPerfilAction` solo lee `nombre` y `telefono`. El servicio solo actualiza esas dos columnas (`src/backend/usuarios/service.ts:139`).

### `src/app/bitacora/page.tsx`, `filtros-bitacora.tsx` y `fecha-hora.tsx`
- **Pregunta:** «¿Por qué la hora sale bien en Bolivia?»
- **Respuesta:** `fecha_hora` es `TIMESTAMPTZ` en `schema.sql` y además `FechaHoraBolivia` fuerza `America/La_Paz` (L7). ESLint marca `setState` dentro de `useEffect` (L53).
