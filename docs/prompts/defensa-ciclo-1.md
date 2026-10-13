# Prompt maestro para Claude Code: defensa del Ciclo 1 de SMARTSERVICE

Lee este archivo completo y ejecuta el trabajo en la raíz del repositorio SMARTSERVICE. El objetivo es entregarme **archivos Markdown útiles para estudiar y defender el proyecto**, con especial profundidad en frontend y backend, posibles preguntas de la Ing. Angélica Garzón y **rutas exactas del código**. Explica con lenguaje claro para un estudiante de Ingeniería de Sistemas y añade después el detalle técnico necesario para la defensa.

## Límites de la tarea

- Inspecciona el repositorio y los dos PDF indicados abajo antes de escribir conclusiones.
- Puedes crear y editar únicamente archivos Markdown dentro de `docs/ciclo-1/`. No modifiques código, configuración, SQL, pruebas, dependencias, datos ni los PDF. No ejecutes migraciones, seeds, despliegues ni comandos que alteren datos o servicios.
- No supongas que existe Laravel, un controlador, una tabla, una función, una política RLS o un flujo de seguridad porque aparezca en una versión anterior de los documentos. Comprueba su existencia en el código actual.
- Puedes ejecutar comandos locales de solo lectura para inspeccionar archivos y, si ya están disponibles, comandos de verificación que no alteren el proyecto. Si alguno crea artefactos o cachés dentro del repositorio, omítelo y explica la limitación.
- No muestres valores de `.env*`, claves, contraseñas, tokens, cadenas de conexión ni datos reales de usuarios. Menciona solo nombres de variables cuando sean necesarios. No incluyas secretos en los documentos ni en la respuesta.
- No cambies reglas ni implementes propuestas. Si una función no existe, explica qué haría falta y marca `💡 PROPUESTA — NO IMPLEMENTADO`.

## Fuentes y orden de evidencia

1. **Repositorio actual**: evidencia de lo que está implementado y de cómo funciona.
2. **PDF del proyecto actualizado**: requisitos, alcance, casos de uso, arquitectura propuesta y PUDS. Búscalo primero en `docs/fuentes/`; el nombre original puede ser `INF342 SMARTSERVICES #6 SISTEMAS DE INFORMACION 1 (3).pdf` o haberse renombrado a `INF342-SMARTSERVICE-PROYECTO.pdf`.
3. **Apuntes de Jorge Santiago**: indicaciones de clase y posibles reglas de la docente. Búscalos en `docs/fuentes/`; el nombre original puede ser `UAGRM APUNTES JORGE SANTIAGO.pdf` o `UAGRM-APUNTES-JORGE-SANTIAGO.pdf`.

Si faltan los PDF, busca sus nombres dentro del repositorio y explica cuáles faltan. No inventes su contenido. Continúa con el código disponible y deja constancia de la limitación. No descargues archivos ni salgas del repositorio para obtenerlos.

El PDF actualizado describe Next.js App Router, React, TypeScript, Tailwind CSS, PostgreSQL/Supabase y Vercel. **Eso describe el proyecto académico; comprueba en el repositorio qué se usa realmente.** Los apuntes contienen reglas como contraseña mínima de ocho caracteres con mayúscula, minúscula, número y carácter especial, control de intentos y bloqueo al tercer intento. **Trátalas como criterios por contrastar, nunca como hechos implementados.** Si las fuentes difieren, muestra las tres versiones por separado.

## Fase 1: inspección completa y mapa de evidencia

Antes de producir archivos finales, revisa la estructura y las dependencias: `package.json`, lockfile, `tsconfig`, configuración de Next.js y Tailwind, `app/` o `src/app/`, `pages/` si existe, `components/`, `lib/`, hooks, servicios, `middleware.ts`, Route Handlers, Server Actions, esquemas de validación, cliente y servidor de Supabase, SQL, migraciones, políticas RLS, tipos generados, pruebas, documentación, scripts y variables de entorno **solo por su nombre**. Averigua dónde están los límites entre navegador, servidor, Supabase Auth y PostgreSQL. Lee el contenido pertinente de los PDF, en especial alcance, RF/RNF, Ciclo 1, CU01–CU06 y PUDS.

Haz búsquedas dirigidas, abre los archivos relevantes y sigue importaciones y llamadas hasta el origen de la regla. No deduzcas una conducta completa a partir del nombre de un archivo o de un texto de interfaz. Para tablas y RLS, si no hay migraciones, esquema o acceso comprobable, escribe `NO VERIFICABLE DESDE EL REPOSITORIO` y qué evidencia falta. No asumas que la configuración remota de Supabase coincide con el código local.

