# Defensa Ciclo 3 — CU10 y CU12

**SmartService · SgarNet · INF342 Sistemas de Información I · Grupo 6**

Guía para la defensa. Une cada diagrama (análisis, comunicación y secuencia) con el lugar exacto del código donde se ejecuta. Cada enlace abre el archivo en GitHub en la línea indicada.

> **Importante:** los números de línea corresponden al commit `a82d01d` (1 de noviembre de 2026, "feat(ui): finalizacion de CU12"). Los enlaces apuntan a la rama `main`. Si alguien sube cambios a esos archivos, las líneas pueden moverse unas pocas posiciones. Antes de la defensa, abran cada enlace y confirmen que cae en la función correcta.
>
> Las imágenes de los diagramas están en la carpeta `img/`, junto a este archivo.

---

## Índice

- [0. Cómo está organizado el código (las capas)](#0-cómo-está-organizado-el-código-las-capas)
- [CU10 · Configurar Jornadas y Bloqueos del Personal Técnico](#cu10--configurar-jornadas-y-bloqueos-del-personal-técnico)
  - [CU10.1 Archivos y carpetas](#cu101-archivos-y-carpetas)
  - [CU10.2 Diagrama de análisis (clases)](#cu102-diagrama-de-análisis-clases)
  - [CU10.3 Diagrama de comunicación](#cu103-diagrama-de-comunicación)
  - [CU10.4 Diagrama de secuencia](#cu104-diagrama-de-secuencia)
  - [CU10.5 Diferencias entre diagramas y código](#cu105-diferencias-entre-diagramas-y-código)
  - [CU10.6 Preguntas probables](#cu106-preguntas-probables)
- [CU12 · Gestionar Órdenes de Trabajo y Reporte de Campo](#cu12--gestionar-órdenes-de-trabajo-y-reporte-de-campo)
  - [CU12.1 Archivos y carpetas](#cu121-archivos-y-carpetas)
  - [CU12.2 Diagrama de análisis (clases)](#cu122-diagrama-de-análisis-clases)
  - [CU12.3 Diagrama de comunicación](#cu123-diagrama-de-comunicación)
  - [CU12.4 Diagrama de secuencia](#cu124-diagrama-de-secuencia)
  - [CU12.5 Diferencias entre diagramas y código](#cu125-diferencias-entre-diagramas-y-código)
  - [CU12.6 Preguntas probables](#cu126-preguntas-probables)
- [Anexo · Piezas compartidas](#anexo--piezas-compartidas)

---

## 0. Cómo está organizado el código (las capas)

Cada clase de los diagramas de análisis corresponde a una capa del proyecto:

| Estereotipo en el diagrama | Capa en el código | Carpeta |
|---|---|---|
| «boundary» (IU_…) | Pantallas React (Next.js App Router) | [`src/app/`](./src/app) |
| «control» (Control…) | **Server Actions** (puerta de entrada al servidor: sesión, permisos, bitácora) **+ servicio/controlador del backend** (reglas de negocio) | [`src/app/actions/`](./src/app/actions) y [`src/backend/`](./src/backend) |
| «entity» | Tablas PostgreSQL en Supabase y funciones PL/pgSQL | [`db/schema.sql`](./db/schema.sql) y [`db/migrations/aplicadas/`](./db/migrations/aplicadas) |

El recorrido de cualquier mensaje es siempre el mismo:

```
Pantalla (src/app/...)  →  Server Action (src/app/actions/...)  →  Backend (src/backend/...)  →  Supabase (tabla o función SQL)
     «boundary»                «control»: permisos + bitácora        «control»: reglas             «entity»
```

**Frase para la defensa:** *"La clase de control del análisis se implementó en dos archivos. La Server Action recibe la petición, verifica la sesión y el permiso en ROL_FUNCION y registra la bitácora. El servicio del backend aplica las reglas del caso de uso y habla con la base de datos."*

---

# CU10 · Configurar Jornadas y Bloqueos del Personal Técnico

**Actores:** Administrador y Encargado. **Permiso:** clave `PERSONAL_TECNICO` con las acciones LEER, ACTUALIZAR, CREAR y ELIMINAR. **Ruta:** `/personal-tecnico`.

## CU10.1 Archivos y carpetas

| Pieza | Archivo |
|---|---|
| Pantalla (IU) | [`src/app/personal-tecnico/page.tsx`](./src/app/personal-tecnico/page.tsx) |
| Protección de la ruta | [`src/app/personal-tecnico/layout.tsx`](./src/app/personal-tecnico/layout.tsx#L9) |
| Server Actions (control: permisos y bitácora) | [`src/app/actions/jornadas.ts`](./src/app/actions/jornadas.ts) |
| Servicio (control: reglas) | [`src/backend/personal-tecnico/service.ts`](./src/backend/personal-tecnico/service.ts) |
| Validaciones (Zod) | [`src/backend/personal-tecnico/schema.ts`](./src/backend/personal-tecnico/schema.ts) |
| Interpretar los días ("Lunes a Viernes") | [`src/backend/asignaciones/disponibilidad.ts#L31`](./src/backend/asignaciones/disponibilidad.ts#L31) |
| Carpeta del módulo | [`src/backend/personal-tecnico/`](./src/backend/personal-tecnico) |
| Pruebas | [`pruebas/personal-tecnico/cu10-backend.prueba.mjs`](./pruebas/personal-tecnico/cu10-backend.prueba.mjs) (`npm run test:cu10`) |

## CU10.2 Diagrama de análisis (clases)

![Diagrama de análisis CU10](img/cu10-analisis.png)

### «boundary» IU_ConfigurarJornadaBloqueos → `src/app/personal-tecnico/page.tsx`

El componente empieza en [L38 `GestionJornadasPage`](./src/app/personal-tecnico/page.tsx#L38).

**Atributos**

| Atributo del diagrama | Dónde está |
|---|---|
| `tecnicos`, `resumen` | [L39–L40](./src/app/personal-tecnico/page.tsx#L39) (`tecnicos`, `resumenGlobal`) |
| `tecnicoSeleccionado` | [L41](./src/app/personal-tecnico/page.tsx#L41) (`selectedTecnico`) |
| `diaSemana`, `horaInicio`, `horaFin` | [L50–L52](./src/app/personal-tecnico/page.tsx#L50) |
| `fechaInicio`, `fechaFin`, `motivo`, `tipo` | [L55–L58](./src/app/personal-tecnico/page.tsx#L55) |

**Métodos**

| Método del diagrama | Dónde está |
|---|---|
| `ingresarModulo()` | [`layout.tsx#L9`](./src/app/personal-tecnico/layout.tsx#L9) verifica el acceso a la ruta; luego [`recargarDatos` L71](./src/app/personal-tecnico/page.tsx#L71), que se ejecuta al abrir la pantalla en [L89](./src/app/personal-tecnico/page.tsx#L89) |
| `seleccionarTecnico(usuarioId)` | selector en [L551–L552](./src/app/personal-tecnico/page.tsx#L551), botón "Gestionar agenda" ([`irAGestionarAgenda` L128](./src/app/personal-tecnico/page.tsx#L128)) y efecto que carga la agenda en [L107](./src/app/personal-tecnico/page.tsx#L107) |
| `guardarJornada()` | [`handleJornadaSubmit` L155](./src/app/personal-tecnico/page.tsx#L155); formulario en [L605](./src/app/personal-tecnico/page.tsx#L605) |
| `registrarBloqueo()` | [`handleBloqueoSubmit` L196](./src/app/personal-tecnico/page.tsx#L196); formulario en [L695](./src/app/personal-tecnico/page.tsx#L695) |
| `eliminarBloqueo(bloqueoId)` | [`eliminarBloqueo` L262](./src/app/personal-tecnico/page.tsx#L262); botón en [L845](./src/app/personal-tecnico/page.tsx#L845) |
| `mostrarListadoTecnicos(resumen)` | tabla del estado global en [L499](./src/app/personal-tecnico/page.tsx#L499) |
| `mostrarAgenda(jornada, bloqueos)` | historial de bloqueos en [L775](./src/app/personal-tecnico/page.tsx#L775) (recorrido en [L809](./src/app/personal-tecnico/page.tsx#L809)); la jornada se carga en el formulario en [L113–L116](./src/app/personal-tecnico/page.tsx#L113) |
| `mostrarMensaje(texto)` | estado `mensaje` en [L61](./src/app/personal-tecnico/page.tsx#L61); banner en [L362](./src/app/personal-tecnico/page.tsx#L362) |

**Opciones del formulario**

| Elemento | Dónde está |
|---|---|
| Opciones de días (Lunes a Viernes, Lunes a Sábado, Lunes a Domingo, Fines de Semana) | [L31](./src/app/personal-tecnico/page.tsx#L31) |
| Tipos de ausencia | [`schema.ts#L5`](./src/backend/personal-tecnico/schema.ts#L5) |

### «control» ControlGestionJornadas → `src/app/actions/jornadas.ts` + `src/backend/personal-tecnico/service.ts`

| Método del diagrama | Server Action (entrada) | Backend (regla) |
|---|---|---|
| `sesionUsuarioId` | `getCurrentUser()` en [L63](./src/app/actions/jornadas.ts#L63) | [`src/lib/auth.ts#L17`](./src/lib/auth.ts#L17) |
| `obtenerResumenPersonalTecnico()` | [L43](./src/app/actions/jornadas.ts#L43) | [L55](./src/backend/personal-tecnico/service.ts#L55) |
| `obtenerBloqueosTecnico(usuarioId)` | [L50](./src/app/actions/jornadas.ts#L50) | [L150](./src/backend/personal-tecnico/service.ts#L150) |
| `guardarJornada(usuarioId, dias, horaInicio, horaFin)` | [L57](./src/app/actions/jornadas.ts#L57) | [L170](./src/backend/personal-tecnico/service.ts#L170) |
| `registrarBloqueo(usuarioId, inicio, fin, tipo, motivo)` | [L94](./src/app/actions/jornadas.ts#L94) | [L237](./src/backend/personal-tecnico/service.ts#L237) |
| `eliminarBloqueo(bloqueoId)` | [`eliminarBloqueoAction` L133](./src/app/actions/jornadas.ts#L133) | [L274](./src/backend/personal-tecnico/service.ts#L274) |
| `verificarPermiso(clave, accion)` | [`exigirModulo` L21](./src/app/actions/jornadas.ts#L21) | [`src/lib/permisos.ts#L107` `exigirPermiso`](./src/lib/permisos.ts#L107) |
| `validarTecnicoActivo(usuarioId)` | — | [`esTecnicoActivo` L18](./src/backend/personal-tecnico/service.ts#L18) |
| `validarDias(diaSemana)` | — | [`schema.ts#L18`](./src/backend/personal-tecnico/schema.ts#L18), que usa [`parseDiasSemana` L31](./src/backend/asignaciones/disponibilidad.ts#L31) |
| `validarHorario(horaInicio, horaFin)` | — | [`schema.ts#L30`](./src/backend/personal-tecnico/schema.ts#L30) |
| `validarRangoFechas(inicio, fin)` | — | [`schema.ts#L57`](./src/backend/personal-tecnico/schema.ts#L57) |

### «entity» (base de datos)

| Entidad y método | Código que la usa | Tabla en `db/schema.sql` |
|---|---|---|
| **Rol_Funcion** `tienePermiso(rolId, clave, accion)` | [`permisos.ts#L57` `getPermisosDeRol`](./src/lib/permisos.ts#L57), [`#L97` `tieneAccionModulo`](./src/lib/permisos.ts#L97) | [L56](./db/schema.sql#L56) |
| **Usuario** `listarTecnicosActivos()` | [`listarTecnicos` L30](./src/backend/personal-tecnico/service.ts#L30) | [L85](./db/schema.sql#L85) |
| **Usuario** `esTecnicoActivo(usuarioId)` | [L18–L26](./src/backend/personal-tecnico/service.ts#L18) | |
| **Carga_Horaria_Tecnico** `consultarJornadas(tecnicos)` | [L63](./src/backend/personal-tecnico/service.ts#L63) | [L138](./db/schema.sql#L138) |
| **Carga_Horaria_Tecnico** `guardarJornada(...)` | busca la existente en [L193](./src/backend/personal-tecnico/service.ts#L193); `update` en [L203](./src/backend/personal-tecnico/service.ts#L203) o `insert` en [L217](./src/backend/personal-tecnico/service.ts#L217) | |
| **Bloqueo_Tecnico** `consultarBloqueos(usuarioId)` | [L155](./src/backend/personal-tecnico/service.ts#L155) | [L156](./db/schema.sql#L156) |
| **Bloqueo_Tecnico** bloqueos vigentes (para el resumen) | [L69](./src/backend/personal-tecnico/service.ts#L69) | |
| **Bloqueo_Tecnico** `registrarBloqueo(...)` | `insert` en [L255](./src/backend/personal-tecnico/service.ts#L255) | |
| **Bloqueo_Tecnico** `obtenerBloqueo(bloqueoId)` | [L283](./src/backend/personal-tecnico/service.ts#L283) | |
| **Bloqueo_Tecnico** `eliminarBloqueo(bloqueoId)` | `delete` en [L289](./src/backend/personal-tecnico/service.ts#L289) | |
| **Bitacora** `registrarEvento(usuarioId, accion, descripcion)` | [`auditar` L26](./src/app/actions/jornadas.ts#L26), que llama a [`bitacora/service.ts#L21`](./src/backend/bitacora/service.ts#L21) y obtiene la IP con [`ip.ts#L32`](./src/lib/ip.ts#L32) | [L119](./db/schema.sql#L119) |

## CU10.3 Diagrama de comunicación

![Diagrama de comunicación CU10](img/cu10-comunicacion.png)

Cada color del diagrama es un flujo. Esta tabla sigue la numeración del diagrama.

### Flujo 1 (negro): Ingresar al módulo

| Mensaje | Qué hace | Código |
|---|---|---|
| 1 `ingresarModuloPersonalTecnico()` | El usuario abre `/personal-tecnico` | [`layout.tsx#L9`](./src/app/personal-tecnico/layout.tsx#L9), luego [`page.tsx#L89`](./src/app/personal-tecnico/page.tsx#L89) |
| 1.1 `obtenerResumenPersonalTecnico()` | La IU pide el resumen | [`page.tsx#L77`](./src/app/personal-tecnico/page.tsx#L77), que llega a [`jornadas.ts#L43`](./src/app/actions/jornadas.ts#L43) |
| 1.1.1 `verificarPermiso("PERSONAL_TECNICO", LEER)` | Control de acceso | [`jornadas.ts#L44`](./src/app/actions/jornadas.ts#L44) |
| 1.1.2 `listarTecnicosActivos()` | Técnicos con rol TECNICO y estado activo | [`service.ts#L56`](./src/backend/personal-tecnico/service.ts#L56), que llama a [L30](./src/backend/personal-tecnico/service.ts#L30) |
| 1.1.3 `consultarJornadas(tecnicos)` | Jornadas de todos los técnicos en una sola consulta | [`service.ts#L63`](./src/backend/personal-tecnico/service.ts#L63) |
| 1.1.4 `consultarBloqueosVigentes(tecnicos)` | Bloqueos de todos los técnicos | [`service.ts#L69`](./src/backend/personal-tecnico/service.ts#L69); la vigencia (en curso o futuro) se calcula en [L95–L104](./src/backend/personal-tecnico/service.ts#L95) |
| 1.2 `mostrarListadoTecnicos(resumen)` | Tabla "Listado y Estado Global" | [`page.tsx#L499`](./src/app/personal-tecnico/page.tsx#L499) |

### Flujo 2 (naranja): Seleccionar técnico

| Mensaje | Código |
|---|---|
| 2 `seleccionarTecnico(usuarioId)` | [`page.tsx#L552`](./src/app/personal-tecnico/page.tsx#L552) |
| 2.1 `obtenerBloqueosTecnico(usuarioId)` | [`page.tsx#L97`](./src/app/personal-tecnico/page.tsx#L97), que llega a [`jornadas.ts#L50`](./src/app/actions/jornadas.ts#L50) |
| 2.1.1 `consultarBloqueos(usuarioId)` | [`service.ts#L150`](./src/backend/personal-tecnico/service.ts#L150) |
| 2.1.2 `consultarJornada(usuarioId)` | Se toma del resumen ya cargado, sin nueva consulta: [`page.tsx#L113–L116`](./src/app/personal-tecnico/page.tsx#L113) (ver diferencias) |
| 2.2 `mostrarAgenda(jornada, bloqueos)` | Formulario de jornada en [L605](./src/app/personal-tecnico/page.tsx#L605) e historial en [L775](./src/app/personal-tecnico/page.tsx#L775) |

### Flujo 3 (verde): Guardar jornada

| Mensaje | Código |
|---|---|
| 3 `guardarJornada(diaSemana, horaInicio, horaFin)` | [`page.tsx#L155`](./src/app/personal-tecnico/page.tsx#L155) |
| 3.1 `guardarJornada(usuarioId, dias, inicio, fin)` | [`page.tsx#L179`](./src/app/personal-tecnico/page.tsx#L179), que llega a [`jornadas.ts#L57`](./src/app/actions/jornadas.ts#L57) |
| 3.1.1 `verificarPermiso(..., ACTUALIZAR)` | [`jornadas.ts#L67`](./src/app/actions/jornadas.ts#L67) |
| 3.1.2 `validarTecnicoActivo(usuarioId)` | [`service.ts#L184`](./src/backend/personal-tecnico/service.ts#L184) |
| 3.1.3 `validarDias(diaSemana)` | [`schema.ts#L18`](./src/backend/personal-tecnico/schema.ts#L18), aplicado en [`service.ts#L174`](./src/backend/personal-tecnico/service.ts#L174) |
| 3.1.4 `validarHorario(horaInicio, horaFin)` | [`schema.ts#L30`](./src/backend/personal-tecnico/schema.ts#L30) |
| 3.1.5 `[válido] guardarJornada(...)` | [`service.ts#L193–L229`](./src/backend/personal-tecnico/service.ts#L193): actualiza si ya existe, inserta si no |
| 3.1.6 `registrarEvento(CONFIGURAR_JORNADA)` | [`jornadas.ts#L82`](./src/app/actions/jornadas.ts#L82) |
| 3.2 `mostrarMensaje(resultado)` | [`page.tsx#L188`](./src/app/personal-tecnico/page.tsx#L188) (éxito) y [L190](./src/app/personal-tecnico/page.tsx#L190) (error) |

### Flujo 4 (azul): Registrar bloqueo

| Mensaje | Código |
|---|---|
| 4 `registrarBloqueo(fechaInicio, fechaFin, tipo, motivo)` | [`page.tsx#L196`](./src/app/personal-tecnico/page.tsx#L196) |
| 4.1 `registrarBloqueo(usuarioId, ...)` | [`page.tsx#L216`](./src/app/personal-tecnico/page.tsx#L216), que llega a [`jornadas.ts#L94`](./src/app/actions/jornadas.ts#L94) |
| 4.1.1 `verificarPermiso(..., CREAR)` | [`jornadas.ts#L105`](./src/app/actions/jornadas.ts#L105) |
| 4.1.2 `validarTecnicoActivo(usuarioId)` | [`service.ts#L251`](./src/backend/personal-tecnico/service.ts#L251) |
| 4.1.3 `validarRangoFechas(inicio, fin)` | [`schema.ts#L57`](./src/backend/personal-tecnico/schema.ts#L57), aplicado en [`service.ts#L241`](./src/backend/personal-tecnico/service.ts#L241) |
| 4.1.4 `[válido] registrarBloqueo(...)` | [`service.ts#L255`](./src/backend/personal-tecnico/service.ts#L255) |
| 4.1.5 `registrarEvento(REGISTRAR_BLOQUEO)` | [`jornadas.ts#L121`](./src/app/actions/jornadas.ts#L121) |
| 4.2 `mostrarMensaje(resultado)` | [`page.tsx#L251`](./src/app/personal-tecnico/page.tsx#L251) y [L256](./src/app/personal-tecnico/page.tsx#L256) |

### Flujo 5 (morado): Eliminar bloqueo

| Mensaje | Código |
|---|---|
| 5 `eliminarBloqueo(bloqueoId)` | [`page.tsx#L262`](./src/app/personal-tecnico/page.tsx#L262) (botón en [L845](./src/app/personal-tecnico/page.tsx#L845)) |
| 5.1 `eliminarBloqueo(bloqueoId)` | [`page.tsx#L269`](./src/app/personal-tecnico/page.tsx#L269), que llega a [`jornadas.ts#L133`](./src/app/actions/jornadas.ts#L133) |
| 5.1.1 `verificarPermiso(..., ELIMINAR)` | [`jornadas.ts#L138`](./src/app/actions/jornadas.ts#L138) |
| 5.1.2 `obtenerBloqueo(bloqueoId)` | [`service.ts#L282–L287`](./src/backend/personal-tecnico/service.ts#L282) |
| 5.1.3 `[existe] eliminarBloqueo(bloqueoId)` | [`service.ts#L289`](./src/backend/personal-tecnico/service.ts#L289) |
| 5.1.4 `registrarEvento(ELIMINAR_BLOQUEO, técnico, tipo, fechas)` | [`jornadas.ts#L148`](./src/app/actions/jornadas.ts#L148); el detalle con técnico, tipo y fechas se arma en [`service.ts#L297–L302`](./src/backend/personal-tecnico/service.ts#L297) |
| 5.2 `mostrarMensaje(resultado)` | [`page.tsx#L271`](./src/app/personal-tecnico/page.tsx#L271) y [L301](./src/app/personal-tecnico/page.tsx#L301) |

## CU10.4 Diagrama de secuencia

![Diagrama de secuencia CU10](img/cu10-secuencia.png)

Recorrido de cada bloque del diagrama en el código, en el mismo orden.

### Bloque 1 · Ingresar al módulo (mensajes 1 a 1.11)

1. **1** El usuario entra a `/personal-tecnico`. El layout verifica el acceso en [`layout.tsx#L9`](./src/app/personal-tecnico/layout.tsx#L9).
2. **1.1** La pantalla carga datos en [`recargarDatos` L71](./src/app/personal-tecnico/page.tsx#L71), que pide en paralelo `listarTecnicos()` y `obtenerResumenPersonalTecnico()` ([L75–L78](./src/app/personal-tecnico/page.tsx#L75)).
3. **1.2–1.3** `verificarPermiso("PERSONAL_TECNICO", LEER)` en [`jornadas.ts#L44`](./src/app/actions/jornadas.ts#L44). Si no tiene permiso, `exigirPermiso` ([`permisos.ts#L107`](./src/lib/permisos.ts#L107)) corta con error.
4. **1.4–1.5** `listarTecnicosActivos()` en [`service.ts#L30`](./src/backend/personal-tecnico/service.ts#L30).
5. **1.6–1.7** `consultarJornadas` en [`service.ts#L63`](./src/backend/personal-tecnico/service.ts#L63).
6. **1.8–1.9** `consultarBloqueosVigentes` en [`service.ts#L69`](./src/backend/personal-tecnico/service.ts#L69).
7. **1.10** El resumen (estado Disponible o Bloqueado y texto de la jornada) se arma en [`service.ts#L91–L144`](./src/backend/personal-tecnico/service.ts#L91).
8. **1.11** `mostrarListadoTecnicos` en [`page.tsx#L499`](./src/app/personal-tecnico/page.tsx#L499).

### Bloque 2 · Seleccionar técnico (2 a 2.5)

1. **2** Selector en [`page.tsx#L552`](./src/app/personal-tecnico/page.tsx#L552).
2. Al cambiar el técnico se ejecuta el efecto de [`page.tsx#L107`](./src/app/personal-tecnico/page.tsx#L107):
   - pone su jornada en el formulario ([L113–L116](./src/app/personal-tecnico/page.tsx#L113));
   - llama a `cargarBloqueosTecnico` ([L94](./src/app/personal-tecnico/page.tsx#L94)).
3. **2.1–2.4** [`jornadas.ts#L50`](./src/app/actions/jornadas.ts#L50) llama a [`service.ts#L150`](./src/backend/personal-tecnico/service.ts#L150), ordenado por fecha de inicio descendente.
4. **2.5** `mostrarAgenda`: historial en [`page.tsx#L775`](./src/app/personal-tecnico/page.tsx#L775).

### Bloque 3 · Guardar jornada (3 a 3.17)

1. **3** [`handleJornadaSubmit` L155](./src/app/personal-tecnico/page.tsx#L155). La pantalla hace validaciones previas:
   - que haya un técnico seleccionado ([L157](./src/app/personal-tecnico/page.tsx#L157));
   - máximo 20 caracteres ([L162](./src/app/personal-tecnico/page.tsx#L162));
   - hora de salida posterior a la de ingreso ([L170](./src/app/personal-tecnico/page.tsx#L170)).
2. **3.1** Llamada al servidor en [`page.tsx#L179`](./src/app/personal-tecnico/page.tsx#L179), que llega a [`jornadas.ts#L57`](./src/app/actions/jornadas.ts#L57). Primero exige sesión ([L63–L66](./src/app/actions/jornadas.ts#L63)).
3. **3.2–3.3** `verificarPermiso(ACTUALIZAR)` en [`jornadas.ts#L67`](./src/app/actions/jornadas.ts#L67).
4. **3.6–3.7** `validarDias` y `validarHorario` con Zod: [`service.ts#L174`](./src/backend/personal-tecnico/service.ts#L174) usando [`schema.ts#L10–L41`](./src/backend/personal-tecnico/schema.ts#L10).
5. **3.4–3.5** `esTecnicoActivo` en [`service.ts#L184`](./src/backend/personal-tecnico/service.ts#L184).
6. **alt [técnico activo y datos válidos]**
   - **3.8** guarda en [`service.ts#L193–L229`](./src/backend/personal-tecnico/service.ts#L193);
   - **3.9** `registrarEvento(CONFIGURAR_JORNADA)` en [`jornadas.ts#L82`](./src/app/actions/jornadas.ts#L82);
   - **3.10–3.11** mensaje "Jornada configurada / actualizada correctamente." ([`service.ts#L231`](./src/backend/personal-tecnico/service.ts#L231)).
7. **alt [no es técnico activo]** **3.12** "El usuario seleccionado no es un técnico activo" ([`service.ts#L14`](./src/backend/personal-tecnico/service.ts#L14), devuelto en [L185](./src/backend/personal-tecnico/service.ts#L185)).
8. **alt [días no reconocidos]** **3.14** mensaje definido en [`schema.ts#L19`](./src/backend/personal-tecnico/schema.ts#L19).
9. **alt [hora de salida ≤ hora de ingreso]** **3.16** mensaje definido en [`schema.ts#L38`](./src/backend/personal-tecnico/schema.ts#L38).

### Bloque 4 · Registrar bloqueo (4 a 4.14)

1. **4** [`handleBloqueoSubmit` L196](./src/app/personal-tecnico/page.tsx#L196). Validación previa de fechas en [L204](./src/app/personal-tecnico/page.tsx#L204).
2. **4.1** [`page.tsx#L216`](./src/app/personal-tecnico/page.tsx#L216) llega a [`jornadas.ts#L94`](./src/app/actions/jornadas.ts#L94).
3. **4.2–4.3** `verificarPermiso(CREAR)` en [`jornadas.ts#L105`](./src/app/actions/jornadas.ts#L105).
4. **4.6** `validarRangoFechas` en [`service.ts#L241`](./src/backend/personal-tecnico/service.ts#L241), con la regla de [`schema.ts#L45–L60`](./src/backend/personal-tecnico/schema.ts#L45) (también valida que el tipo esté en `TIPOS_AUSENCIA` y que haya motivo).
5. **4.4–4.5** `esTecnicoActivo` en [`service.ts#L251`](./src/backend/personal-tecnico/service.ts#L251).
6. **alt [técnico activo y fecha_fin > fecha_inicio]**
   - **4.7** `insert` en [`service.ts#L255`](./src/backend/personal-tecnico/service.ts#L255);
   - **4.8** `registrarEvento(REGISTRAR_BLOQUEO)` en [`jornadas.ts#L121`](./src/app/actions/jornadas.ts#L121);
   - **4.9–4.10** mensaje de éxito en [`page.tsx#L251`](./src/app/personal-tecnico/page.tsx#L251).
7. **alt [no es técnico activo]** **4.11** [`service.ts#L252`](./src/backend/personal-tecnico/service.ts#L252).
8. **alt [fecha_fin ≤ fecha_inicio]** **4.13** mensaje definido en [`schema.ts#L58`](./src/backend/personal-tecnico/schema.ts#L58).

### Bloque 5 · opt Eliminar bloqueo (5 a 5.11)

1. **5** [`eliminarBloqueo` L262](./src/app/personal-tecnico/page.tsx#L262). Antes pide confirmación al usuario ([L263](./src/app/personal-tecnico/page.tsx#L263)).
2. **5.1** [`page.tsx#L269`](./src/app/personal-tecnico/page.tsx#L269) llega a [`jornadas.ts#L133`](./src/app/actions/jornadas.ts#L133).
3. **5.2–5.3** `verificarPermiso(ELIMINAR)` en [`jornadas.ts#L138`](./src/app/actions/jornadas.ts#L138).
4. **5.4–5.5** `obtenerBloqueo` en [`service.ts#L282`](./src/backend/personal-tecnico/service.ts#L282).
5. **alt [el bloqueo existe]**
   - **5.6** `delete` en [`service.ts#L289`](./src/backend/personal-tecnico/service.ts#L289);
   - **5.7** `registrarEvento(ELIMINAR_BLOQUEO, técnico, tipo, fechas)` en [`jornadas.ts#L148`](./src/app/actions/jornadas.ts#L148);
   - **5.8** mensaje "Bloqueo cancelado y técnico desbloqueado con éxito." ([`service.ts#L299`](./src/backend/personal-tecnico/service.ts#L299)).
6. **alt [el bloqueo no existe]** **5.10** "El bloqueo no existe o ya fue eliminado" ([`service.ts#L15`](./src/backend/personal-tecnico/service.ts#L15), devuelto en [L287](./src/backend/personal-tecnico/service.ts#L287) y [L295](./src/backend/personal-tecnico/service.ts#L295)).

## CU10.5 Diferencias entre diagramas y código

Conózcanlas antes de la defensa: si el docente las encuentra, es mejor tener la explicación lista.

| # | Diagrama | Código | Cómo explicarlo |
|---|---|---|---|
| 1 | Secuencia 3.4 `esTecnicoActivo` va **antes** de 3.6/3.7 `validarDias`/`validarHorario` | El orden es inverso: primero Zod ([`service.ts#L174`](./src/backend/personal-tecnico/service.ts#L174)) y después la consulta a la base ([L184](./src/backend/personal-tecnico/service.ts#L184)) | Se valida primero lo que no necesita base de datos, para no consultar en vano. El resultado es el mismo. |
| 2 | Comunicación 2.1.2 `consultarJornada(usuarioId)` hace una consulta | La jornada se toma del resumen ya cargado ([`page.tsx#L113`](./src/app/personal-tecnico/page.tsx#L113)) | Optimización: el resumen ya trae la jornada de cada técnico. |
| 3 | La IU solo envía datos | La IU también valida antes de enviar ([L162](./src/app/personal-tecnico/page.tsx#L162), [L170](./src/app/personal-tecnico/page.tsx#L170), [L204](./src/app/personal-tecnico/page.tsx#L204)) y pide confirmación al eliminar ([L263](./src/app/personal-tecnico/page.tsx#L263)) | Experiencia de usuario (RNF08). El servidor vuelve a validar todo. |
| 4 | El documento dice que `REGISTRAR_BLOQUEO` guarda el rango de fechas | Guarda técnico, tipo y motivo, pero **no las fechas** ([`jornadas.ts#L121–L126`](./src/app/actions/jornadas.ts#L121)) | Corregir el texto del documento o agregar las fechas a la descripción. |
| 5 | La bitácora aparece como un paso más del flujo | Si la bitácora falla, la operación no se cancela; solo se escribe en consola ([`auditar` L26–L33](./src/app/actions/jornadas.ts#L26)) | Decisión de diseño: priorizar la operación. Es la misma en todo el sistema. |
| 6 | `Carga_Horaria_Tecnico` podría entenderse como una fila por día | Hay **una fila por técnico** y `dia_semana` guarda el texto del rango ("Lunes a Viernes"); se interpreta con [`parseDiasSemana`](./src/backend/asignaciones/disponibilidad.ts#L31) | Así lo muestra el diagrama de análisis (`dia_semana: {Lunes a Viernes \| ...}`). |
| 7 | — | **Error:** el mensaje de [`schema.ts#L19`](./src/backend/personal-tecnico/schema.ts#L19) sugiere "Lunes, Miércoles y Viernes" (26 caracteres), pero el límite es 20 ([L17](./src/backend/personal-tecnico/schema.ts#L17)) | Cambiar el ejemplo del mensaje o ampliar la columna a `VARCHAR(40)`. |

## CU10.6 Preguntas probables

- **¿Dónde se verifica el permiso?**
  - En la Server Action, con `exigirPermiso('PERSONAL_TECNICO', acción)` ([`jornadas.ts#L21`](./src/app/actions/jornadas.ts#L21)), que consulta la matriz `ROL_FUNCION` ([`permisos.ts#L107`](./src/lib/permisos.ts#L107)).
  - Además, el layout bloquea la ruta completa ([`layout.tsx#L9`](./src/app/personal-tecnico/layout.tsx#L9)).
- **¿Cómo se usa lo que configura el CU10?**
  - El CU11 lo lee para validar disponibilidad. Las jornadas se revisan día por día en [`motivosJornada` L90](./src/backend/asignaciones/disponibilidad.ts#L90).
  - Los bloqueos que se cruzan con la ventana de la orden están en [`asignaciones/service.ts#L81`](./src/backend/asignaciones/service.ts#L81). Es la relación «include» CU11 → CU10.
- **¿Qué pasa si registro vacaciones a un técnico que ya tiene una orden asignada en esas fechas?**
  - **Hoy no se valida.** El bloqueo se registra igual y la orden existente no se toca.
  - El bloqueo sí impide asignarlo a órdenes **nuevas**.
- **¿En qué zona horaria se guardan las fechas?**
  - En hora de Bolivia, como `TIMESTAMP` sin zona. Se manejan como texto para no convertirlas: [`src/lib/fechas.ts`](./src/lib/fechas.ts).
- **¿Por qué el técnico aparece "Bloqueado" si su bloqueo es futuro?**
  - Porque el resumen muestra el bloqueo en curso o el próximo vigente ([`service.ts#L95–L104`](./src/backend/personal-tecnico/service.ts#L95)).

---

# CU12 · Gestionar Órdenes de Trabajo y Reporte de Campo

**Actores:** Encargado o Administrador (crear, cancelar, ver y liquidar) y Técnico (iniciar, marcar fin y reportar).
**Permisos:**
- `ORDENES_TRABAJO` con LEER, CREAR, ACTUALIZAR y PROCESAR.
- Para cancelar o cambiar la ventana: `ASIGNAR_TECNICOS` con ACTUALIZAR.

**Ruta:** `/ordenes-trabajo`. **Relación:** «include» CU16 (descuento de stock y kárdex).

## CU12.1 Archivos y carpetas

| Pieza | Archivo |
|---|---|
| Página del módulo (elige qué lista cargar según el rol) | [`src/app/ordenes-trabajo/page.tsx`](./src/app/ordenes-trabajo/page.tsx) |
| IU principal y modal de reporte de campo | [`src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx`](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx) |
| Modal de ventana horaria y orden correctiva | [`src/app/ordenes-trabajo/modal-ventana.tsx`](./src/app/ordenes-trabajo/modal-ventana.tsx#L13) |
| Protección de la ruta | [`src/app/ordenes-trabajo/layout.tsx#L9`](./src/app/ordenes-trabajo/layout.tsx#L9) |
| IU de cotizaciones (convertir en OT) | [`src/app/cotizaciones/page.tsx`](./src/app/cotizaciones/page.tsx#L88) |
| Server Actions (control: sesión, permisos, IP) | [`src/app/actions/ordenes-trabajo.ts`](./src/app/actions/ordenes-trabajo.ts) |
| Controlador (control: reglas) | [`src/backend/ordenes/control-ordenes-trabajo.ts`](./src/backend/ordenes/control-ordenes-trabajo.ts) |
| Estados de la orden | [`src/backend/ordenes/estados.ts`](./src/backend/ordenes/estados.ts) |
| Validación del reporte (Zod) | [`src/backend/ordenes/schema.ts#L25`](./src/backend/ordenes/schema.ts#L25) |
| SQL: crear OT (correlativo y bitácora en una transacción) | [`db/migrations/aplicadas/migracion_cu12_crear_orden.sql`](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L17) |
| SQL: reporte de campo atómico (versión vigente) | [`db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql`](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L21) |
| SQL: kárdex («include» CU16) | [`db/migrations/aplicadas/migracion_cu16_inventario.sql#L315`](./db/migrations/aplicadas/migracion_cu16_inventario.sql#L315) |
| SQL: restricción de estados | [`migracion_cu12_estados_orden.sql#L19`](./db/migrations/aplicadas/migracion_cu12_estados_orden.sql#L19) |
| Pruebas | [`pruebas/bd/cu12-reporte-campo.prueba.mjs`](./pruebas/bd/cu12-reporte-campo.prueba.mjs) (`npm run test:bd:cu12`) y [`pruebas/ordenes/`](./pruebas/ordenes) (`npm run test:ordenes`, `npm run test:permisos`) |

**Ciclo de estados** (restricción `chk_orden_estado` y [`estados.ts`](./src/backend/ordenes/estados.ts#L6)):

```
PROGRAMADA ──(Iniciar labor)──> EN_PROGRESO ──(Marcar fin)──> EN_PROGRESO con fecha_fin_real ──(Reporte de campo)──> FINALIZADA
     └──(Cancelar)──> CANCELADA
```

## CU12.2 Diagrama de análisis (clases)

![Diagrama de análisis CU12](img/cu12-analisis.png)

### «boundary» IU_Cotizaciones → `src/app/cotizaciones/page.tsx`

| Elemento del diagrama | Dónde está |
|---|---|
| `cotizacionId`, `fechaInicioProgramada`, `fechaFinProgramada` | `cotizacionParaConvertir` en [L35](./src/app/cotizaciones/page.tsx#L35) y los campos de fecha y hora del modal |
| `convertirEnOrden(cotizacionId, ventana)` | botón en [L237](./src/app/cotizaciones/page.tsx#L237), que abre [`handleAbrirModalConvertir` L88](./src/app/cotizaciones/page.tsx#L88); al confirmar se ejecuta [`handleConfirmarConvertir` L100](./src/app/cotizaciones/page.tsx#L100) |
| `mostrarAvisoSinAnticipo()` | `sinAnticipo` en [L96](./src/app/cotizaciones/page.tsx#L96); aviso en [L305](./src/app/cotizaciones/page.tsx#L305) |
| `irAsignarCuadrilla(ordenId) [CU11]` | `router.push('/asignar-tecnicos/…')` en [L124](./src/app/cotizaciones/page.tsx#L124) |
| `mostrarMensaje(texto)` | [L122](./src/app/cotizaciones/page.tsx#L122) y [L126](./src/app/cotizaciones/page.tsx#L126) |

### «boundary» IU_GestionarOrdenesTrabajo → `page.tsx` + `iu-gestionar-ordenes-trabajo.tsx`

| Elemento del diagrama | Dónde está |
|---|---|
| `ordenes`, `filtroEstado` | [`iu-…tsx#L89–L92`](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L89); selector de filtro en [L339](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L339) |
| `solicitarModuloOrdenes(filtroEstado)` | [`page.tsx#L10`](./src/app/ordenes-trabajo/page.tsx#L10); para Encargado o Administrador llama `obtenerOrdenesTrabajoAccion` en [L18](./src/app/ordenes-trabajo/page.tsx#L18) |
| `consultarMisOrdenes()` (Técnico) | [`page.tsx#L15–L16`](./src/app/ordenes-trabajo/page.tsx#L15) (`obtenerOrdenesTecnicoAccion`) |
| `nuevaOrdenCorrectiva(tipoTrabajo, ventana)` | botón en [L352](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L352), modal en [L465](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L465) y [`confirmarVentana` L270](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L270), que llama a [L274](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L274) |
| `marcarInicio(ordenId)` | [`iniciarOrden` L94](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L94); botón en [L406](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L406) (solo Técnico y orden PROGRAMADA) |
| `marcarFin(ordenId)` | [`finalizarOrden` L112](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L112); botón "Marcar Fin" en [L416](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L416) |
| `cancelarOrden(ordenId)` | [`cancelarOrden` L283](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L283); botón en [L437](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L437) |
| `verDetalle(ordenId)` | [`verDetalle` L260](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L260); botón en [L450](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L450) |
| `liquidar(ordenId) [CU13]` | enlace a `/liquidacion/{id}` en [L445](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L445) |
| `mostrarOrdenes(estado, horas)` | tabla en [L382](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L382); horas calculadas en [L401](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L401) |
| `mostrarDetalle(orden)` | horas trabajadas en [L489](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L489) |

### «boundary» IU_ReporteCampo → modal dentro de `iu-gestionar-ordenes-trabajo.tsx` (desde L551)

| Elemento del diagrama | Dónde está |
|---|---|
| `ordenId`, `diagnostico`, `materiales`, `confirmarSinMateriales` | estados del componente; `confirmarSinMateriales` en [L83](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L83) |
| `abrirReporteCampo(ordenId)` | [`abrirReporte` L130](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L130); botón "Reporte de Campo" en [L427](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L427) |
| `mostrarMaterialesCotizados(lista)` | carga en [L139](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L139); modal en [L551](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L551) |
| `registrarReporte(diagnostico, materiales)` | [`procesarReporte` L215](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L215), que envía en [L233](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L233); agregar material en [L162](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L162) |
| `mostrarConfirmacion()` | revisión en [L225](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L225); casilla en [L696](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L696) |

### «control» ControlOrdenesTrabajo → `src/app/actions/ordenes-trabajo.ts` + `src/backend/ordenes/control-ordenes-trabajo.ts`

| Método del diagrama | Server Action | Controlador / SQL |
|---|---|---|
| `sesionUsuarioId` | [`contexto` L24–L27](./src/app/actions/ordenes-trabajo.ts#L24) | — |
| `verificarPermiso(clave, accion)` | [`contexto` L28](./src/app/actions/ordenes-trabajo.ts#L28) | [`permisos.ts#L107`](./src/lib/permisos.ts#L107) |
| `obtenerOrdenesTrabajo()` | [L57](./src/app/actions/ordenes-trabajo.ts#L57) | consulta directa |
| `obtenerOrdenesTecnico()` | [L39](./src/app/actions/ordenes-trabajo.ts#L39) | filtra `orden_trabajo_tecnico` por usuario en [L43](./src/app/actions/ordenes-trabajo.ts#L43) |
| `obtenerDetalle(ordenId)` | [L74](./src/app/actions/ordenes-trabajo.ts#L74) | horas en [L86](./src/app/actions/ordenes-trabajo.ts#L86) |
| `convertirCotizacionAOrden(cotizacionId, ventana)` | [L112](./src/app/actions/ordenes-trabajo.ts#L112) | [L30](./src/backend/ordenes/control-ordenes-trabajo.ts#L30) → [`crearOrdenBD` L59](./src/backend/ordenes/control-ordenes-trabajo.ts#L59) → [RPC L65](./src/backend/ordenes/control-ordenes-trabajo.ts#L65) → [`fn_crear_orden_trabajo`](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L17) |
| `crearOrdenCorrectiva(tipoTrabajo, ventana)` | [L156](./src/app/actions/ordenes-trabajo.ts#L156) | [L47](./src/backend/ordenes/control-ordenes-trabajo.ts#L47), que usa la misma función SQL |
| `cancelarOrden(ordenId)` | [L96](./src/app/actions/ordenes-trabajo.ts#L96) | [L160](./src/backend/ordenes/control-ordenes-trabajo.ts#L160) |
| `registrarInicio(ordenId)` | [L173](./src/app/actions/ordenes-trabajo.ts#L173) | [`registrarMarcaTiempoInicio` L193](./src/backend/ordenes/control-ordenes-trabajo.ts#L193) |
| `registrarFin(ordenId)` | [L187](./src/app/actions/ordenes-trabajo.ts#L187) | [`registrarMarcaTiempoFin` L255](./src/backend/ordenes/control-ordenes-trabajo.ts#L255) |
| `obtenerCotizado(ordenId)` | [L241](./src/app/actions/ordenes-trabajo.ts#L241) | junta las líneas del mismo producto |
| `procesarReporteCampo(ordenId, diagnostico, materiales)` | [L201](./src/app/actions/ordenes-trabajo.ts#L201) | [L316](./src/backend/ordenes/control-ordenes-trabajo.ts#L316) → [RPC L372](./src/backend/ordenes/control-ordenes-trabajo.ts#L372) → [`fn_procesar_reporte_campo`](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L21) |
| `validarTecnicoAsignado(ordenId, usuarioId)` | — | [L130](./src/backend/ordenes/control-ordenes-trabajo.ts#L130); se repite en SQL en [v2 L68–L82](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L68) |
| `validarEstado(orden, estadoEsperado)` | — | inicio en [L213](./src/backend/ordenes/control-ordenes-trabajo.ts#L213); reporte en [L341–L347](./src/backend/ordenes/control-ordenes-trabajo.ts#L341) |
| `validarFinRegistrado(orden)` | — | [L351](./src/backend/ordenes/control-ordenes-trabajo.ts#L351) |
| `calcularHoras(inicio, fin)` | — | [`horasEntre` en `disponibilidad.ts#L72`](./src/backend/asignaciones/disponibilidad.ts#L72) |

### «entity» (base de datos)

| Entidad y método | Código | Tabla |
|---|---|---|
| **Orden_Trabajo** `registrar(codigo, tipo, ventana)` | [`fn_crear_orden_trabajo` INSERT L71](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L71); correlativo OT-AAAA-NNN protegido en [L65](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L65) | [`schema.sql#L466`](./db/schema.sql#L466) |
| **Orden_Trabajo** `cancelar(ordenId)` | [`control#L168`](./src/backend/ordenes/control-ordenes-trabajo.ts#L168) | |
| **Orden_Trabajo** `registrarInicioReal(fechaHora)` | [`control#L224`](./src/backend/ordenes/control-ordenes-trabajo.ts#L224) (`ahoraBolivia()` y paso a EN_PROGRESO) | |
| **Orden_Trabajo** `registrarFinReal(fechaHora)` | [`control#L288`](./src/backend/ordenes/control-ordenes-trabajo.ts#L288) | |
| **Orden_Trabajo** `finalizar(ordenId, diagnostico)` | [SQL v2 L116](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L116) | |
| **Orden_Trabajo** `listarOrdenes`, `obtenerDetalle` | [actions L57](./src/app/actions/ordenes-trabajo.ts#L57) y [L74](./src/app/actions/ordenes-trabajo.ts#L74) | |
| **Orden_Trabajo_Tecnico** `listarPorTecnico(usuarioId)` | [actions L43](./src/app/actions/ordenes-trabajo.ts#L43) | [`schema.sql#L521`](./db/schema.sql#L521) |
| **Orden_Trabajo_Tecnico** `estaAsignado(ordenId, usuarioId)` | [control L144](./src/backend/ordenes/control-ordenes-trabajo.ts#L144) | |
| **Cotizacion** `verificarAprobadaSinOrden(cotizacionId)` | [SQL crear L47–L58](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L47) | [`schema.sql#L343`](./db/schema.sql#L343) |
| **DetalleCotizacionProducto** `obtenerMaterialesCotizados(cotizacionId)` | [actions L241](./src/app/actions/ordenes-trabajo.ts#L241) | [`schema.sql#L382`](./db/schema.sql#L382) |
| **DetalleCotizacionProducto** `contarMateriales(cotizacionId)` | [control L355–L367](./src/backend/ordenes/control-ordenes-trabajo.ts#L355) | |
| **Producto** `listarParaConsumo()` | [actions L221](./src/app/actions/ordenes-trabajo.ts#L221) | [`schema.sql#L216`](./db/schema.sql#L216) |
| **Producto** `descontarStock(productoId, cantidad)` | [`fn_kardex_aplicar`](./db/migrations/aplicadas/migracion_cu16_inventario.sql#L315): bloquea el producto en L360, revisa stock en [L371](./db/migrations/aplicadas/migracion_cu16_inventario.sql#L371) y actualiza en [L378](./db/migrations/aplicadas/migracion_cu16_inventario.sql#L378) | |
| **Movimiento_Kardex** `registrarSalida(productoId, cantidad, origen)` | [`fn_kardex_aplicar` L381](./db/migrations/aplicadas/migracion_cu16_inventario.sql#L381) (`SALIDA` / `CONSUMO_OT`) | [`schema.sql#L757`](./db/schema.sql#L757) |
| **Detalle_Consumo_Material** `registrarConsumo(ordenId, productoId, cantidad)` | [SQL v2 L100](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L100) | [`schema.sql#L547`](./db/schema.sql#L547) |
| **Usuario** `obtenerRol(usuarioId)` | [control L136–L141](./src/backend/ordenes/control-ordenes-trabajo.ts#L136) | [`schema.sql#L85`](./db/schema.sql#L85) |
| **Rol_Funcion** `tienePermiso(...)` | [`permisos.ts#L97`](./src/lib/permisos.ts#L97) | [`schema.sql#L56`](./db/schema.sql#L56) |
| **Bitacora** `registrarEvento(...)` | creación: [SQL crear L78](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L78); cancelar: [control L178](./src/backend/ordenes/control-ordenes-trabajo.ts#L178); inicio: [L239](./src/backend/ordenes/control-ordenes-trabajo.ts#L239); fin: [L300](./src/backend/ordenes/control-ordenes-trabajo.ts#L300); finalizar: [SQL v2 L124](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L124) | [`schema.sql#L119`](./db/schema.sql#L119) |

## CU12.3 Diagrama de comunicación

![Diagrama de comunicación CU12](img/cu12-comunicacion.png)

**Permisos de todos los flujos** (1.1.1, 2.1.1, 3.1.1, 4.1.1, 5.1.1, 6.1.1, 7.1.1, 9.1.1 y 10.1.1 `verificarPermiso(clave, accion)`): se verifican siempre en [`contexto()` L24–L28](./src/app/actions/ordenes-trabajo.ts#L24).

### Flujo 1 (negro): Listar órdenes (Encargado)

| Mensaje | Código |
|---|---|
| 1 `solicitarModuloOrdenes(filtroEstado)` | [`page.tsx#L10`](./src/app/ordenes-trabajo/page.tsx#L10) |
| 1.1 `obtenerOrdenesTrabajo()` | [`page.tsx#L18`](./src/app/ordenes-trabajo/page.tsx#L18), que llega a [actions L57](./src/app/actions/ordenes-trabajo.ts#L57) |
| 1.1.2 `listarOrdenes(filtroEstado)` | [actions L60–L63](./src/app/actions/ordenes-trabajo.ts#L60); el filtro se aplica en la IU, [L92](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L92) |
| 1.2 `mostrarOrdenes(estado, horas)` | [IU L382](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L382); horas en [L401](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L401) |

### Flujo 2 (rojo oscuro): Convertir cotización en orden

| Mensaje | Código |
|---|---|
| 2 `convertirEnOrden(cotizacionId, ventana)` | [`cotizaciones/page.tsx#L100`](./src/app/cotizaciones/page.tsx#L100) |
| 2.1 `convertirCotizacionAOrden(...)` | [`cotizaciones/page.tsx#L116`](./src/app/cotizaciones/page.tsx#L116), que llega a [actions L112](./src/app/actions/ordenes-trabajo.ts#L112) y a [control L30](./src/backend/ordenes/control-ordenes-trabajo.ts#L30) |
| 2.1.2 `[APROBADA y sin orden] verificarCotizacion` | [SQL crear L47–L58](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L47) |
| 2.1.3 `registrar(OT-AAAA-NNN, ventana) → PROGRAMADA` | [SQL crear L65–L76](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L65) |
| 2.1.4 `registrarEvento(CREAR_ORDEN_TRABAJO)` | [SQL crear L78](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L78) (misma transacción) |
| 2.2 `irAsignarCuadrilla(ordenId) [CU11]` | [`cotizaciones/page.tsx#L124`](./src/app/cotizaciones/page.tsx#L124) |

### Flujo 3 (verde): Orden correctiva

| Mensaje | Código |
|---|---|
| 3 `nuevaOrdenCorrectiva(tipoTrabajo, ventana)` | [IU L352](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L352), luego [L270](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L270) |
| 3.1 `crearOrdenCorrectiva(...)` | [IU L274](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L274), que llega a [actions L156](./src/app/actions/ordenes-trabajo.ts#L156) y a [control L47](./src/backend/ordenes/control-ordenes-trabajo.ts#L47) |
| 3.1.2 `registrar(...)` y 3.1.3 `registrarEvento(CREAR_ORDEN_TRABAJO)` | misma función SQL: [L71](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L71) y [L78](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L78) |

### Flujo 4 (naranja): Cancelar orden

| Mensaje | Código |
|---|---|
| 4 `cancelarOrden(ordenId)` | [IU L283](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L283) (con confirmación en L284) |
| 4.1 `cancelarOrden(ordenId)` | [actions L96](./src/app/actions/ordenes-trabajo.ts#L96); el permiso `ASIGNAR_TECNICOS` con ACTUALIZAR está en [L99](./src/app/actions/ordenes-trabajo.ts#L99) |
| 4.1.2 `[PROGRAMADA] cancelar() → CANCELADA` | [control L166–L175](./src/backend/ordenes/control-ordenes-trabajo.ts#L166) |
| 4.1.3 `registrarEvento(CANCELAR_ORDEN_TRABAJO)` | [control L178](./src/backend/ordenes/control-ordenes-trabajo.ts#L178) |

### Flujo 5 (azul): Mis órdenes (Técnico)

| Mensaje | Código |
|---|---|
| 5 `consultarMisOrdenes()` | [`page.tsx#L15`](./src/app/ordenes-trabajo/page.tsx#L15) |
| 5.1 `obtenerOrdenesTecnico()` | [actions L39](./src/app/actions/ordenes-trabajo.ts#L39) |
| 5.1.2 `listarPorTecnico(usuarioId)` | [actions L43–L45](./src/app/actions/ordenes-trabajo.ts#L43) |
| 5.1.3 `listarOrdenes(ordenIds)` | mismo `select` con `orden_trabajo(*)`, [L44](./src/app/actions/ordenes-trabajo.ts#L44) |
| 5.2 `mostrarOrdenesAsignadas()` | título "Mis Órdenes Asignadas", [IU L334](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L334) |

### Flujo 6 (azul marino): Iniciar labor

| Mensaje | Código |
|---|---|
| 6 `marcarInicio(ordenId)` | [IU L94](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L94) |
| 6.1 `registrarInicio(ordenId)` | [actions L173](./src/app/actions/ordenes-trabajo.ts#L173), que llega a [control L193](./src/backend/ordenes/control-ordenes-trabajo.ts#L193) |
| 6.1.2 `validarTecnicoAsignado` | [control L200](./src/backend/ordenes/control-ordenes-trabajo.ts#L200), que llama a [L130](./src/backend/ordenes/control-ordenes-trabajo.ts#L130) |
| 6.1.3 `[PROGRAMADA] registrarInicioReal(horaBolivia) → EN_PROGRESO` | [control L213–L230](./src/backend/ordenes/control-ordenes-trabajo.ts#L213) |
| 6.1.4 `registrarEvento(INICIO_ORDEN_TRABAJO)` | [control L239](./src/backend/ordenes/control-ordenes-trabajo.ts#L239) |

### Flujo 7 (violeta): Marcar fin

| Mensaje | Código |
|---|---|
| 7 `marcarFin(ordenId)` | [IU L112](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L112) |
| 7.1 `registrarFin(ordenId)` | [actions L187](./src/app/actions/ordenes-trabajo.ts#L187), que llega a [control L255](./src/backend/ordenes/control-ordenes-trabajo.ts#L255) |
| 7.1.2 `validarTecnicoAsignado` | [control L262](./src/backend/ordenes/control-ordenes-trabajo.ts#L262) |
| 7.1.3 `[EN_PROGRESO y sin fin] registrarFinReal(horaBolivia)` | revisiones en [L275–L281](./src/backend/ordenes/control-ordenes-trabajo.ts#L275); actualización en [L288](./src/backend/ordenes/control-ordenes-trabajo.ts#L288) |
| 7.1.4 `registrarEvento(FIN_ORDEN_TRABAJO)` | [control L300](./src/backend/ordenes/control-ordenes-trabajo.ts#L300) (incluye las horas técnicas calculadas en [L284](./src/backend/ordenes/control-ordenes-trabajo.ts#L284)) |
| 7.2 `mostrar("Labor terminada · falta reporte")` | botón "Reporte de Campo" en [IU L423–L431](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L423) |

### Flujos 8 y 9 (turquesa): Reporte de campo

| Mensaje | Código |
|---|---|
| 8 `abrirReporteCampo(ordenId)` | [IU L130](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L130) |
| 8.1 `obtenerCotizado(ordenId)` | [IU L139](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L139), que llega a [actions L241](./src/app/actions/ordenes-trabajo.ts#L241) |
| 8.1.1 / 8.1.2 obtener detalle y materiales cotizados | [actions L250–L256](./src/app/actions/ordenes-trabajo.ts#L250) |
| 8.1.3 `listarParaConsumo()` | [actions L221](./src/app/actions/ordenes-trabajo.ts#L221) |
| 8.2 `mostrarMaterialesCotizados(lista)` | modal en [IU L551](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L551) |
| 9 `registrarReporte(diagnostico, materiales, confirmarSinMateriales)` | [IU L215](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L215) |
| 9.1 `procesarReporteCampo(...)` | [IU L233](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L233), que llega a [actions L201](./src/app/actions/ordenes-trabajo.ts#L201) (permiso PROCESAR en [L208](./src/app/actions/ordenes-trabajo.ts#L208)) y a [control L316](./src/backend/ordenes/control-ordenes-trabajo.ts#L316) |
| 9.1.2 `validarTecnicoAsignado` | [control L327](./src/backend/ordenes/control-ordenes-trabajo.ts#L327) |
| 9.1.3 `[EN_PROGRESO y con fin] consultarOrden` | [control L331–L353](./src/backend/ordenes/control-ordenes-trabajo.ts#L331) |
| 9.1.4 `[sin materiales] contarMaterialesCotizados()` | [control L355–L367](./src/backend/ordenes/control-ordenes-trabajo.ts#L355) |
| 9.1.5 `descontarStock` y 9.1.6 `registrarSalida(CONSUMO_OT)` | [SQL v2 L95](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L95), que llama a [`fn_kardex_aplicar` L315](./db/migrations/aplicadas/migracion_cu16_inventario.sql#L315) («include» CU16) |
| 9.1.7 `registrarConsumo(ordenId, materiales)` | [SQL v2 L100](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L100) |
| 9.1.8 `finalizar(diagnostico) → FINALIZADA` | [SQL v2 L116](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L116) |
| 9.1.9 `registrarEvento(FINALIZAR_ORDEN_TRABAJO)` | [SQL v2 L124](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L124) |
| 9.2 `mostrarMensaje(resultado)` | respuesta de [actions L212](./src/app/actions/ordenes-trabajo.ts#L212) mostrada en la IU |

### Flujos 10 y 11 (oliva y dorado): Detalle y liquidar

| Mensaje | Código |
|---|---|
| 10 `verDetalle(ordenId)` | [IU L260](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L260) |
| 10.1 `obtenerDetalle(ordenId)` | [actions L74](./src/app/actions/ordenes-trabajo.ts#L74) (si es técnico, solo ve sus órdenes: [L77](./src/app/actions/ordenes-trabajo.ts#L77)) |
| 10.1.2 `obtenerDetalle [horas = fin − inicio]` | [actions L86](./src/app/actions/ordenes-trabajo.ts#L86) |
| 10.2 `mostrarDetalle()` | [IU L489](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L489) |
| 11 `liquidar(ordenId) [FINALIZADA]` y 11.1 `irLiquidacion [CU13]` | [IU L445](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L445) |

## CU12.4 Diagrama de secuencia

![Diagrama de secuencia CU12](img/cu12-secuencia.png)

### Bloque 1 · Listar órdenes (1 a 1.2)

1. **1** [`page.tsx#L10`](./src/app/ordenes-trabajo/page.tsx#L10). La página decide si el usuario es técnico en [L12](./src/app/ordenes-trabajo/page.tsx#L12).
2. **1.1** [actions L57](./src/app/actions/ordenes-trabajo.ts#L57).
3. **1.1.1** `verificarPermiso("ORDENES_TRABAJO", LEER)` en [L59](./src/app/actions/ordenes-trabajo.ts#L59), que llama a [`contexto` L28](./src/app/actions/ordenes-trabajo.ts#L28).
4. **1.1.2** consulta en [L60–L63](./src/app/actions/ordenes-trabajo.ts#L60).
5. **1.1.3** `calcularHoras` en la IU, [L401](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L401).
6. **1.2** tabla en [IU L382](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L382).

### Bloque 2 · Convertir cotización (2 a 2.2)

1. **2** [`cotizaciones/page.tsx#L100`](./src/app/cotizaciones/page.tsx#L100). La IU valida que la ventana esté completa ([L104](./src/app/cotizaciones/page.tsx#L104)) y que el fin sea posterior al inicio ([L109](./src/app/cotizaciones/page.tsx#L109)).
2. **opt [la cotización no tiene anticipo]** `mostrarAvisoSinAnticipo` en [L96](./src/app/cotizaciones/page.tsx#L96) y [L305](./src/app/cotizaciones/page.tsx#L305).
3. **2.1** [actions L112](./src/app/actions/ordenes-trabajo.ts#L112) con permiso CREAR ([L117](./src/app/actions/ordenes-trabajo.ts#L117)). Luego [control L30](./src/backend/ordenes/control-ordenes-trabajo.ts#L30) arma la ventana en hora de Bolivia ([L41](./src/backend/ordenes/control-ordenes-trabajo.ts#L41)) y llama a la [RPC en L65](./src/backend/ordenes/control-ordenes-trabajo.ts#L65).
4. **2.1.2** `verificarAprobadaSinOrden` dentro de SQL: bloquea la cotización ([L47](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L47)), revisa que esté APROBADA ([L52](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L52)) y que no tenga orden ([L57](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L57)).
5. **alt [APROBADA, sin orden y con ventana válida]**
   - **2.1.3** correlativo y `INSERT` ([L65–L76](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L65));
   - **2.1.4** bitácora ([L78](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L78));
   - **2.2** redirección al CU11 ([`cotizaciones/page.tsx#L124`](./src/app/cotizaciones/page.tsx#L124)).
6. **alt [no APROBADA]** "Solo se pueden convertir cotizaciones en estado APROBADA", [SQL L52](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L52).
7. **alt [ya tiene orden]** "Ya existe una Orden de Trabajo para esta cotización", [SQL L57](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L57).
8. **alt [sin ventana / fin ≤ inicio]**
   - [control L39](./src/backend/ordenes/control-ordenes-trabajo.ts#L39) y [`src/lib/fechas.ts`](./src/lib/fechas.ts) (`ventanaBolivia`);
   - se repite en [SQL L39–L42](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L39).

### Bloque 3 · opt Orden correctiva (3 a 3.1.3)

1. **3** [IU L270](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L270); modal en [`modal-ventana.tsx#L13`](./src/app/ordenes-trabajo/modal-ventana.tsx#L13).
2. **3.1** [actions L156](./src/app/actions/ordenes-trabajo.ts#L156), luego [control L47](./src/backend/ordenes/control-ordenes-trabajo.ts#L47).
3. **alt [tipo y ventana válidos]** 3.1.2 y 3.1.3 en [SQL L71](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L71) y [L78](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L78).
4. **alt [datos incompletos]** "El tipo de trabajo es obligatorio", [control L53](./src/backend/ordenes/control-ordenes-trabajo.ts#L53).

### Bloque 4 · opt Cancelar orden (4 a 4.1.3)

1. **4** [IU L283](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L283). El mensaje "¿Cancelar la orden …? Esta acción no se puede deshacer." está en [L284](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L284).
2. **4.1.1** `verificarPermiso("ASIGNAR_TECNICOS", ACTUALIZAR)` en [actions L99](./src/app/actions/ordenes-trabajo.ts#L99).
3. **4.1.2** `UPDATE … WHERE estado = 'PROGRAMADA'` en [control L166–L171](./src/backend/ordenes/control-ordenes-trabajo.ts#L166). Filtrar por estado dentro del `UPDATE` evita cancelar una orden que el técnico acaba de iniciar.
4. **alt [CANCELADA]** bitácora en [L178](./src/backend/ordenes/control-ordenes-trabajo.ts#L178).
5. **alt [no estaba PROGRAMADA]** "Solo se pueden cancelar órdenes en estado Programada", [L175](./src/backend/ordenes/control-ordenes-trabajo.ts#L175).

### Bloque 5 · Mis órdenes (Técnico) (5 a 5.2)

1. **5** [`page.tsx#L15`](./src/app/ordenes-trabajo/page.tsx#L15).
2. **5.1** [actions L39](./src/app/actions/ordenes-trabajo.ts#L39) (permiso LEER en L41).
3. **5.1.2–5.1.3** [L42–L47](./src/app/actions/ordenes-trabajo.ts#L42).
4. **5.2** [IU L334](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L334).

### Bloque 6 · Iniciar labor (6 a 6.1.4)

1. **6** [IU L94](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L94).
2. **6.1** [actions L173](./src/app/actions/ordenes-trabajo.ts#L173) (permiso ACTUALIZAR en L175), luego [control L193](./src/backend/ordenes/control-ordenes-trabajo.ts#L193).
3. **6.1.2** [control L200](./src/backend/ordenes/control-ordenes-trabajo.ts#L200).
4. **alt [asignado, PROGRAMADA y sin inicio]**
   - **6.1.3** [L221–L230](./src/backend/ordenes/control-ordenes-trabajo.ts#L221);
   - **6.1.4** [L239](./src/backend/ordenes/control-ordenes-trabajo.ts#L239).
5. **alt [técnico no asignado]** "Acceso denegado: el técnico no está asignado a esta orden de trabajo", [L151](./src/backend/ordenes/control-ordenes-trabajo.ts#L151).
6. **alt [estado ≠ PROGRAMADA o inicio ya registrado]** [L214](./src/backend/ordenes/control-ordenes-trabajo.ts#L214) y [L218](./src/backend/ordenes/control-ordenes-trabajo.ts#L218).

### Bloque 7 · Marcar fin (7 a 7.2)

1. **7** [IU L112](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L112).
2. **7.1** [actions L187](./src/app/actions/ordenes-trabajo.ts#L187), luego [control L255](./src/backend/ordenes/control-ordenes-trabajo.ts#L255).
3. **7.1.2** [L262](./src/backend/ordenes/control-ordenes-trabajo.ts#L262).
4. **alt [EN_PROGRESO, con inicio y sin fin]**
   - **7.1.3** [L283–L291](./src/backend/ordenes/control-ordenes-trabajo.ts#L283);
   - **7.1.4** [L300](./src/backend/ordenes/control-ordenes-trabajo.ts#L300);
   - **7.2** botón "Reporte de Campo" en [IU L423](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L423).
5. **alt [sin inicio]** "Debe registrar primero la marca de tiempo de inicio", [L276](./src/backend/ordenes/control-ordenes-trabajo.ts#L276).
6. **alt [fin ya registrado]** [L280](./src/backend/ordenes/control-ordenes-trabajo.ts#L280).

### Bloque 8 · Abrir reporte de campo (8 a 8.2)

1. **8** [IU L130](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L130).
2. **8.1** [IU L139](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L139) hace dos llamadas en paralelo:
   - [actions L241 `obtenerCotizadoOrdenAccion`](./src/app/actions/ordenes-trabajo.ts#L241);
   - [L221 `listarProductosParaConsumoAccion`](./src/app/actions/ordenes-trabajo.ts#L221).
3. **8.2** modal en [IU L551](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L551), con columnas "Cotizado / Usado".

### Bloque 9 · Registrar reporte (9 a 9.2): el núcleo del CU12

1. **9** [IU L215](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L215). Si la cotización tenía materiales y el técnico no reportó ninguno, la IU pide confirmación ([L225](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L225)).
2. **9.1** [IU L233](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L233), luego [actions L201](./src/app/actions/ordenes-trabajo.ts#L201) y [control L316](./src/backend/ordenes/control-ordenes-trabajo.ts#L316). Los datos se validan con Zod en [`schema.ts#L25`](./src/backend/ordenes/schema.ts#L25).
3. **9.1.1** permiso PROCESAR en [actions L208](./src/app/actions/ordenes-trabajo.ts#L208).
4. **9.1.2** [control L327](./src/backend/ordenes/control-ordenes-trabajo.ts#L327).
5. **9.1.3** `consultarOrden` y `validarEstado` / `validarFinRegistrado` en [L331–L353](./src/backend/ordenes/control-ordenes-trabajo.ts#L331).
6. **opt [no se reportaron materiales y no se confirmó]** **9.1.4** [L355–L367](./src/backend/ordenes/control-ordenes-trabajo.ts#L355).
7. **alt [EN_PROGRESO, con fin y materiales registrados o confirmados] — transacción atómica.** Toda la llamada [RPC L372](./src/backend/ordenes/control-ordenes-trabajo.ts#L372) a `fn_procesar_reporte_campo` es **una sola transacción**:
   - Verifica que la llama el servidor: [SQL v2 L43](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L43).
   - Bloquea la orden con `FOR UPDATE`: [L50–L53](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L50).
   - Vuelve a validar estado y asignación: [L59–L82](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L59).
   - **9.1.5 + 9.1.6** Por cada material, en orden fijo para evitar interbloqueos ([L85–L88](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L85)), llama a `fn_kardex_aplicar` ([L95](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L95)). Esa función valida el stock ([cu16 L371](./db/migrations/aplicadas/migracion_cu16_inventario.sql#L371)), lo descuenta ([L378](./db/migrations/aplicadas/migracion_cu16_inventario.sql#L378)) y registra el kárdex ([L381](./db/migrations/aplicadas/migracion_cu16_inventario.sql#L381)).
   - **9.1.7** `detalle_consumo_material`: [L100](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L100).
   - **9.1.8** pasa a FINALIZADA y guarda el diagnóstico: [L116](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L116).
   - **9.1.9** bitácora `FINALIZAR_ORDEN_TRABAJO`: [L124](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L124).
8. **alt [técnico no asignado]** [control L151](./src/backend/ordenes/control-ordenes-trabajo.ts#L151) y [SQL L81](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L81).
9. **alt [orden FINALIZADA]** "La orden ya se encuentra finalizada", [control L342](./src/backend/ordenes/control-ordenes-trabajo.ts#L342).
10. **alt [no está EN_PROGRESO]** "Debe iniciar la labor antes de reportar", [L346](./src/backend/ordenes/control-ordenes-trabajo.ts#L346).
11. **alt [sin marca de fin]** "Primero marque el fin de la labor; después registre el reporte de campo", [L352](./src/backend/ordenes/control-ordenes-trabajo.ts#L352).
12. **alt [cotización con materiales y sin confirmar]** [L363](./src/backend/ordenes/control-ordenes-trabajo.ts#L363).
13. **alt [stock insuficiente]** "Stock insuficiente para «…»: disponible n, solicitado m" en [cu16 L371](./db/migrations/aplicadas/migracion_cu16_inventario.sql#L371). PostgreSQL **revierte todo**: no se descuenta nada ni cambia el estado. El error llega a la IU por [control L380](./src/backend/ordenes/control-ordenes-trabajo.ts#L380).

### Bloque 10 · Ver detalle (10 a 10.2) y opt Liquidar (11)

1. **10** [IU L260](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L260).
2. **10.1** [actions L74](./src/app/actions/ordenes-trabajo.ts#L74).
3. **10.1.3** `calcularHoras` en [L86](./src/app/actions/ordenes-trabajo.ts#L86).
4. **10.2** [IU L489](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L489).
5. **11 / 11.1** enlace a `/liquidacion/{id}` (CU13) en [IU L445](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L445).

## CU12.5 Diferencias entre diagramas y código

| # | Diagrama | Código | Cómo explicarlo |
|---|---|---|---|
| 1 | 9.1.5 a 9.1.9 aparecen como mensajes separados del control | Son **una sola función PL/pgSQL** ([`fn_procesar_reporte_campo`](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L21)) | Así se cumple el RNF11: todo o nada. El diagrama muestra la lógica; la implementación la agrupa en una transacción. |
| 2 | 2.1.2 a 2.1.4 son mensajes del control | También están dentro de una transacción SQL ([`fn_crear_orden_trabajo`](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L17)) | Evita códigos OT duplicados (bloqueo en L65) y que una cotización genere dos órdenes (`FOR UPDATE` en L47). |
| 3 | 1.1.3 `calcularHoras` lo hace el control | En el listado lo calcula la IU ([L401](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L401)); en el detalle lo calcula el servidor ([actions L86](./src/app/actions/ordenes-trabajo.ts#L86)) | Ambos usan la misma función pura `horasEntre`. |
| 4 | El diagrama muestra la bitácora de inicio y fin como pasos del flujo | Se registran **fuera** de la transacción, y solo se escribe en consola si fallan ([L237–L250](./src/backend/ordenes/control-ordenes-trabajo.ts#L237)). Crear y finalizar sí son atómicos con su bitácora | Es la misma decisión de diseño de todo el sistema. |
| 5 | — | El código además permite **cambiar la ventana** de una orden PROGRAMADA y vuelve a validar la cuadrilla ([control L81](./src/backend/ordenes/control-ordenes-trabajo.ts#L81), bitácora `MODIFICAR_VENTANA_ORDEN`) | No aparece en ningún diagrama ni en el documento del CU12; conviene agregarlo como subflujo. |
| 6 | Documento: estado "En Ejecución" | Código: `EN_PROGRESO` ([`estados.ts#L7`](./src/backend/ordenes/estados.ts#L7)) | Los diagramas ya usan `EN_PROGRESO`; solo falta unificar el texto del documento. |
| 7 | RF27: horas "por cada técnico", comparadas con lo programado y lo cotizado | Se calcula **una duración por orden** (inicio real − fin real); solo se compara con las horas cotizadas ([IU L580](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L580)) | Ajustar el RF27 o explicar que todos los técnicos de la cuadrilla comparten la misma marca de inicio y fin. |
| 8 | — | El texto de la IU en [L574](./src/app/ordenes-trabajo/iu-gestionar-ordenes-trabajo.tsx#L574) dice que la mano de obra se liquida "con las horas reales", pero el CU13 cobra el **mayor** entre las horas reales y las cotizadas | Corregir el texto de la pantalla. |
| 9 | — | No se valida que el técnico inicie la labor cerca de la fecha programada: puede iniciarla antes | Si preguntan: la ventana programada sirve para la disponibilidad (CU11); la hora real la marca el técnico en campo. |

## CU12.6 Preguntas probables

- **¿Cómo garantizan que no se descuente stock a medias?**
  - Todo el reporte corre dentro de `fn_procesar_reporte_campo`, que es una transacción de PostgreSQL. Si un material no tiene stock, `RAISE EXCEPTION` revierte todo (RNF11).
  - Además, la orden y cada producto se bloquean con `FOR UPDATE`.
- **¿Cómo evitan que un técnico reporte una orden que no es suya?**
  - Se valida dos veces: en el controlador ([L130](./src/backend/ordenes/control-ordenes-trabajo.ts#L130)) y otra vez dentro de la función SQL ([v2 L68](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L68)).
  - El técnico tampoco puede ver el detalle de órdenes ajenas ([actions L77](./src/app/actions/ordenes-trabajo.ts#L77)).
- **¿Dónde está el «include» con el CU16?**
  - En la llamada a `private.fn_kardex_aplicar` ([v2 L95](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L95)). Es la misma función que usan ventas, compras y ajustes de inventario, con motivo `CONSUMO_OT`.
- **¿Cómo se genera el código OT-2026-001 sin repetirse?**
  - Con `pg_advisory_xact_lock` por año ([L65](./db/migrations/aplicadas/migracion_cu12_crear_orden.sql#L65)) y `MAX + 1` dentro de la misma transacción.
  - Además, `codigo_orden` es `UNIQUE`.
- **¿Por qué "Marcar fin" y "Reporte de campo" son dos pasos?**
  - Para que las horas técnicas reflejen el trabajo real y no el tiempo que el técnico tarda en llenar el formulario. Está documentado en el comentario de [control L349–L350](./src/backend/ordenes/control-ordenes-trabajo.ts#L349).
- **¿El navegador puede llamar directamente a la función SQL?**
  - No. Tiene `REVOKE` para `anon` y `authenticated` y solo se permite a `service_role` ([v2 al final](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L140)).
  - Además, `fn_exigir_llamada_servidor` lo verifica ([L43](./db/migrations/aplicadas/migracion_cu12_reporte_campo_v2.sql#L43)).
- **¿Qué pasa si dos personas cancelan e inician la misma orden al mismo tiempo?**
  - Ambas operaciones incluyen `.eq('estado', 'PROGRAMADA')` en el `UPDATE` ([L170](./src/backend/ordenes/control-ordenes-trabajo.ts#L170) y [L228](./src/backend/ordenes/control-ordenes-trabajo.ts#L228)), así que solo una de las dos gana.

---

## Anexo · Piezas compartidas

| Pieza | Archivo | Para qué |
|---|---|---|
| Sesión del usuario | [`src/lib/auth.ts#L17`](./src/lib/auth.ts#L17) | JWT en cookie httpOnly (CU01) |
| Permisos RBAC | [`src/lib/permisos.ts`](./src/lib/permisos.ts): [`getPermisosDeRol` L57](./src/lib/permisos.ts#L57), [`tieneAccionModulo` L97](./src/lib/permisos.ts#L97), [`exigirPermiso` L107](./src/lib/permisos.ts#L107), [`requerirAccesoModulo` L120](./src/lib/permisos.ts#L120) | Matriz ROL_FUNCION (CU04) |
| Bitácora | [`src/backend/bitacora/service.ts#L21`](./src/backend/bitacora/service.ts#L21) | CU06 |
| IP de origen | [`src/lib/ip.ts#L32`](./src/lib/ip.ts#L32) | Se guarda en la bitácora |
| Cliente de base de datos | [`src/lib/supabase/service.ts#L13`](./src/lib/supabase/service.ts#L13) | Clave de servicio, solo en el servidor |
| Seguridad de la base (RLS) | [`migracion_seguridad_rls.sql`](./db/migrations/aplicadas/migracion_seguridad_rls.sql) | RLS activo sin políticas: el navegador no puede leer ni escribir tablas directamente |
| Fechas en hora de Bolivia | [`src/lib/fechas.ts`](./src/lib/fechas.ts) | `ahoraBolivia`, `ventanaBolivia`, `formatearFechaHora` |
| Lógica de horas y días | [`src/backend/asignaciones/disponibilidad.ts`](./src/backend/asignaciones/disponibilidad.ts) | `parseDiasSemana` (CU10), `horasEntre` (CU12) y `motivosJornada` (CU11) |

**Respuesta corta sobre seguridad (RNF05):** *"La aplicación se conecta solo desde el servidor con la clave de servicio. En la base activamos RLS en todas las tablas y quitamos los permisos a los roles públicos, así que nadie puede consultar la base desde el navegador. Los permisos por rol se validan en el servidor contra la matriz ROL_FUNCION antes de cada operación."*