En cada afirmación técnica importante indica evidencia local: ruta **relativa a la raíz**, símbolo (función, componente, tipo, tabla, política) y líneas si se pueden obtener. Para afirmaciones del PDF indica nombre del PDF y página. Distingue:

- `✅ IMPLEMENTADO`: existe un flujo verificable de extremo a extremo o la parte específica afirmada.
- `⚠️ PARCIALMENTE IMPLEMENTADO`: hay piezas, pero falta al menos una parte necesaria; precisa cuál.
- `❌ NO IMPLEMENTADO`: no se encontró la funcionalidad después de revisar las ubicaciones razonables.
- `💡 PROPUESTA`: diseño sugerido, separado del estado actual.
- `❔ NO VERIFICABLE`: el repositorio no aporta evidencia suficiente, por ejemplo reglas configuradas solo en Supabase remoto.

El código demuestra la implementación observada; no confundas intención del PDF, apuntes, pruebas o comentarios con comportamiento real. Si dos archivos se contradicen, sigue el flujo ejecutado por la aplicación e informa la contradicción.

## Alcance: seis casos de uso del Ciclo 1

Investiga individualmente:

1. CU01 — Gestionar Inicio y Cierre de Sesión.
2. CU02 — Recuperar Contraseña.
3. CU03 — Administrar Usuarios.
4. CU04 — Configurar Roles y Asignar Permisos.
5. CU05 — Configurar Perfil Personal.
6. CU06 — Gestionar Bitácora de Auditoría.

Para cada CU identifica actor, precondiciones, disparador, flujo principal, alternos y errores, reglas, interfaz, acción del usuario, validación cliente y servidor, ruta o acción real, servicio, Supabase Auth, consulta, tabla, RLS si es comprobable, respuesta, sesión, permisos, bitácora y pruebas. Si no existe alguna capa, dilo. Relaciona requisito → CU → análisis/diseño UML/PUDS → implementación → prueba sin fingir trazabilidad donde aún no la hay. Otros módulos solo deben aparecer para dar contexto o señalar dependencias.

## Entregables: crea estos Markdown en `docs/ciclo-1/`

### `README.md` — ruta de estudio

Índice enlazado de todos los archivos, orden recomendado de lectura, glosario breve, convenciones de estado y evidencia, fecha de inspección y alcance. Incluye una tabla rápida «pregunta o cambio → documento → sección → archivo de código».

### `01-sistema-completo.md` — visión general

Problema y objetivo de SMARTSERVICE, actores, alcance del Ciclo 1, stack **documentado versus encontrado**, arquitectura real, mapa de carpetas, módulos terminados/parciales/ausentes, ejecución local y despliegue **solo si hay evidencia**, límites del sistema y dependencias entre los seis CU. Explica frontend, servidor, Supabase Auth y PostgreSQL con un diagrama Mermaid ajustado al código; no dibujes componentes inexistentes.

### `02-casos-de-uso.md` — CU01 a CU06

Una sección extensa por CU: propósito, actor, requisito, pantalla, flujo real paso a paso, variaciones y errores, componentes y rutas exactas, tablas, permisos, auditoría, estado, contraste con PDF/apuntes y cómo demostrarlo. Incluye una ficha «¿Qué sucede al presionar este botón?» por acción principal. Diferencia lo que exige el diseño de lo que hace el software.

### `03-backend-profundo.md` — mapa técnico de servidor

**Este debe ser uno de los documentos más detallados.** Antes de describir el backend, determina si usa Server Actions, Route Handlers, Server Components, API externa, llamadas directas desde cliente o una combinación. No le atribuyas una capa convencional si no existe. Explica archivo por archivo los módulos importantes con una tabla:

| Ruta exacta | Exportación/función y líneas | Quién la llama | Entrada | Validación | Operación | Salida/error | CU | Pregunta probable |
|---|---|---|---|---|---|---|---|---|

Traza login, logout, recuperación, administración de usuarios, perfiles, roles/permisos y bitácora. Detalla sesión/cookies, protección de rutas, comprobaciones de autorización, cliente Supabase de servidor, consultas, manejo de errores, validación de entrada, variables de entorno por **nombre**, y cómo se impediría saltar el frontend. Diferencia explícitamente qué control ocurre en aplicación, Supabase Auth y PostgreSQL/RLS. Por cada archivo esencial agrega **por qué existe, cuándo se ejecuta, función de cada método, una pregunta probable de la Ing., respuesta corta y respuesta técnica**. Incluye enlaces relativos a los otros documentos y fragmentos breves del código real con referencia; no copies archivos completos.

### `04-frontend-profundo.md` — mapa técnico de interfaz

**Este debe ser tan detallado como el de backend.** Identifica rutas del App Router, layouts, páginas, componentes, formularios, hooks, estado, eventos, llamadas, estilos relevantes, estados de carga y error, redirecciones y validaciones. Tabla:

| Ruta exacta | Componente/función y líneas | Pantalla/acción | Evento | Datos enviados | Destino real | Resultado visible | CU | Pregunta probable |
|---|---|---|---|---|---|---|---|---|

Explica por qué cada componente relevante es Server o Client Component **si se puede comprobar**; qué datos pasan al navegador; cómo se comunica con la capa siguiente; qué ocurre si se desactiva JavaScript o se manipula el HTML; accesibilidad y mensajes al usuario. Para cada formulario, contrasta validación visual con la validación realmente exigida fuera del navegador. Adjunta las rutas exactas y **pregunta, respuesta corta y explicación técnica** por archivo esencial.

### `05-base-de-datos.md` — modelo persistente real

Inventario de tablas/esquemas comprobables, migraciones/SQL y políticas RLS. Para cada tabla pertinente: propósito, PK, FK, relaciones, restricciones, campos relevantes, datos sensibles, CU que la usa, archivo que la crea o consulta, y estado de verificación. Examina sin asumir la existencia de `usuario`, `rol`, `permiso`, `usuario_rol`, `rol_permiso`, `bitacora`, `token_recuperacion` y `modulo_sistema`. Distingue `auth.users` de tablas de aplicación y explica dónde se almacenan realmente las contraseñas si el repositorio lo permite verificar. No escribas SQL como si hubiese sido ejecutado. Incluye **consultas de solo lectura**, adaptadas al esquema comprobado, para demostrar pruebas en PostgreSQL; indica que deben ejecutarse en el entorno adecuado y nunca reveles datos sensibles.

### `06-seguridad.md` — controles y límites

Explica en dos niveles (sencillo y técnico) autenticación, autorización, roles, permisos, RBAC, sesión, token, hash, bitácora, CSRF y RLS, siempre vinculados al proyecto. Determina dónde se hacen y dónde faltan controles: rutas, acciones, consultas, políticas, cliente/servidor. Revisa contraseña sin mostrar credenciales: nunca debe guardarse en texto plano; **verifica qué puede afirmarse realmente del proyecto y de Supabase Auth**. Detalla recuperación: emisión, envío, vencimiento, uso único, validación e invalidación, diferenciando código local de configuración externa. Incluye matriz de amenazas de defensa (URL directa, DevTools, petición manual, rol alterado, usuario inactivo, token reutilizado) y la respuesta real o su ausencia.

### `07-trazabilidad.md` — requisitos, CU y código

Dos matrices:

| RF/RNF y fuente | CU | Frontend (ruta) | Lógica/servidor (ruta) | Auth/BD/RLS | Prueba | Estado | Brecha |
|---|---|---|---|---|---|---|---|

| Caso de uso | Pantalla/componente | URL o acción real | Handler/función | Servicio | Tabla/Auth | Protección | Permiso | Estado |
|---|---|---|---|---|---|---|---|---|

Usa nombres y rutas reales. Señala explícitamente casillas no verificables o no implementadas. Añade tabla de contradicciones `PDF | apuntes | código | consecuencia para la defensa`.

### `08-cambios-defensa.md` — manual de cambios en vivo

Comienza con un índice «petición → archivo y símbolo → capas afectadas → prueba». Investiga obligatoriamente: número de intentos de login; tiempo de bloqueo; longitud mínima y política de contraseña (mayúscula, minúscula, número y especial); duración y reutilización de enlace de recuperación; estado activo/inactivo; permisos del técnico y encargado; eventos de bitácora (contraseña, IP, navegador, logout); cambio obligatorio de contraseña inicial. Busca además números, tiempos, límites, estados, mensajes y reglas en código/configuración y construye:

| Cambio posible | Estado y valor actual comprobado | Ruta y símbolo | Dificultad técnica | Capas afectadas |
|---|---|---|---|---|

Para cada cambio, usa: solicitud textual posible; comportamiento y valor actual **con evidencia**; ruta, símbolo y líneas exactas; valor deseado; edición mínima sugerida; **antes y después** solo si el código previo existe; frontend, servidor, Supabase Auth, BD/RLS y pruebas afectadas; pasos de verificación; riesgos y dependencias. Si la regla depende de configuración remota no visible, **no inventes un archivo ni un valor**: indica cómo comprobarla y qué se podría modificar. Si no existe bloqueo configurable, explica una propuesta de implementación separada del comportamiento actual. Si usa RBAC, indica cómo cambiar una asignación sin sustituirlo por `if (rol === 'admin')`. **No apliques ningún cambio.**

### `09-preguntas-ingeniera.md` — banco de defensa

Genera preguntas basadas en el código y los documentos, agrupadas por conceptos, PUDS/UML, CU, frontend, servidor, BD, seguridad y cambio en vivo. Cada una con: **respuesta corta para decir en voz alta**, explicación técnica, referencia de ruta/símbolo o página, y estado. Prioriza preguntas asociadas a archivos reales. Incluye, donde corresponda: por qué Next.js y PostgreSQL/Supabase; diferencia entre autenticación y autorización; sesión y login; roles y permisos; tabla intermedia; protección al ingresar directamente una URL; DevTools; validación de servidor; hash y recuperación; expiración/reutilización de token; bitácora; RLS; qué ocurre desde pulsar «Iniciar sesión»; y cómo un CU termina en código. Si la arquitectura real difiere del PDF, adapta la respuesta y explica la divergencia. No atribuyas a la aplicación protecciones que no se hayan comprobado.

### `10-guia-defensa.md` — exposición y demostración

Guía para hablar con palabras propias, no discurso memorizado. Secuencia: problema, objetivo, iteración/PUDS, CU, pantalla, flujo de frontend, lógica de servidor, Auth/BD/RLS, seguridad, demostración, posible cambio, prueba y conclusión. En cada paso: qué explicar, qué mostrar, archivo/ruta exacta que abrir, qué no olvidar y pregunta probable. Incluye una checklist manual por CU con entrada, resultado esperado, evidencia visible, consulta de solo lectura a BD **si se conoce el esquema**, y límite si no puede comprobarse.

### `11-informe-final.md` — INFORME FINAL DE PREPARACIÓN PARA DEFENSA

Resume: implementado, parcial, pendiente, errores o brechas detectables, contradicciones código-documentos, cambios rápidos y cambios multicapa, archivos esenciales para memorizar, funciones, tablas, **20 puntos prioritarios para dominar** y **20 preguntas más conectadas con el código actual**. Termina con un plan de estudio priorizado y un apartado «qué no debemos afirmar en la defensa sin comprobarlo». Enlaza el detalle de los archivos anteriores.

## Reglas especiales de explicación

- **Login completo:** reconstruye el flujo exacto desde la URL y el formulario hasta la sesión, redirección y registros. Comprueba orden real de validación, Auth, estado de usuario, intentos, permisos y bitácora. Para cada paso indica ruta, función y capa; escribe `NO EXISTE` o `NO VERIFICABLE` cuando corresponda.
- **Acciones de interfaz:** para cada botón importante explica `acción → evento/formulario → llamada → validación → Auth/BD → respuesta → actualización visible`; omite o marca las capas ausentes. Usa Mermaid solo si aclara un flujo real.
- **Frontend / servidor / BD:** separa cada regla de contraseña, correo, permisos, intentos y bloqueo según la capa que realmente la garantiza. Explica cómo se podría saltar una validación meramente visual.
- **Términos:** al primer uso define brevemente Route, Request, Response, Server Action, Route Handler, componente de servidor/cliente, middleware, sesión, hash, token, RBAC, CRUD, RLS, CSRF, ORM, PK, FK, PUDS y UML cuando sean aplicables. No conviertas la documentación en un manual genérico.
- **Rutas exactas:** escribe la ruta tal como existe, entre comillas invertidas, con símbolo y línea cuando sea posible. Si el código es generado o la ruta depende de configuración, indícalo. No inventes `/login`, `middleware.ts`, tablas ni columnas.
- **Pruebas:** distingue prueba existente, comprobación manual sugerida y prueba por agregar. Un test presente no demuestra por sí solo que la función esté conectada al flujo de producción.
- **Calidad:** evita repetir explicaciones largas entre archivos. Resume y enlaza secciones. Incluye ejemplos concretos anclados en el repositorio, no plantillas genéricas. No atribuyas a la Ing. una petición hipotética como si ya la hubiera hecho.

## Forma de trabajo y entrega

1. Inspecciona código y PDF; informa brevemente qué fuentes encontraste y los hallazgos que cambiarán el enfoque.
2. Construye una matriz de evidencia para CU01–CU06 y verifica los símbolos antes de escribir archivos finales.
3. Escribe los Markdown en orden, conservando consistencia entre matrices y explicaciones. Puedes avanzar por lotes si el contexto es grande; deja un estado de avance dentro de `docs/ciclo-1/README.md` y retoma sin volver a inventar ni sobrescribir análisis comprobados.
4. Comprueba que todos los enlaces relativos entre Markdown y rutas locales señaladas existan cuando corresponda. Revisa que no aparezcan secretos y que las propuestas estén marcadas.
5. Al terminar, entrégame un resumen breve de hallazgos y brechas, la lista de archivos creados con sus rutas y el orden recomendado para estudiarlos. Indica cualquier sección que no pudo verificarse y por qué.

Empieza ahora por inspeccionar el proyecto. **No modifiques el código fuente.**
