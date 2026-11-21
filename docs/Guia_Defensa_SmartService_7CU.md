# Guía de defensa — SmartService (CU07, CU08, CU09, CU14, CU15, CU16, CU17)

Base: código de `SmartService-main.zip` (rama principal ya combinada). Revisado el 15/10/2026.

**Cómo usar esta guía**
- Cada elemento se ubica por **archivo + texto para buscar con Ctrl+F**. Los números de línea cambian al editar, por eso no se usan.
- Lo que dice "**Recomendación:**" es una sugerencia mía. Todo lo demás está tal cual en el código.
- Primero va una **Parte común** con lo que comparten los 7 CU (sesión, permisos, bitácora, IP, base de datos, comandos y errores comunes). Después hay un capítulo por cada CU con las 8 secciones y su chuleta.

**Índice**
- [Parte común](#parte-común-lo-que-comparten-los-7-cu)
- [CU07 — Gestionar Clientes y Establecimientos](#cu07--gestionar-clientes-y-establecimientos)
- [CU08 — Gestionar Cotizaciones](#cu08--gestionar-cotizaciones)
- [CU09 — Ventas y Arqueo/Cierre de Caja](#cu09--ventas-y-arqueocierre-de-caja)
- [CU14 — Proveedores y Catálogo de Mayoristas](#cu14--proveedores-y-catálogo-de-mayoristas)
- [CU15 — Registrar Compras de Equipos e Insumos](#cu15--registrar-compras-de-equipos-e-insumos)
- [CU16 — Inventario y Kárdex](#cu16--inventario-y-kárdex)
- [CU17 — Catálogo de Servicios](#cu17--catálogo-de-servicios)

---

## Parte común (lo que comparten los 7 CU)

### Arquitectura en una frase
La app usa **Next.js** (framework de React que junta pantalla y servidor). Las **pantallas** (`src/app/<módulo>/page.tsx` y sus componentes) llaman a **Server Actions** (`src/app/actions/<módulo>.ts`), que son funciones que corren en el servidor. Estas usan los **servicios/controles** de `src/backend/<módulo>/`, que leen y escriben en **PostgreSQL de Supabase**.

**Términos rápidos**
- **Server Action** (`'use server'`): función que la pantalla llama como si fuera local, pero se ejecuta en el servidor.
- **zod**: librería que valida datos con un "esquema" (`schema.ts`). Si un dato no cumple, devuelve el mensaje escrito en el esquema.
- **Tailwind**: estilos escritos como clases en `className` (p. ej. `bg-lime-400` = fondo verde lima, `rounded-xl` = bordes redondeados grandes).
- **RBAC**: control de acceso por roles. Cada rol tiene permisos guardados en la base de datos.
- **RPC / función PL/pgSQL**: función escrita en SQL dentro de la base de datos. Se llama con `db.rpc('nombre', …)` y corre en una sola transacción (todo o nada).

### Sesión y permisos (3 niveles)

| Nivel | Archivo | Buscar con Ctrl+F | Qué hace |
| --- | --- | --- | --- |
| 1. Sesión | `src/proxy.ts` | `RUTAS_PUBLICAS` | Si no hay cookie `sesion` válida (JWT firmado con `AUTH_SECRET`), redirige a `/login`. Solo `/login` y `/recuperar` son públicas. |
| 2. Permiso de ruta | `src/lib/permisos.ts` | `export async function requerirAccesoModulo` | Lo llama el `layout.tsx` de cada módulo. Sin permiso, redirige a `/?aviso=sin_permiso`. |
| 2. Permiso (acciones) | `src/lib/permisos.ts` | `export async function tienePermisoModulo` | Revisa en la BD (`rol_permiso` ⋈ `permiso`) si el rol del usuario tiene la clave del módulo. |
| 3. Acción fina (CU15, CU16) | `src/backend/compras/autorizacion.ts`, `src/backend/inventario/autorizacion.ts` | `exigirAccesoCompras`, `exigirAccesoInventario` | Además del permiso de ruta, exige la acción concreta (LEER, CREAR, …) en `rol_funcion`. |
| Usuario actual | `src/lib/auth.ts` | `export async function requireUser` | Devuelve el usuario logueado o lanza "No autorizado: inicia sesión para continuar." |

- **Claves de permiso por ruta** (`src/lib/navigation.ts`, buscar `clave: 'CLIENTES'`, etc.): `/clientes`→CLIENTES, `/cotizaciones`→COTIZACIONES, `/ventas`→VENTAS, `/proveedores`→PROVEEDORES, `/compras`→COMPRAS, `/inventario`→INVENTARIO, `/servicios`→SERVICIOS.
- **Quién tiene qué** (`db/seed.sql`, buscar `-- ENCARGADO: módulos operativos`):
  - ADMINISTRADOR tiene todo.
  - ENCARGADO tiene PERFIL, CLIENTES, PROVEEDORES, COMPRAS, INVENTARIO, COTIZACIONES, ORDENES_TRABAJO, CAJA y VENTAS. **No tiene SERVICIOS.**
  - TECNICO tiene PERFIL, COTIZACIONES ("solo lectura" según la descripción) y ORDENES_TRABAJO.
- **Menú lateral y tarjetas del inicio**: `src/lib/navigation.ts`. Ahí están `etiqueta` (texto del menú), `descripcion` y `cu` de cada módulo. Si cambias la etiqueta, cambia el menú.
- **Insignia de la cabecera**: `src/components/page-header-badge.tsx` (`export function PageHeaderBadge`). Muestra `P2: GESTIÓN COMERCIAL, CLIENTES, CATÁLOGO Y VENTAS • CU07 • TÍTULO`. El nombre del paquete sale de `navigation.ts` y los colores son `bg-lime-100 text-lime-700 border-lime-200`.

### Bitácora e IP
- **Tabla**: `bitacora` (`usuario_id`, `fecha_hora` automática, `accion`, `descripcion`, `ip`).
- **Función común**: `src/backend/bitacora/service.ts`, buscar `export async function registrarEvento`. Valida con `registrarEventoSchema` (acción de 1 a 100 caracteres) e inserta.
- **IP de origen**: `src/lib/ip.ts`, buscar `export async function obtenerIpOrigen`. Lee los encabezados `x-forwarded-for`, `x-real-ip`, etc. Si no hay ninguno, usa la IP de la red local del servidor.
- **Quién hizo la acción**: el `id` del usuario sale de la sesión (`requireUser()` / `getCurrentUser()` en `src/lib/auth.ts`), nunca del formulario. Hay una excepción, que se explica en CU08.
- En CU15 y CU16 (ajuste e inventario inicial) la bitácora se escribe **dentro de la función SQL** (`private.fn_registrar_bitacora`), en la misma transacción.

### Base de datos: qué archivo es qué

| Archivo | Para qué | Cuándo tocarlo |
| --- | --- | --- |
| `db/schema.sql` | Crea TODO desde cero (`DROP SCHEMA public CASCADE`): **borra los datos**. | Para reflejar una columna nueva en la instalación desde cero. |
| `db/seed.sql` | Datos iniciales: roles, permisos, matriz RBAC, usuarios. Idempotente (`ON CONFLICT DO NOTHING`). | Para cambiar qué rol ve qué módulo en una instalación nueva. |
| `db/migrations/*.sql` | Cambios incrementales sobre una BD que ya tiene datos. | Para cada cambio de estructura en una BD existente (se ejecuta en Supabase → SQL Editor). |
| `src/lib/supabase/database.types.ts` | Tipos TypeScript de las tablas, **escritos a mano** (no se generan solos). | Después de cada columna nueva, para que TypeScript la reconozca. |
| `src/backend/compras/tipos-bd.ts`, `src/backend/inventario/tipos-bd.ts` | Extensión local de tipos para CU15/CU16 (columnas que aún no están en `database.types.ts`). | Si agregas columnas a `compra`, `producto`, `movimiento_kardex`, etc. |

**Cadena completa para una columna nueva** (vale para cualquier CU):
1. SQL de migración (`ALTER TABLE … ADD COLUMN …`), ejecutado en Supabase SQL Editor. Copiar también a `schema.sql`.
2. `database.types.ts` (o `tipos-bd.ts`): agregar el campo en `Row`, `Insert` y `Update`.
3. `src/backend/<módulo>/schema.ts`: agregar la regla zod.
4. `src/backend/<módulo>/service.ts` (o `control-*.ts`): incluirlo en el `insert`/`update`/`select`.
5. `src/app/actions/<módulo>.ts`: pasarlo del formulario al servicio.
6. Pantalla: agregar el `<input>` y/o la columna en la tabla.

### Comandos (PowerShell, en la carpeta del proyecto)
```powershell
npm.cmd install                 # solo la primera vez o si cambió package.json
npm.cmd run dev                 # inicia el servidor en http://localhost:3000
npx.cmd tsc --noEmit            # comprueba tipos (0 errores = bien)
npm.cmd run lint                # revisa estilo/errores con ESLint
npm.cmd run build               # compilación de producción (detecta errores de todo el proyecto)
```
- Para detener el servidor: `Ctrl + C` en la terminal. Reinícialo si cambias `.env.local`.
- Necesitas `.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `AUTH_SECRET` (ver `.env.example`).
- Usuarios de prueba (`db/seed.sql`, contraseña temporal `Admin1234!`): `gerencia@sgarnet.bo` (ADMINISTRADOR), `administracion@sgarnet.bo` (ENCARGADO), `jperez@sgarnet.bo` (TECNICO). Si alguien ya la cambió, usa la contraseña actual.

### Errores comunes (todos los CU)

| Qué pasa | Señal | Solución |
| --- | --- | --- |
| No guardaste el archivo | El cambio no aparece en la web | `Ctrl+S` y recarga (`F5`). |
| Cambiaste `.env.local` o se colgó el servidor | Errores raros, conexión rechazada | `Ctrl+C` y luego `npm.cmd run dev`. |
| Agregaste una columna en el código pero no en la BD | "column … does not exist" o `Could not find the 'x' column` | Ejecuta la migración en Supabase SQL Editor. |
| Columna en la BD pero no en `database.types.ts` | Subrayado rojo en VS Code o error en `npx.cmd tsc --noEmit` | Agrega el campo en `Row`/`Insert`/`Update`. |
| El rol no tiene el permiso | Te devuelve al inicio con aviso "sin permiso" o "No autorizado: tu rol no tiene el permiso…" | Revisa `/roles` o `rol_permiso` (y `rol_funcion` en CU15/CU16). |
| Editaste un texto que aparece dos veces | Cambió en un lugar pero no en el otro | Busca con `Ctrl+Shift+F` (búsqueda en todo el proyecto). |
| Rompiste una etiqueta JSX (falta `</div>`) | Pantalla roja de error de Next.js | Deshaz con `Ctrl+Z` y edita solo el texto entre etiquetas. |
| La clase Tailwind no existe | El color no cambia | Usa nombres válidos: `bg-blue-500`, `bg-rose-600`, etc. |

---
## CU07 — Gestionar Clientes y Establecimientos

**Actor(es):** Administrador y Encargado (permiso CLIENTES) · **Ruta:** `/clientes`

### 1. Resumen en 5 líneas
1. Registra clientes (persona natural o jurídica) junto con su primer establecimiento, en un asistente de 2 pasos. También permite verlos en una ficha y editarlos.
2. **Pantalla** `src/app/clientes/page.tsx` → paso 1 "Continuar" llama a `validarDocumentoUnico` (el documento no debe estar repetido) → paso 2 "Registrar" llama a `procesarRegistroCliente`.
3. **Acción** `src/app/actions/clientes.ts`: verifica el permiso (`exigirAccesoClientes`) y valida con zod (`registrarClienteCompletoSchema`).
4. **Servicios** `crearCliente` (`backend/clientes/service.ts`) y `crearEstablecimiento` (`backend/establecimientos/service.ts`) → tablas `cliente` y `establecimiento`.
5. **Bitácora** `REGISTRO_CLIENTE` / `ACTUALIZAR_CLIENTE` con IP → la pantalla muestra el mensaje verde y recarga la lista.

### 2. Mapa de archivos

| Archivo | Para qué sirve | Cuándo lo tocaría |
| --- | --- | --- |
| `src/app/clientes/page.tsx` | TODA la pantalla: lista, buscador, asistente de 2 pasos, ficha y modal de edición. | Cualquier cambio visible. |
| `src/app/clientes/layout.tsx` | Protege la ruta: `requerirAccesoModulo('/clientes')`. | Cambiar quién entra (normalmente no se toca). |
| `src/app/actions/clientes.ts` | Server Actions: listar, validar documento, registrar, actualizar, bitácora. | Cambiar flujo, mensajes de respuesta o texto de bitácora. |
| `src/backend/clientes/schema.ts` | Reglas zod: obligatorios, longitudes, correo, latitud/longitud. | Hacer un campo obligatorio, cambiar un máximo o un mensaje. |
| `src/backend/clientes/service.ts` | Consultas a la tabla `cliente` (listar, buscar, verificar documento, crear, actualizar). | Cambiar el orden o la búsqueda en BD. |
| `src/backend/establecimientos/service.ts` / `schema.ts` | Consultas y reglas de `establecimiento`. | Cambiar campos del establecimiento. |
| `src/backend/bitacora/service.ts` | `guardarEventoCliente` → `registrarEvento`. | Casi nunca. |
| `db/migrations/migracion_cu07.sql` | Crea/ajusta `cliente` y `establecimiento` (incluye `telefono_alternativo`). | Agregar una columna. |
| `db/schema.sql` / `db/seed.sql` | Estructura desde cero / datos y permisos iniciales. | Reflejar columnas nuevas / permisos. |
| `src/lib/supabase/database.types.ts` | Tipos de `cliente` (buscar `cliente: {`) y `establecimiento`. | Tras agregar una columna. |

### 3. Mapa de la pantalla (todo en `src/app/clientes/page.tsx` salvo que se indique)

| Elemento | Texto para buscar | Qué cambiar |
| --- | --- | --- |
| Insignia superior | `titulo="GESTIONAR CLIENTES Y ESTABLECIMIENTOS"` | El texto de `titulo` o `cu="CU07"`. |
| Título de la página | `Gestión de Clientes y Establecimientos` | El texto dentro del `<h1>`. |
| Subtítulo | `Registro y consulta del directorio` | El texto del `<p>`. |
| Botón principal | `Registrar Cliente` (el que tiene `+`) | Texto. El color es `bg-lime-400 hover:bg-lime-300`. Ejecuta `seleccionarNuevoCliente`. |
| Mensaje de éxito (verde) | `✓ {mensajeExito}` | Estilo `bg-emerald-50 text-emerald-800`. Se oculta a los 4 s (`setTimeout(() => setMensajeExito(null), 4000)`). |
| Mensaje de error (rojo) | `⚠ {lblMensajeError}` | Estilo `bg-rose-50 text-rose-700`. Se oculta a los 5 s. |
| Pasos del asistente | `1 · Datos del cliente` / `2 · Establecimiento` | Texto de cada paso. El paso activo usa `bg-lime-400`. |
| Campo Tipo de cliente | `Tipo de Cliente *` | Opciones `Persona Natural` / `Persona Jurídica (Empresa)`. Los valores `NATURAL`/`JURIDICO` deben coincidir con `TIPO_CLIENTE` en `schema.ts`. |
| Campo Documento | `Documento de Identidad / NIT` | Placeholder `Ej. 4455667 / 1024567029`. |
| Campo Nombre / Razón social | `Razón Social *` (aparece en el registro y en el modal) | La etiqueta cambia según el tipo. Es `required`. |
| Teléfono / alternativo / correo | `Teléfono Alternativo (opcional)`, `Correo Electrónico` | Correo es `type="email"`, placeholder `cliente@empresa.com`. |
| Botones del paso 1 | `Continuar → Establecimiento`, `Cancelar` | Mientras valida muestra `Validando documento...`. |
| Campos del establecimiento | `Nombre del Establecimiento *`, `Tipo de Inmueble`, `Dirección *`, `Latitud (opcional)`, `Longitud (opcional)` | Las opciones del inmueble (`CASA`, `DEPARTAMENTO`, …) deben coincidir con `TIPO_INMUEBLE` en `schema.ts`. |
| Botones del paso 2 | `← Volver al cliente`, `Registrar Cliente y Establecimiento` | Texto y color. |
| Título de la lista | `Directorio de Clientes` | Texto. Debajo va el contador `cliente{…} disponible{…}`. |
| Buscador | `Buscar por nombre o documento...` | Filtra **en el navegador** (`const clientesFiltrados`) por nombre, documento y razón social. No usa parámetros de URL. |
| Botón de refrescar | `onClick={solicitarModuloClientes}` | Vuelve a cargar la lista desde el servidor. |
| Columnas de la tabla | `<th className="p-4">Cliente</th>` | `ID`, `Cliente`, `Documento`, `Contacto`, `Establecimientos`, `Fecha Registro`, `Acciones`. Si agregas o quitas una, cambia también el `colSpan={7}`. |
| Datos de cada fila | `#{c.id}`, `{c.documento_identidad \|\| "—"}`, `Alt: {c.telefono_alternativo}` | Cada `<td>` usa un campo de `ClienteEntity`. |
| Etiqueta Natural/Jurídico | `const getBadgeTipo` | Jurídico es índigo y Natural es esmeralda. |
| Formato de fecha | `const formatearFechaRegistro` | Muestra `dd/mm/aaaa`. |
| Mensajes de tabla vacía | `Cargando directorio de clientes...`, `No se encontraron clientes que coincidan` | Texto. |
| Acciones de la fila | `👁` (ver ficha) y `title="Editar datos del cliente"` (✏️) | Abren la ficha / el modal. |
| Ficha | `Ficha del Cliente`, `Establecimientos (` | Textos de la ficha lateral. |
| Modal de edición | `Editar Datos del Cliente`, `Guardar Cambios` | Mientras guarda muestra `Guardando...`. El fondo es `bg-slate-900/50`. |
| Estilo de todos los inputs | `const inputClase =` | Una sola línea controla todos los campos (`rounded-xl`, `focus:ring-lime-300/50`). |
| Estilo de todas las etiquetas | `const etiquetaClase =` | `text-xs font-semibold text-slate-600`. |
| Menú lateral | `src/lib/navigation.ts` → `Clientes y Establecimientos (CU07)` | Texto del menú y tarjeta del inicio. |

### 4. Mapa de la lógica

| Si me preguntan dónde está… | Archivo | Buscar | Explicación |
| --- | --- | --- | --- |
| Validación de campos | `src/backend/clientes/schema.ts` | `export const registrarClienteCompletoSchema` | Nombre de 2 a 150 caracteres; documento hasta 30; teléfonos hasta 20; correo válido hasta 100; dirección obligatoria hasta 255; latitud/longitud con formato decimal. Los mensajes están ahí (`'Correo inválido'`, `'Latitud inválida (ej. -17.783333)'`). |
| Validación previa en pantalla | `page.tsx` | `const solicitarEstablecimiento` | Antes de pasar al paso 2 exige nombre y que el documento no exista. |
| Documento único | `backend/clientes/service.ts` | `export async function verificarDocumento` | Busca `documento_identidad` exacto. La BD además tiene `UNIQUE` en esa columna (`migracion_cu07.sql`). |
| Documento al editar | `actions/clientes.ts` | `Ya existe otro cliente registrado` | Permite el mismo documento solo si es del mismo cliente (`existente.id !== formulario.id`). |
| Flujo de registro completo | `actions/clientes.ts` | `export async function procesarRegistroCliente` | Permiso → zod → documento único → cliente → establecimiento → bitácora. |
| Razón social | `actions/clientes.ts` | `formulario.tipoCliente === 'JURIDICO' ? formulario.nombreRazonSocial` | Si es JURIDICO, el nombre también se guarda en `razon_social`; si no, `null`. |
| Permiso | `actions/clientes.ts` | `async function exigirAccesoClientes` | Sin permiso CLIENTES devuelve "No autorizado: tu rol no tiene el permiso del módulo Clientes." |
| Consultas | `backend/clientes/service.ts` | `export async function listarClientes` | Lista ordenada por `id`; `buscarClientes` busca en nombre, documento y correo con `ilike`. |
| Lista con sus establecimientos | `actions/clientes.ts` | `export async function listarClientesAction` | Lee clientes y establecimientos en paralelo y los agrupa por `cliente_id`. |
| Bitácora | `actions/clientes.ts` | `'REGISTRO_CLIENTE'`, `'ACTUALIZAR_CLIENTE'` | Texto "Se registró el cliente … con el establecimiento …". Si falla la bitácora, **no** se cancela el registro (`registrarBitacoraAccion` usa try/catch). |
| IP | `actions/clientes.ts` | `const ip = await obtenerIpOrigen()` | Se guarda en `bitacora.ip`. |
| Traducción de errores | `actions/clientes.ts` | `function mensajeDeError` | Muestra el primer mensaje de zod, o el texto del error. |
| ¿Se eliminan clientes? | `backend/clientes/service.ts` | `export async function eliminarCliente` | La función existe, pero **ninguna pantalla ni acción la usa**. Solo se registra y edita. |
| Fecha de registro | `migracion_cu07.sql` | `fecha_registro DATE NOT NULL DEFAULT CURRENT_DATE` | La pone la BD automáticamente. |

### 5. Modificaciones típicas paso a paso

1. **Cambiar el título.** `page.tsx` → buscar `Gestión de Clientes y Establecimientos` → cambiar el texto → `Ctrl+S` y `F5`. No requiere SQL.
2. **Cambiar el color del botón "Registrar Cliente".** `page.tsx` → buscar `<span className="text-lg leading-none">+</span> Registrar Cliente` → en su `className` cambiar `bg-lime-400 hover:bg-lime-300` por `bg-blue-500 hover:bg-blue-400 text-white`. Comprobar en la web.
3. **Renombrar la columna "Contacto".** `page.tsx` → buscar `<th className="p-4">Contacto</th>` → cambiar el texto.
4. **Quitar la columna "Fecha Registro".**
   1. `page.tsx` → borrar `<th className="p-4 whitespace-nowrap">Fecha Registro</th>`.
   2. Borrar su `<td>` (buscar `{formatearFechaRegistro(c.fecha_registro)}`).
   3. Cambiar los `colSpan={7}` por `colSpan={6}` (aparecen 3 veces).
5. **Cambiar un mensaje de error.** `page.tsx` → buscar `Ingresa el nombre o razón social del cliente.` (aparece 2 veces: registro y edición). Para el de servidor: `schema.ts` → `'El nombre o razón social es obligatorio'`.
6. **Hacer el teléfono obligatorio.**
   1. `schema.ts` → en `registrarClienteCompletoSchema` cambiar `telefono: z.preprocess(vacioANull, z.string().trim().max(20).nullable().optional())` por `telefono: z.string().trim().min(7, 'El teléfono es obligatorio').max(20)`.
   2. `page.tsx` → en el input con `placeholder="Ej. 72010005"` agregar `required` y cambiar la etiqueta a `Teléfono *`.
   3. Hacer lo mismo en `editarClienteFormularioSchema` si también aplica a la edición.
7. **Cambiar la longitud máxima del documento a 20.** `schema.ts` → en `documento:` cambiar `.max(30)` por `.max(20)` (está en los dos esquemas). Opcional: `maxLength={20}` en el input.
8. **Cambiar el orden de la lista (por nombre).** `backend/clientes/service.ts` → en `listarClientes` cambiar `.order('id', { ascending: true })` por `.order('nombre', { ascending: true })`.
9. **Agregar una opción de tipo de inmueble ("TALLER").**
   1. `schema.ts` → agregar `'TALLER',` en `TIPO_INMUEBLE`.
   2. `page.tsx` → agregar `<option value="TALLER">Taller</option>` junto a `<option value="BODEGA">Bodega</option>`.
10. **Cambiar el texto de la bitácora.** `actions/clientes.ts` → buscar `Se registró el cliente` → editar el template. Comprobar en `/bitacora`.
11. **Ocultar el botón Editar al Encargado.** Hoy no hay reglas por rol dentro de la pantalla. **Recomendación:** en `listarClientesAction` devolver también `esAdmin` (con `requireUser()` → `usuario.rol.nombre === 'ADMINISTRADOR'`; verifica el nombre exacto del campo en `src/lib/auth.ts`). En `page.tsx`, envolver el botón ✏️ con `{esAdmin && (…)}` y **además** rechazar en `procesarActualizacionCliente` si no es admin. Ocultarlo en la pantalla no basta por seguridad.
12. **Agregar la columna `nit_facturacion` (cadena completa).**
   1. SQL (Supabase → SQL Editor + copiar a `schema.sql`): `ALTER TABLE public.cliente ADD COLUMN IF NOT EXISTS nit_facturacion VARCHAR(30);`
   2. `database.types.ts` → en `cliente: {` agregar `nit_facturacion: string | null` en `Row`, y `nit_facturacion?: string | null` en `Insert` y `Update`.
   3. `schema.ts` → agregar `nitFacturacion: z.preprocess(vacioANull, z.string().trim().max(30).nullable().optional()),` en `registrarClienteCompletoSchema` (y `nit_facturacion` en `crearClienteSchema`).
   4. `actions/clientes.ts` → en `registrarClienteBD({ … })` dentro de `procesarRegistroCliente` agregar `nit_facturacion: formulario.nitFacturacion ?? null,`. En `aEntidadCliente` y en el tipo `ClienteEntity`, agregar el campo si quieres mostrarlo.
   5. `page.tsx` → un `useState`, un `<input>` y enviarlo en `procesarRegistroCliente({ … })`.
   6. Comprobar con `npx.cmd tsc --noEmit` y registrando un cliente.

### 6. Preguntas probables
1. **¿Dónde se valida que el documento no se repita?** En la pantalla, al pasar al paso 2 (`validarDocumentoUnico`). En el servidor otra vez con `verificarDocumento` (`actions/clientes.ts`). La BD tiene `UNIQUE` como última barrera.
2. **¿Por qué se valida dos veces?** La pantalla avisa rápido, pero el servidor es el que manda: alguien podría saltarse la pantalla.
3. **¿Dónde se guardan cliente y establecimiento?** Tablas `cliente` y `establecimiento`, con `crearCliente` y `crearEstablecimiento`. Se relacionan por `establecimiento.cliente_id`.
4. **¿Qué pasa si el usuario no tiene permiso?** El `layout.tsx` lo redirige al inicio con `aviso=sin_permiso`. Si llama la acción directo, recibe "No autorizado: tu rol no tiene el permiso del módulo Clientes."
5. **¿Cómo sabe el sistema quién registró?** `exigirAccesoClientes()` devuelve `requireUser()`, y su `id` va a `bitacora.usuario_id`.
6. **¿Qué se guarda en la bitácora?** Acción `REGISTRO_CLIENTE` o `ACTUALIZAR_CLIENTE`, una descripción con nombre, tipo y establecimiento, la IP y la fecha/hora.
7. **¿Por qué no se elimina un cliente?** El CU solo registra y edita. `eliminarCliente` existe en el servicio pero no está conectado. Borrar rompería las cotizaciones y ventas que lo referencian.
8. **¿Qué pasa si falla el establecimiento después de crear el cliente?** Son dos inserciones separadas, sin transacción. El cliente quedaría creado. **Recomendación:** mencionarlo como mejora (mover a una función SQL transaccional).
9. **¿Dónde se valida el correo?** `schema.ts`: `.email('Correo inválido')`. El input también es `type="email"`.
10. **¿Cómo funciona el buscador?** Filtra en el navegador la lista ya cargada (`clientesFiltrados`), por nombre, documento o razón social.
11. **¿Diferencia entre schema.sql y una migración?** `schema.sql` borra y crea todo desde cero. La migración solo agrega cambios sobre una BD con datos.
12. **¿Qué es NATURAL/JURIDICO?** Una convención de la app (`TIPO_CLIENTE` en `schema.ts`). La BD no tiene CHECK para eso.
13. **¿Dónde se pone la fecha de registro?** La BD, con `DEFAULT CURRENT_DATE`.

### 7. Errores comunes de este CU
- Cambiaste las opciones del `<select>` pero no `TIPO_CLIENTE` / `TIPO_INMUEBLE` → error zod "Invalid option". Cambia ambos lados.
- Quitaste una columna y no ajustaste `colSpan={7}` → las filas de "Cargando…" o "No se encontraron…" se ven desalineadas.
- Cambiaste un texto en el registro pero no en el modal de edición (hay campos duplicados) → busca con `Ctrl+F` todas las coincidencias.
- Latitud con coma (`-17,78`) → "Latitud inválida". Debe usarse punto.

### 8. Prueba rápida en el navegador
1. `npm.cmd run dev` y entra a `http://localhost:3000/login` como ENCARGADO o ADMINISTRADOR.
2. Menú **Clientes y Establecimientos (CU07)**: debe verse "Directorio de Clientes".
3. Clic en **+ Registrar Cliente** → elige Persona Jurídica → la etiqueta cambia a "Razón Social *".
4. Escribe un documento que ya existe → **Continuar** → mensaje rojo "Ya existe un cliente con el documento …".
5. Cambia a un documento nuevo → Continuar → paso 2.
6. Escribe latitud `abc` → Registrar → error "Latitud inválida". Corrige con `-17.783333`.
7. Registrar → mensaje verde y el cliente aparece en la tabla con su establecimiento.
8. Busca por su documento en el buscador → solo aparece ese cliente.
9. Clic en ✏️ → cambia el teléfono → Guardar Cambios → mensaje verde.
10. Entra a `/bitacora` como admin → aparecen `REGISTRO_CLIENTE` y `ACTUALIZAR_CLIENTE` con tu IP.

### Chuleta CU07
1. Pantalla única: `src/app/clientes/page.tsx`. Lógica: `src/app/actions/clientes.ts`.
2. Reglas de campos: `src/backend/clientes/schema.ts` → `registrarClienteCompletoSchema`.
3. Flujo: `procesarRegistroCliente` = permiso → zod → documento único → cliente → establecimiento → bitácora.
4. Documento único en 3 capas: pantalla, servidor y `UNIQUE` en la BD.
5. Permiso: `exigirAccesoClientes` + `layout.tsx` (`requerirAccesoModulo('/clientes')`).
6. Bitácora: `REGISTRO_CLIENTE` / `ACTUALIZAR_CLIENTE` con IP (`obtenerIpOrigen`).
7. Estilos de todos los inputs: `const inputClase`. Color principal: `bg-lime-400`.
8. El buscador filtra en el navegador (`clientesFiltrados`).
9. No hay eliminación: solo registro y edición.
10. Columna nueva: SQL → `database.types.ts` → `schema.ts` → action → page.

---
## CU08 — Gestionar Cotizaciones

**Actor(es):** según `db/seed.sql`, Administrador y Encargado tienen COTIZACIONES; el Técnico también la tiene, descrita como "solo lectura" · **Rutas:** `/cotizaciones`, `/cotizaciones/nuevo`, `/cotizaciones/editar/[id]`, `/cotizaciones/pdf/[id]`

> ⚠️ **Lo primero que debes saber (visto en el código):** este CU es el que tiene más puntos débiles. Si el docente los encuentra, mejor que ya los conozcas:
> 1. **No hay `layout.tsx` en `src/app/cotizaciones/`.** Solo protege la sesión (`src/proxy.ts`). Cualquier usuario logueado entra, aunque no tenga el permiso COTIZACIONES.
> 2. **Las acciones de `src/app/actions/cotizaciones.ts` no revisan permisos**: no llaman a `tienePermisoModulo`.
> 3. **El usuario está fijo**: en `nuevo/page.tsx` y `editar/[id]/page.tsx` se envía `usuario_id: 1`. Toda cotización y su bitácora quedan a nombre del usuario 1.
> 4. **La tarifa del servicio no se lee bien**: `nuevo/page.tsx` usa `serv.tarifa_por_hora` y `editar/[id]/page.tsx` usa `serv.precio_base`. La columna real es `precio_hora_base` (tabla `servicio`), así que siempre cae al valor por defecto **70 Bs/hora**.
> 5. **No se valida con zod**: `src/backend/cotizaciones/schema.ts` y `service.ts` existen, pero las acciones no los usan; escriben directo con `supabase.from(...)`.
>
> En la sección 5 están los arreglos (cambios 9 a 12).

### 1. Resumen en 5 líneas
1. Arma una proforma para un cliente y uno de sus establecimientos, con **equipos** (productos) y **servicios** (horas de mano de obra). Luego permite aprobarla o rechazarla, editarla, eliminarla e imprimirla.
2. **Pantalla** `nuevo/page.tsx` → "Guardar y Emitir Cotización" llama a `crearCotizacionCompletaAccion`.
3. **Acción** `src/app/actions/cotizaciones.ts`: genera el correlativo `COT-AAAA-NNNN` (`generarSiguienteNumeroCotizacionAccion`, reintenta hasta 5 veces si choca) y calcula el vencimiento a hoy + 15 días.
4. **BD**: `cotizacion` (cabecera, estado PENDIENTE) + `detalle_cotizacion_producto` + `detalle_cotizacion_servicio`.
5. **Bitácora** `CREAR_COTIZACION` con IP → `alert()` con el mensaje → vuelve al listado.

### 2. Mapa de archivos

| Archivo | Para qué sirve | Cuándo lo tocaría |
| --- | --- | --- |
| `src/app/cotizaciones/page.tsx` | Listado con cambio de estado, Ver PDF, Editar, Eliminar. | Columnas, colores de estado, botones. |
| `src/app/cotizaciones/nuevo/page.tsx` | Formulario de nueva cotización (cliente, catálogo de equipos y servicios, resumen). | Textos, cálculo de precios, validaciones de la pantalla. |
| `src/app/cotizaciones/editar/[id]/page.tsx` | Modificar una proforma existente (incluye estado). | Igual que el anterior, para edición. |
| `src/app/cotizaciones/pdf/[id]/page.tsx` | Vista imprimible (`window.print()`). | Cabecera, tablas y textos del PDF. |
| `src/app/actions/cotizaciones.ts` | TODA la lógica: consultas, correlativo, crear, actualizar, cambiar estado, eliminar, bitácora. | Casi cualquier cambio de lógica. |
| `src/backend/cotizaciones/schema.ts`, `types.ts`, `service.ts` | Esquema zod, estados (`ESTADO_COTIZACION`) y un servicio alternativo. **No los usan las acciones.** | Si se quiere agregar validación real. |
| `db/schema.sql` | Tablas `cotizacion`, `detalle_cotizacion_producto` y `detalle_cotizacion_servicio` (buscar `CREATE TABLE COTIZACION`). Los detalles tienen `ON DELETE CASCADE`. | Columnas nuevas. |
| `src/lib/supabase/database.types.ts` | Tipos de `cotizacion` y sus detalles. | Tras agregar una columna. |
| `src/lib/navigation.ts` | Menú `Cotizaciones (CU08)`. | Texto del menú. |

### 3. Mapa de la pantalla

| Elemento | Archivo | Texto para buscar | Qué cambiar |
| --- | --- | --- | --- |
| Insignia (fija, no usa `PageHeaderBadge`) | `page.tsx` | `P2: GESTIÓN COMERCIAL · CU08 · ELABORAR COTIZACIONES` | El texto. Colores `bg-[#eefccb] text-[#558a06]` (verde claro y oscuro en hexadecimal). |
| Título | `page.tsx` | `Gestión de Cotizaciones y Proformas` | Texto del `<h1>`. |
| Botón nueva | `page.tsx` | `+ Nueva Cotización` | Es un enlace (`<Link>`) con `href="/cotizaciones/nuevo"`. Color `bg-[#9fe82e] hover:bg-[#8be01c]`. |
| Columnas | `page.tsx` | `<th className="py-3 px-4">Nro. Cotización</th>` | `Nro. Cotización`, `Cliente`, `Fecha Emisión`, `Vencimiento`, `Total (Bs.)`, `Estado`, `Acciones / Gestión`. Si cambias cuántas son, ajusta `colSpan={7}`. |
| Datos de la fila | `page.tsx` | `{cot.numero_cotizacion}`, `cot.cliente?.nombre`, `Bs. {Number(cot.total).toFixed(2)}` | Total en azul (`text-blue-600`). Las fechas se muestran tal como vienen de la BD (aaaa-mm-dd). |
| Selector de estado | `page.tsx` | `<option value="APROBADA">APROBADA</option>` | Al cambiarlo pide `confirm(...)` y llama a `handleCambiarEstado`. Colores: verde (APROBADA), rojo (RECHAZADA), ámbar (PENDIENTE). |
| Botones de fila | `page.tsx` | `📄 Ver PDF`, `/cotizaciones/editar/` (botón Editar), `handleEliminar(cot.id` (botón Eliminar) | Ver PDF abre una pestaña nueva (`target="_blank"`). Eliminar pide confirmación. |
| Mensajes del listado | `page.tsx` | `Cargando cotizaciones...`, `No hay cotizaciones registradas aún`, `Estado actualizado con éxito.`, `Cotización eliminada.` | Son `alert()` del navegador, no avisos en la página. |
| Insignia de nueva | `nuevo/page.tsx` | `CU08 · ELABORAR COTIZACIONES (NUEVA PROPUESTA)` | Texto. |
| Título de nueva | `nuevo/page.tsx` | `Emitir Nueva Cotización` | Texto. Enlace `← Volver al listado`. |
| Sección 1 | `nuevo/page.tsx` | `1. Datos del Cliente y Establecimiento` | Selects `Cliente` (muestra `nombre (documento)`) y `Establecimiento / Sucursal`. Al elegir cliente se cargan sus establecimientos. |
| Sección 2 | `nuevo/page.tsx` | `2. Catálogo de Equipos y Materiales` | Tarjetas con imagen, nombre, precio de venta y botón `+ Agregar` (`bg-gray-900`). |
| Sección 3 | `nuevo/page.tsx` | `3. Servicios Técnicos / Mano de Obra` | Muestra `Bs. … / hora` (con el error de tarifa explicado arriba). |
| Resumen | `nuevo/page.tsx` | `Resumen de Proforma`, `Ningún equipo agregado.`, `Subtotal Equipos:`, `Total General:` | Botones − / + para cantidad u horas, y quitar. |
| Botón guardar | `nuevo/page.tsx` | `Guardar y Emitir Cotización` | Mientras guarda muestra `Generando Cotización...`. |
| Mensajes de nueva | `nuevo/page.tsx` | `Por favor selecciona un cliente y un establecimiento.`, `No se puede guardar una cotización sin equipos ni servicios.` | Son `alert()`. |
| Pantalla de edición | `editar/[id]/page.tsx` | `Modificar Proforma:`, `Detalle Actualizado`, `Guardar Cambios de Cotización` | Incluye un selector de estado. |
| PDF: cabecera | `pdf/[id]/page.tsx` | `SmartService · Proforma Comercial`, `Cotización: {cotizacion.numero_cotizacion}` | Texto y logo/nombre. |
| PDF: datos | `pdf/[id]/page.tsx` | `<b>Cliente:</b>`, `<b>Sucursal / Establecimiento:</b>`, `<b>Estado Actual:</b>` | Etiquetas en negrita. |
| PDF: tablas | `pdf/[id]/page.tsx` | `1. Equipos y Materiales`, `Tarifa / Hora (Bs.)` | Columnas Descripción / Cantidad / P. Unitario / Subtotal. |
| PDF: botones | `pdf/[id]/page.tsx` | `🖨️ Imprimir / Guardar PDF`, `Cerrar pestaña` | Se ocultan al imprimir (`print:hidden`). |
| PDF: estilos de impresión | `pdf/[id]/page.tsx` | `@media print` | Solo imprime `#print-area`. |

### 4. Mapa de la lógica (`src/app/actions/cotizaciones.ts` salvo que se indique)

| Si me preguntan dónde está… | Buscar | Explicación |
| --- | --- | --- |
| Correlativo COT-2026-0001 | `export async function generarSiguienteNumeroCotizacionAccion` | Lee los números del año con `like 'COT-AAAA-%'`, toma el mayor + 1 y lo rellena a 4 dígitos (`padStart(4, '0')`). |
| Reintento si se repite | `const maxIntentos = 5` | Si el INSERT da error `23505` (clave única repetida), prueba el siguiente número. |
| Fechas | `const fechaVencimiento = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)` | Vencimiento = hoy + 15 días; emisión = hoy. |
| Estado inicial | `estado: 'PENDIENTE'` | Toda cotización nueva nace PENDIENTE. Los estados válidos están en `ESTADO_COTIZACION` (`backend/cotizaciones/types.ts`), pero la acción no los valida. |
| Precio de venta de un equipo | `nuevo/page.tsx` → `const precioVenta = prod.precio_compra_actual * (1 + (prod.margen_ganancia / 100))` | Costo + margen %. Se calcula en el navegador. |
| Totales | `nuevo/page.tsx` → `const totalGeneral = totalProductos + totalServicios` | Suma cantidad × precio y horas × tarifa. **También se calcula en el navegador** y el servidor guarda lo que llega. |
| Validaciones | `nuevo/page.tsx` → `const handleGuardarCotizacion` | Solo exige cliente + establecimiento y al menos un ítem. En el servidor no hay zod. |
| Consultas | `export async function obtenerCotizacionesAccion` | `cotizacion` + nombre del cliente, de la más nueva a la más vieja (`order('id', { ascending: false })`). |
| Detalle para el PDF | `export async function obtenerCotizacionPorIdAccion` | Lee la cabecera, el cliente, el establecimiento (o el primero del cliente si no tiene) y los dos detalles con su producto o servicio. |
| Editar | `export async function actualizarCotizacionCompletaAccion` | Actualiza la cabecera, **borra todos los detalles** y los vuelve a insertar. |
| Cambiar estado | `export async function cambiarEstadoCotizacionAccion` | `update({ estado })`. Aquí el usuario de la bitácora sí sale de `getCurrentUser()` (con `\|\| 1` como respaldo). |
| Eliminar | `export async function eliminarCotizacionAccion` | Borrado físico (`delete`). Los detalles caen por `ON DELETE CASCADE`. En `venta.cotizacion_id` la relación es `ON DELETE SET NULL`. |
| Bitácora | `accion: 'CREAR_COTIZACION'`, `'ACTUALIZAR_COTIZACION'`, `'CAMBIAR_ESTADO_COTIZACION'`, `'ELIMINAR_COTIZACION'` | Inserta directo en `bitacora` con `ip` de `obtenerIpOrigen()`. |
| Permisos | — | Ninguno dentro del módulo. Solo hay sesión (`src/proxy.ts`). Ver el aviso del inicio. |
| Errores | `return { success: false, message: error.message }` | Muestra el mensaje técnico de la BD en un `alert`. No hay traducción a lenguaje de usuario. |

### 5. Modificaciones típicas paso a paso
1. **Cambiar el título.** `page.tsx` → `Gestión de Cotizaciones y Proformas` → nuevo texto → `Ctrl+S`, `F5`.
2. **Cambiar el color del botón "+ Nueva Cotización".** `page.tsx` → en su `className` cambiar `bg-[#9fe82e] hover:bg-[#8be01c]` por `bg-blue-600 hover:bg-blue-500 text-white`.
3. **Renombrar la columna "Vencimiento" a "Válida hasta".** `page.tsx` → `<th className="py-3 px-4">Vencimiento</th>`.
4. **Cambiar los días de vigencia (15 → 30).** `actions/cotizaciones.ts` → en `crearCotizacionCompletaAccion` cambiar `15 * 24 * 60 * 60 * 1000` por `30 * 24 * 60 * 60 * 1000`. Comprobar creando una cotización.
5. **Cambiar el prefijo del correlativo (COT → PRO).** `actions/cotizaciones.ts` → en `generarSiguienteNumeroCotizacionAccion` cambiar `` `COT-${anioActual}-` `` y la expresión `/COT-\d{4}-(\d+)/i`.
6. **Agregar el estado "VENCIDA".**
   1. `page.tsx` y `editar/[id]/page.tsx`: agregar `<option value="VENCIDA">VENCIDA</option>`.
   2. `backend/cotizaciones/types.ts`: agregar `'VENCIDA'` en `ESTADO_COTIZACION`.
   3. Opcional: un color en la condición `cot.estado === 'APROBADA' ? …`.
7. **Cambiar un mensaje.** `nuevo/page.tsx` → `No se puede guardar una cotización sin equipos ni servicios.`
8. **Mostrar las fechas como dd/mm/aaaa.** `page.tsx` → reemplazar `{cot.fecha_emision}` por `{cot.fecha_emision?.split('-').reverse().join('/')}` (igual con `fecha_vencimiento`).
9. **Arreglar la tarifa de servicios (recomendado antes de la defensa).**
   - `nuevo/page.tsx`: cambiar las 2 apariciones de `serv.tarifa_por_hora` por `serv.precio_hora_base`.
   - `editar/[id]/page.tsx`: cambiar `serv.precio_base` por `serv.precio_hora_base`.
   - Comprobar que el precio por hora coincide con `/servicios`.
10. **Usar el usuario real en vez de `usuario_id: 1`.**
    1. `actions/cotizaciones.ts` → al inicio de `crearCotizacionCompletaAccion` y `actualizarCotizacionCompletaAccion` agregar `const u = await requireUser()` (importar de `@/lib/auth`).
    2. Usar `u.id` en lugar de `formData.usuario_id` en el insert y en la bitácora.
    3. En las páginas, dejar de enviar `usuario_id: 1` (o ignorarlo).
11. **Proteger el módulo con permisos.**
    1. Crear `src/app/cotizaciones/layout.tsx` copiando `src/app/servicios/layout.tsx` y cambiando `'/servicios'` por `'/cotizaciones'`.
    2. En cada acción de escritura de `actions/cotizaciones.ts` agregar `if (!(await tienePermisoModulo('/cotizaciones'))) return { success: false, message: 'No autorizado' }` (importar de `@/lib/permisos`).
    3. Probar entrando con un rol sin el permiso.
12. **Agregar la columna `observaciones` (cadena completa).**
    1. SQL: `ALTER TABLE public.cotizacion ADD COLUMN IF NOT EXISTS observaciones TEXT;` (Supabase SQL Editor + `schema.sql`).
    2. `database.types.ts` → en `cotizacion: {` agregar `observaciones: string | null` (Row) y `observaciones?: string | null` (Insert/Update).
    3. `backend/cotizaciones/schema.ts` (opcional, si validas): `observaciones: z.string().max(500).nullable().optional()`.
    4. `actions/cotizaciones.ts` → agregar `observaciones: string` al tipo de `formData` y `observaciones: formData.observaciones || null` en el `.insert({...})`.
    5. `nuevo/page.tsx` → `useState`, un `<textarea>` en "Resumen de Proforma" y enviarlo en `crearCotizacionCompletaAccion({...})`.
    6. `pdf/[id]/page.tsx` → mostrar `{cotizacion.observaciones}`.

### 6. Preguntas probables
1. **¿Cómo se genera el número de cotización?** `generarSiguienteNumeroCotizacionAccion`: busca el mayor número del año y suma 1. Si dos personas guardan a la vez, la columna `numero_cotizacion` es única y el código reintenta hasta 5 veces.
2. **¿Dónde se calcula el total?** En el navegador (`nuevo/page.tsx`, `totalGeneral`). El servidor guarda el total recibido. **Recomendación:** recalcularlo en el servidor.
3. **¿Cómo se calcula el precio de un equipo?** `precio_compra_actual × (1 + margen_ganancia/100)`, en `agregarProducto`.
4. **¿De dónde sale la tarifa del servicio?** Debería salir de `servicio.precio_hora_base` (CU17). Hoy el código lee un campo que no existe y usa 70 Bs por defecto (ver aviso y cambio 9).
5. **¿Qué pasa al eliminar?** Se borra la cabecera y los detalles caen en cascada. Si una venta la referenciaba, queda con `cotizacion_id = NULL`. Se registra `ELIMINAR_COTIZACION`.
6. **¿Por qué al editar se borran los detalles?** Es la forma simple de sincronizar: borrar todos y volver a insertar los actuales.
7. **¿Qué estados hay?** PENDIENTE (al crear), APROBADA y RECHAZADA, en `ESTADO_COTIZACION` y en los `<option>`.
8. **¿Quién puede entrar?** Cualquiera con sesión, porque no hay `layout.tsx` ni chequeo en las acciones. El seed sí asigna COTIZACIONES a los 3 roles. Arreglo: cambio 11.
9. **¿Cómo sabe quién hizo la cotización?** Hoy se envía `usuario_id: 1` desde la pantalla. Solo el cambio de estado y la eliminación usan `getCurrentUser()`. Arreglo: cambio 10.
10. **¿Cuándo vence?** A los 15 días de emitida (`fechaVencimiento`).
11. **¿Cómo se genera el PDF?** No es un PDF real del servidor: la página `pdf/[id]` usa `window.print()` y CSS `@media print`. El navegador permite "Guardar como PDF".
12. **¿Qué se guarda en bitácora?** CREAR, ACTUALIZAR, CAMBIAR_ESTADO y ELIMINAR_COTIZACION, con descripción, IP y fecha.
13. **¿Qué tablas usa?** `cotizacion`, `detalle_cotizacion_producto`, `detalle_cotizacion_servicio`; lee `cliente`, `establecimiento`, `producto` (+ `imagen_producto`) y `servicio`.

### 7. Errores comunes de este CU
- Cambiaste el nombre de un estado en un solo archivo → el selector muestra un valor vacío. Revisa `page.tsx`, `editar/[id]/page.tsx` y `ESTADO_COTIZACION`.
- El cliente no tiene establecimientos → aparece "Sin establecimientos registrados" y no deja guardar. Registra uno en CU07.
- Servicios siempre a 70 Bs → es el problema de `tarifa_por_hora` (cambio 9).
- Error `23505` en la consola → choque de correlativo; el código lo reintenta solo.
- Productos o servicios inactivos aparecen en el catálogo → `obtenerProductosConImagen` y `obtenerServiciosTecnicosAccion` no filtran por estado. **Recomendación:** agregar `.eq('estado', true)` / `.eq('activo', true)`.

### 8. Prueba rápida en el navegador
1. `npm.cmd run dev` e inicia sesión.
2. Ve a `/cotizaciones` → "Gestión de Cotizaciones y Proformas".
3. **+ Nueva Cotización** → elige un cliente: se cargan sus establecimientos.
4. Agrega 2 equipos y 1 servicio; usa + y − para cambiar cantidades y horas.
5. Verifica que **Total General** = Subtotal Equipos + Subtotal Servicios.
6. **Guardar y Emitir Cotización** → alerta "Cotización COT-2026-00XX creada con éxito." → vuelve al listado.
7. Cambia el estado a APROBADA → confirma → el color pasa a verde.
8. **📄 Ver PDF** → revisa datos y tablas → **Imprimir / Guardar PDF**.
9. **Editar** → quita un ítem → Guardar Cambios → el total se actualiza.
10. `/bitacora` → CREAR, CAMBIAR_ESTADO y ACTUALIZAR_COTIZACION.

### Chuleta CU08
1. Lógica entera en `src/app/actions/cotizaciones.ts`. Pantallas: listado, `nuevo`, `editar/[id]`, `pdf/[id]`.
2. Correlativo `COT-AAAA-NNNN` en `generarSiguienteNumeroCotizacionAccion`, con 5 reintentos.
3. Nace PENDIENTE y vence a 15 días.
4. Precio de equipo = costo × (1 + margen%); total calculado en la pantalla.
5. Editar = actualizar cabecera + borrar y reinsertar detalles.
6. Eliminar = borrado físico; los detalles caen por CASCADE.
7. Bitácora: CREAR / ACTUALIZAR / CAMBIAR_ESTADO / ELIMINAR_COTIZACION.
8. PDF = `window.print()` + `@media print`.
9. Puntos débiles: sin `layout.tsx`, sin permisos en acciones, `usuario_id: 1` y tarifa leída de un campo inexistente.
10. Arreglos: cambios 9, 10 y 11 de la sección 5.

---
## CU09 — Ventas y Arqueo/Cierre de Caja

**Actor(es):** Administrador y Encargado (permiso VENTAS). "Turnos cerrados" solo lo ve el Administrador · **Ruta:** `/ventas`

### 1. Resumen en 5 líneas
1. El cajero **abre un turno** con un fondo inicial, **vende** en mostrador (con descuento, efectivo/QR y nota de venta en PDF), puede **anular** una venta y al final hace el **arqueo y cierre**: cuenta el efectivo y el sistema calcula si sobra o falta.
2. **Pantalla** `src/app/ventas/page.tsx` + modal `arqueo-modal.tsx` → `abrirCaja(monto)` / `obtenerResumenArqueo()` / `cerrarCaja({ montoReal, observacion })`.
3. **Acción** `src/app/actions/ventas.ts`: toma el usuario de la sesión (`contexto()`) y la IP. **Validación** zod en `src/backend/ventas/schema.ts` (`aperturaCajaSchema`, `cierreCajaSchema`).
4. **Servicio** `src/backend/ventas/service.ts` → `procesarAperturaOArqueo`. La apertura inserta en `caja`; el cierre llama a la función SQL `fn_cerrar_caja`, que calcula el esperado y la diferencia y cierra en una transacción.
5. **Bitácora** `APERTURA_CAJA`, `REGISTRO_VENTA`, `ANULAR_VENTA`, `ARQUEO_CAJA` con IP → aviso flotante (toast) y tarjeta "Turno cerrado" con la diferencia.

### 2. Mapa de archivos

| Archivo | Para qué sirve | Cuándo lo tocaría |
| --- | --- | --- |
| `src/app/ventas/page.tsx` | Pantalla principal: cabecera, estado de caja, KPIs, ventas del turno, turnos cerrados, anulación, toasts. | Textos, KPIs, columnas de turnos, botones. |
| `src/app/ventas/arqueo-modal.tsx` | Ventana de **apertura** y de **arqueo/cierre** (incluye el conteo por billetes). | Textos del arqueo, denominaciones, reglas de la observación. |
| `src/app/ventas/ventas-form.tsx` | Formulario "Nueva venta" (productos, cliente, pago, descuento, QR, nota PDF). | Cambios en el registro de ventas. |
| `src/app/ventas/layout.tsx` | `requerirAccesoModulo('/ventas')`. | Acceso. |
| `src/app/actions/ventas.ts` | Server Actions: `obtenerDatosVentas`, `abrirCaja`, `obtenerResumenArqueo`, `cerrarCaja`, `registrarVenta`, `anularVenta`, `listarTurnosCerrados`, `descargarNotaVenta`. | Mensajes de éxito, reglas de rol. |
| `src/backend/ventas/service.ts` | Lógica: caja, resumen, ventas, anulación, PDF, bitácora (`guardarEventoCaja`), traducción de errores (`errorBD`). | Reglas y consultas. |
| `src/backend/ventas/schema.ts` | Zod: montos, observación ≤ 500, ítems, pago, comprobante. | Mensajes y límites. |
| `src/backend/ventas/types.ts` | Tipos y listas fijas: `TIPOS_PAGO`, `TIPOS_COMPROBANTE`, `AccionCaja`. | Agregar un método de pago. |
| `db/migrations/migration_ventas_proveedores.sql` | Agrega `caja.monto_diferencia`, `caja.observacion`, `venta.tipo_pago`, el índice `ux_caja_usuario_abierta` y las funciones `fn_registrar_venta`, `fn_anular_venta` y `fn_cerrar_caja`. | Cambiar la regla del cierre o de la venta. |
| `db/schema.sql` | Tablas `caja`, `venta`, `detalle_venta`. | Columnas nuevas. |
| `src/lib/supabase/database.types.ts` | Tipos (buscar `caja: {`). | Tras agregar una columna. |

### 3. Mapa de la pantalla

| Elemento | Archivo | Texto para buscar | Qué cambiar |
| --- | --- | --- | --- |
| Antetítulo (no usa `PageHeaderBadge`) | `page.tsx` | `CU09 · Comercial` | Texto. |
| Título | `page.tsx` | `Ventas en mostrador` | Texto del `<h1>`. |
| Píldora de caja abierta | `page.tsx` | `abierta · {fecha(caja.fecha_apertura, true)}` | Texto "Caja #N abierta · hora". Verde `bg-[#8cd600]/15` con punto que parpadea (`animate-pulse`). |
| Píldora de caja cerrada | `page.tsx` | `Caja cerrada` | Gris (`bg-slate-200`). |
| Botón Turnos cerrados | `page.tsx` | `'Ocultar turnos' : 'Turnos cerrados'` | Solo aparece si `datos?.usuario.esAdmin`. |
| Botón Abrir caja | `page.tsx` | `onClick={() => setModal('apertura')}` (hay 2: cabecera y aviso sin caja) | Verde `bg-[#8cd600] hover:bg-[#73b800]`. Abre el modal en modo apertura. |
| Botón Arqueo y cierre | `page.tsx` | `Arqueo y cierre` | Negro `bg-slate-900`. Abre el modal en modo cierre. |
| Tarjetas KPI | `page.tsx` | `<Kpi titulo="Fondo inicial"` | `Fondo inicial`, `Ventas del turno`, `Total vendido`, `Efectivo esperado` (resaltada con `acento`). Estilo en `function Kpi`. |
| Aviso sin caja | `page.tsx` | `Debe abrir un turno de caja antes de vender` | Texto (también está en `SIN_CAJA:` dentro de `MENSAJES` del servicio y en `ventas-form.tsx`). |
| Lista de ventas | `page.tsx` | `Ventas del turno`, `Aún no hay ventas en este turno.` | Etiqueta roja `ANULADA` para las anuladas. |
| Tabla de turnos | `page.tsx` | `<th className="py-2 pr-4">Caja</th>` | Columnas `Caja`, `Usuario`, `Apertura`, `Cierre`, `Esperado`, `Contado`, `Diferencia`. |
| Diferencia con color | `page.tsx` | `function Diferencia` | Verde "Cuadrada"; ámbar si sobra (+); rojo si falta (−). |
| Modal anular | `page.tsx` | `¿Anular {porAnular.nro_comprobante}?` | Texto de confirmación. |
| Toast (aviso flotante) | `page.tsx` | `toast.tipo === 'ok' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'` | Colores. Dura 4,5 s (`setTimeout(() => setToast(null), 4500)`). |
| Títulos del modal | `arqueo-modal.tsx` | `'Abrir turno de caja' : cerrada ? 'Turno cerrado' : 'Arqueo y cierre de caja'` | Los tres títulos. |
| Resumen del arqueo | `arqueo-modal.tsx` | `etiqueta="Fondo inicial"`, `etiqueta="Ventas en efectivo"`, `etiqueta="Efectivo esperado en caja"` | Más los mini cuadros `QR`, `Tarjeta`, `Transf.`. |
| Campo de monto | `arqueo-modal.tsx` | `'Fondo inicial en efectivo (Bs)' : 'Efectivo contado (Bs)'` | Etiqueta según el modo; placeholder `0.00`. Acepta coma o punto (`parseDecimal`). |
| Conteo por billetes | `arqueo-modal.tsx` | `const DENOMINACIONES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1]` | Lista de billetes y monedas. El botón alterna `Contar por billetes` / `Ingresar monto directo`. |
| Diferencia en vivo | `arqueo-modal.tsx` | `'Caja cuadrada' : diferencia > 0 ? 'Sobrante' : 'Faltante'` | Verde, ámbar o rojo. |
| Observación | `arqueo-modal.tsx` | `'Explique el motivo de la diferencia' : 'Notas del turno'` | Lleva asterisco rojo si hay diferencia. `maxLength={500}`. |
| Botones del modal | `arqueo-modal.tsx` | `'Abrir caja' : 'Cerrar caja'`, `Cancelar` | Apertura en verde; cierre en negro. |
| Resultado del cierre | `arqueo-modal.tsx` | `Diferencia de arqueo`, `etiqueta="Efectivo contado"` | Tarjeta final con esperado, contado y observación. |
| Formulario de venta | `ventas-form.tsx` | `Nueva venta`, `Tipo de comprobante`, `Método de pago`, `Descuento (Bs)`, `Efectivo recibido (opcional)` | Campos de la venta. |
| Menú | `src/lib/navigation.ts` | `Ventas y Caja (CU09)` | Texto del menú. |

### 4. Mapa de la lógica

| Si me preguntan dónde está… | Archivo | Buscar | Explicación |
| --- | --- | --- | --- |
| Validación del fondo y del contado | `backend/ventas/schema.ts` | `const monto = (campo: string)` | Número ≥ 0, máximo 9 999 999 999.99, redondeado a 2 decimales. Mensajes tipo "El fondo inicial no puede ser negativo". |
| Observación obligatoria si hay diferencia | `arqueo-modal.tsx` + migración | `Hay diferencia en el arqueo: describa el motivo` | La pantalla exige ≥ 5 caracteres y `fn_cerrar_caja` lo vuelve a exigir (`length(COALESCE(v_obs, '')) < 5`). |
| Una sola caja abierta por usuario | `backend/ventas/service.ts` | `if (await verificarCajaAbierta(db, cajaDTO.usuarioId)) throw new VentaError(MENSAJES.CAJA_DUPLICADA)` | Además lo garantiza el índice único `ux_caja_usuario_abierta` en la BD. |
| Apertura | `backend/ventas/service.ts` | `if (cajaDTO.tipo === 'APERTURA')` | Inserta `caja` con `estado: 'ABIERTA'` y registra `APERTURA_CAJA`. |
| Cálculo del esperado | `migration_ventas_proveedores.sql` | `v_esperado   := v_caja.monto_inicial + v_efectivo` | Esperado = fondo inicial + ventas EMITIDAS en EFECTIVO (no cuenta QR, tarjeta ni anuladas). |
| Diferencia | `migration_ventas_proveedores.sql` | `v_diferencia := v_real - v_esperado` | Positivo = sobrante; negativo = faltante; 0 = cuadrada. |
| Cierre | `migration_ventas_proveedores.sql` | `estado              = 'CERRADA'` | Guarda `fecha_cierre`, `monto_final_sistema`, `monto_final_real`, `monto_diferencia` y `observacion`. Bloquea la fila (`FOR UPDATE`) para evitar dos cierres a la vez. |
| No cerrar la caja de otro | `migration_ventas_proveedores.sql` | `No tiene permiso para cerrar la caja de otro usuario` | Lo valida la función SQL. |
| Resumen antes del conteo | `backend/ventas/service.ts` | `export function resumirCaja` | Totales por método de pago, cantidad de ventas y anuladas, efectivo esperado (misma regla que la BD). |
| Quién hace la acción | `actions/ventas.ts` | `async function contexto()` | Usuario de la sesión (`getCurrentUser`), si es admin (`/admin/i.test(rol)`) y la IP. |
| Turnos solo para admin | `actions/ventas.ts` | `Solo el Administrador puede consultar los turnos cerrados` | Se valida en el servidor, no solo se oculta el botón. |
| Permisos | `src/app/ventas/layout.tsx` | `requerirAccesoModulo('/ventas')` | Las acciones no vuelven a llamar a `tienePermisoModulo`; exigen sesión con `contexto()`. |
| Bitácora | `backend/ventas/service.ts` | `export async function guardarEventoCaja` | Acciones `APERTURA_CAJA`, `REGISTRO_VENTA`, `ANULAR_VENTA`, `ARQUEO_CAJA`. Si falla, no deshace la operación. El texto del arqueo dice "esperado, contado, diferencia (cuadrada/sobrante/faltante)". |
| Traducción de errores | `backend/ventas/service.ts` | `function errorBD` | `ux_caja_usuario_abierta` → "El usuario ya tiene una caja abierta"; errores `P0001` de las funciones SQL se muestran tal cual; si falta la migración, avisa. |
| Venta y anulación | `backend/ventas/service.ts` | `fn_registrar_venta`, `fn_anular_venta` | Transacciones en la BD que descuentan o devuelven stock (kárdex, CU16). |

### 5. Modificaciones típicas paso a paso
1. **Cambiar el título.** `page.tsx` → `Ventas en mostrador` → nuevo texto.
2. **Cambiar el color del botón "Arqueo y cierre".** `page.tsx` → buscar `Arqueo y cierre` → en el `className` del botón (justo arriba), cambiar `bg-slate-900 … hover:bg-slate-800` por `bg-indigo-600 … hover:bg-indigo-500`.
3. **Renombrar el KPI "Efectivo esperado".** `page.tsx` → `<Kpi titulo="Efectivo esperado"` → cambiar el texto.
4. **Renombrar la columna "Contado" de turnos.** `page.tsx` → `<th className="py-2 pr-4 text-right">Contado</th>`.
5. **Cambiar el mensaje de observación obligatoria.** `arqueo-modal.tsx` → `Hay diferencia en el arqueo: describa el motivo en la observación`. El de la BD está en la migración (`Hay diferencia en el arqueo: registre una observación`).
6. **Pedir observación siempre, aunque cuadre.**
   1. `arqueo-modal.tsx` → cambiar `const requiereObs = diferencia !== null && diferencia !== 0;` por `const requiereObs = diferencia !== null;`.
   2. Para que también lo exija el servidor: en la migración cambiar `IF v_diferencia <> 0 AND length(COALESCE(v_obs, '')) < 5 THEN` por `IF length(COALESCE(v_obs, '')) < 5` y volver a ejecutar el `CREATE OR REPLACE FUNCTION public.fn_cerrar_caja` en Supabase.
7. **Quitar la moneda de 0.10 del conteo.** `arqueo-modal.tsx` → quitar `0.1` de `DENOMINACIONES`.
8. **Cambiar el máximo de la observación (500 → 300).** `schema.ts` → `.max(500, { message: 'La observación no puede superar 500 caracteres' })`. También en `arqueo-modal.tsx` → `maxLength={500}`.
9. **Mostrar "Turnos cerrados" también al Encargado.**
   1. `page.tsx` → quitar la condición `{datos?.usuario.esAdmin && (` que envuelve el botón (y su cierre `)}`).
   2. `actions/ventas.ts` → en `listarTurnosCerrados` quitar `if (!esAdmin) return …`.
10. **Cambiar el texto de la bitácora del cierre.** `backend/ventas/service.ts` → buscar `` `Cierre de caja #${caja.id}: esperado `` → editar.
11. **Contar QR también en el esperado** (cambio de regla de negocio).
    1. Migración → en `fn_cerrar_caja` cambiar `AND COALESCE(tipo_pago, 'EFECTIVO') = 'EFECTIVO'` por `AND COALESCE(tipo_pago, 'EFECTIVO') IN ('EFECTIVO','QR')`, y ejecutar la función en Supabase.
    2. `backend/ventas/service.ts` → en `resumirCaja` cambiar `efectivo_esperado: r2(caja.monto_inicial + totales.EFECTIVO)` por `… + totales.EFECTIVO + totales.QR)`, para que pantalla y BD coincidan.
12. **Agregar la columna `turno` (MAÑANA/TARDE) a la caja (cadena completa).**
    1. SQL: `ALTER TABLE public.caja ADD COLUMN IF NOT EXISTS turno VARCHAR(10);` (+ `schema.sql`).
    2. `database.types.ts` → en `caja: {` agregar `turno: string | null` en Row, `turno?: string | null` en Insert/Update. En `backend/ventas/types.ts` agregar `turno` al tipo `Caja` y en la función que mapea la fila (`mapCaja`).
    3. `schema.ts` → en `aperturaCajaSchema` agregar `turno: z.enum(['MAÑANA','TARDE'])`.
    4. `service.ts` → en el `.insert({ usuario_id: …, monto_inicial: …, estado: 'ABIERTA' })` agregar `turno`.
    5. `actions/ventas.ts` → `abrirCaja` recibe y pasa `turno`.
    6. `arqueo-modal.tsx` → un `<select>` en modo apertura; `page.tsx` → mostrarlo en la píldora o en los turnos.

### 6. Preguntas probables
1. **¿Cómo se calcula el efectivo esperado?** Fondo inicial + ventas EMITIDAS en EFECTIVO del turno. Está en `fn_cerrar_caja` y se repite en `resumirCaja` para mostrarlo antes de cerrar.
2. **¿Qué es la diferencia?** Contado − esperado: + sobrante, − faltante, 0 cuadrada. La calcula la BD.
3. **¿Por qué el cierre está en una función SQL?** Para hacerlo en una transacción y con bloqueo (`FOR UPDATE`): nadie puede vender ni cerrar a la vez y no quedan datos a medias.
4. **¿Puedo tener dos cajas abiertas?** No: lo revisa `verificarCajaAbierta` y lo garantiza el índice único `ux_caja_usuario_abierta`.
5. **¿Puedo cerrar la caja de otro?** No: `fn_cerrar_caja` lanza "No tiene permiso para cerrar la caja de otro usuario".
6. **¿Cuándo es obligatoria la observación?** Cuando la diferencia no es 0: mínimo 5 caracteres, en la pantalla y en la BD.
7. **¿Cómo sabe quién abrió o cerró?** `contexto()` en `actions/ventas.ts` lee el usuario de la sesión, nunca de un parámetro.
8. **¿Qué se guarda en la bitácora?** APERTURA_CAJA (con fondo), REGISTRO_VENTA, ANULAR_VENTA y ARQUEO_CAJA (esperado, contado, diferencia, cantidad de ventas y total), con IP.
9. **¿Qué pasa con una venta anulada?** `fn_anular_venta` la marca ANULADA y devuelve el stock. No cuenta para el esperado ni para el total.
10. **¿Quién ve los turnos cerrados?** Solo el Administrador: el botón se oculta y además el servidor lo rechaza.
11. **¿Por qué hay un conteo por billetes?** Ayuda al arqueo físico: multiplica cada denominación por su cantidad (`totalConteo`).
12. **¿Qué tablas usa?** `caja`, `venta`, `detalle_venta`, `producto`/`movimiento_kardex` (vía las funciones) y `bitacora`.

### 7. Errores comunes de este CU
- "Falta instalar las funciones de ventas en la base de datos…" → no se ejecutó `migration_ventas_proveedores.sql` o `.env.local` apunta a otro proyecto de Supabase.
- Cambiaste la regla en `resumirCaja` pero no en `fn_cerrar_caja` (o al revés) → el esperado del modal no coincide con el del cierre. Cambia ambos.
- Editaste la función SQL en el archivo pero no la ejecutaste en Supabase → no cambia nada. Hay que correr el `CREATE OR REPLACE FUNCTION`.
- "El usuario ya tiene una caja abierta" → cierra primero el turno anterior.

### 8. Prueba rápida en el navegador
1. `npm.cmd run dev` y entra como ENCARGADO (`administracion@sgarnet.bo`).
2. `/ventas` → debe decir "Caja cerrada" y "Debe abrir un turno de caja antes de vender".
3. **Abrir caja** → fondo `100` → aviso "Caja #N abierta con Bs 100,00" (formato es-BO).
4. Registra una venta en EFECTIVO de, por ejemplo, Bs 50 y otra por QR.
5. Revisa los KPIs: Efectivo esperado = 150 (no suma el QR).
6. **Arqueo y cierre** → el resumen muestra Fondo 100, Ventas en efectivo 50, Esperado 150.
7. Escribe `140` → aparece "Faltante −10". Intenta cerrar sin observación → error.
8. Escribe una observación de 5+ letras → **Cerrar caja** → tarjeta "Turno cerrado" con la diferencia.
9. Entra como ADMINISTRADOR → **Turnos cerrados** → aparece el turno con −10 en rojo.
10. `/bitacora` → APERTURA_CAJA, REGISTRO_VENTA y ARQUEO_CAJA con IP.

### Chuleta CU09
1. Pantalla `ventas/page.tsx`; modal `ventas/arqueo-modal.tsx`; lógica `backend/ventas/service.ts`.
2. Apertura: `abrirCaja` → `procesarAperturaOArqueo` (APERTURA) → `caja` ABIERTA.
3. Cierre: `cerrarCaja` → `fn_cerrar_caja` (transacción + `FOR UPDATE`).
4. Esperado = fondo inicial + ventas EMITIDAS en EFECTIVO.
5. Diferencia = contado − esperado (+ sobrante / − faltante).
6. Observación obligatoria (≥ 5) si hay diferencia, en pantalla y en BD.
7. Una caja abierta por usuario: `verificarCajaAbierta` + índice `ux_caja_usuario_abierta`.
8. Usuario e IP salen de `contexto()`, nunca del formulario.
9. Bitácora: APERTURA_CAJA, REGISTRO_VENTA, ANULAR_VENTA, ARQUEO_CAJA.
10. Turnos cerrados: solo Administrador (pantalla + servidor).

---
## CU14 — Proveedores y Catálogo de Mayoristas

**Actor(es):** Administrador y Encargado (permiso PROVEEDORES) · **Ruta:** `/proveedores`

### 1. Resumen en 5 líneas
1. Registra, edita y activa o desactiva proveedores (baja lógica, con NIT único). Mantiene el **catálogo del mayorista**: qué productos del inventario vende cada proveedor, con su código de ítem y precio de compra. Además **compara precios** entre proveedores.
2. **Pantalla** `src/app/proveedores/page.tsx` + componentes de `proveedores-form.tsx` (`ProveedoresForm`, `CatalogoProveedor`, `ComparadorPrecios`).
3. **Acción** `src/app/actions/proveedores.ts`: usuario e IP de la sesión (`contexto()`). **Validación** zod en `src/backend/proveedores/schema.ts` (`proveedorSchema`, `itemCatalogoSchema`).
4. **Servicio** `src/backend/proveedores/service.ts` → tablas `proveedor` y `producto_proveedor` (lee `producto`).
5. **Bitácora** (`registrarEventoProveedor`): CREAR, ACTUALIZAR, ACTIVAR y DESACTIVAR_PROVEEDOR; VINCULAR, ACTUALIZAR_PRECIO y QUITAR_PRODUCTO_PROVEEDOR → toast en pantalla.

### 2. Mapa de archivos

| Archivo | Para qué sirve | Cuándo lo tocaría |
| --- | --- | --- |
| `src/app/proveedores/page.tsx` | Cabecera, KPIs, buscador, lista de proveedores, ficha con pestañas, botón Desactivar/Reactivar, toasts. | Textos, KPIs, filtros, orden. |
| `src/app/proveedores/proveedores-form.tsx` | Modal del proveedor (`ProveedoresForm`), catálogo (`CatalogoProveedor`) y comparador (`ComparadorPrecios`). | Campos, validación en pantalla, columnas del catálogo. |
| `src/app/proveedores/layout.tsx` | `requerirAccesoModulo('/proveedores')`. | Acceso. |
| `src/app/actions/proveedores.ts` | Server Actions (listar, verificar NIT, registrar, actualizar, cambiar estado, catálogo, comparar). | Mensajes de éxito. |
| `src/backend/proveedores/schema.ts` | Reglas: NIT (3–30, letras/números/guiones), razón social (3–200), teléfono, correo, precio. | Validaciones y mensajes. |
| `src/backend/proveedores/service.ts` | Consultas, NIT único, catálogo, comparación, bitácora, traducción de errores (`errorBD`). | Reglas y consultas. |
| `src/backend/proveedores/types.ts` | Tipos y lista `AccionProveedor` (acciones de bitácora). | Agregar una acción nueva de bitácora. |
| `db/migrations/migration_ventas_proveedores.sql` | Agrega `proveedor.direccion`, `proveedor.estado` y `producto_proveedor.fecha_actualizacion`. | Columnas nuevas. |
| `db/schema.sql` | Tablas `proveedor` y `producto_proveedor` (`UNIQUE (producto_id, proveedor_id)`). | Estructura. |

### 3. Mapa de la pantalla

| Elemento | Archivo | Texto para buscar | Qué cambiar |
| --- | --- | --- | --- |
| Antetítulo (no usa `PageHeaderBadge`) | `page.tsx` | `CU14 · Abastecimiento` | Texto. |
| Título y subtítulo | `page.tsx` | `Proveedores y catálogo de mayoristas`, `Registra distribuidores y los productos` | Textos. |
| Botón nuevo | `page.tsx` | `Nuevo proveedor` | Usa la clase compartida `btnPrimario` (verde `bg-[#8cd600]`). |
| Estilo de botones/inputs | `page.tsx` | `const btnPrimario`, `const inputCls` | Cambian TODOS los botones primarios e inputs de la página. |
| KPIs | `page.tsx` | `<Kpi titulo="Proveedores activos"` | `Proveedores activos`, `Inactivos`, `Productos en inventario`. |
| Buscador | `page.tsx` | `Buscar por razón social, NIT o contacto` | Filtra en el navegador (`const visibles = useMemo`). No usa URL. |
| Ver inactivos | `page.tsx` | `Mostrar inactivos` | Checkbox; por defecto oculta los inactivos. |
| Sin resultados | `page.tsx` | `Ningún proveedor coincide con`, `Aún no hay proveedores registrados.` | Textos. |
| Ficha vacía | `page.tsx` | `Seleccione un proveedor` | Texto cuando no hay ninguno elegido. |
| Botones de la ficha | `page.tsx` | `seleccionado.estado ? 'Desactivar' : 'Reactivar'`, `Editar` | Desactivar pide `confirm("¿Desactivar a …? Dejará de estar disponible para nuevas compras.")`. |
| Pestañas | `page.tsx` | `['catalogo', 'Catálogo del mayorista']`, `['datos', 'Datos de contacto']` | Nombres de pestañas. |
| Datos de contacto | `page.tsx` | `etiqueta="Persona de contacto"` | Más `Teléfono`, `Correo`, `Dirección`; vacío = `No registrado`. |
| Etiqueta de estado | `page.tsx` | `>Activo<` / `>Inactivo<` | Verde / gris. |
| Toast | `page.tsx` | `Proveedor "${p.razon_social}" registrado` | Aviso tras guardar. |
| Modal del proveedor | `proveedores-form.tsx` | `'Nuevo proveedor' : 'Editar proveedor'` | Título del modal. |
| Campos | `proveedores-form.tsx` | `etiqueta="Razón social"`, `etiqueta="NIT"`, `etiqueta="Persona de contacto"`, `etiqueta="Correo electrónico"`, `etiqueta="Dirección"` | Placeholders: `Distribuidora Andina S.R.L.`, `NIT-PROV-001 o 1023456789`, `+591 70000000`, `ventas@proveedor.com`. `maxLength` 200/30/150/30/150/255. |
| Ayuda del NIT | `proveedores-form.tsx` | `'Verificando…' : 'Letras, números y guiones'` | Al salir del campo verifica si el NIT existe (`comprobarNit`). |
| Botón guardar | `proveedores-form.tsx` | `'Registrar proveedor' : 'Guardar cambios'` | Texto. |
| Errores en pantalla | `proveedores-form.tsx` | `function validar(v: ProveedorDTO)` | `Mínimo 3 caracteres`, `El NIT es obligatorio`, `Correo inválido`, `Teléfono inválido`. |
| Agregar al catálogo | `proveedores-form.tsx` | `Agregar producto del inventario` | Select de producto, `Código del proveedor`, `Precio compra`, botón `Agregar`. |
| Columnas del catálogo | `proveedores-form.tsx` | `<span className="col-span-4">Producto</span>` | `Producto`, `Código proveedor`, `Precio compra`, `Actualizado`, `Acciones`. |
| Quitar ítem | `proveedores-form.tsx` | `del catálogo de ${proveedor.razon_social}?` | Confirmación. |
| Comparador | `proveedores-form.tsx` | `Comparar precios`, `Mejor precio`, `Precio en inventario`, `Ahorro vs. el más caro` | Tarjetas del comparativo. |
| Menú | `src/lib/navigation.ts` | `Proveedores y Mayoristas (CU14)` | Texto. |

### 4. Mapa de la lógica

| Si me preguntan dónde está… | Archivo | Buscar | Explicación |
| --- | --- | --- | --- |
| Validación del proveedor | `backend/proveedores/schema.ts` | `export const proveedorSchema` | Razón social 3–200; NIT obligatorio, 3–30, solo letras, números y guiones (`NIT_REGEX`); teléfono 6–30 dígitos/+/()/-; correo con formato y en minúsculas. |
| NIT único | `backend/proveedores/service.ts` | `export async function verificarNitExistente` | Busca con `ilike`, es decir sin distinguir mayúsculas. Al editar excluye el propio id. |
| Registrar | `service.ts` | `export async function registrarProveedor` | Valida → NIT único → inserta con `estado: true` → bitácora `CREAR_PROVEEDOR`. |
| Editar con detalle de cambios | `service.ts` | `export async function actualizarProveedor` | Compara antes/después y escribe en la bitácora, por ejemplo `nit: "A" → "B"`. |
| Baja lógica | `service.ts` | `export async function cambiarEstadoProveedor` | Cambia `estado` a true/false; no borra. Conserva el historial de compras. |
| Regla de catálogo | `service.ts` | `El proveedor está inactivo: reactívelo para modificar su catálogo` | No se agregan, editan ni quitan ítems a un proveedor inactivo. |
| Producto repetido / código repetido | `service.ts` | `Ese producto ya está en el catálogo de este proveedor`, `async function codigoRepetido` | El código de ítem no puede repetirse dentro del mismo proveedor. |
| Comparar precios | `service.ts` | `export async function compararPreciosProducto` | Ofertas de todos los proveedores; la mejor se calcula **solo entre activos** (`es_mejor`) y se ordena de más barato a más caro. |
| Permisos | `src/app/proveedores/layout.tsx` | `requerirAccesoModulo('/proveedores')` | Las acciones exigen sesión (`contexto()`), no vuelven a revisar el permiso. |
| Quién y desde dónde | `actions/proveedores.ts` | `async function contexto()` | `usuarioId` de la sesión + `ip` de `obtenerIpOrigen()`. |
| Bitácora | `service.ts` | `export async function registrarEventoProveedor` | Inserta en `bitacora` con `ip`. Si falla, no deshace la operación (solo lo escribe en la consola). |
| Traducción de errores | `service.ts` | `function errorBD` | `23505` (duplicado) → "Ya existe un proveedor con ese NIT", etc.; `23514` (CHECK) → NIT o precio inválido. |
| Tolerancia a columnas faltantes | `service.ts` | `async function escribir` | Si la BD aún no tiene `direccion`, `estado` o `fecha_actualizacion`, reintenta sin esa columna. |

### 5. Modificaciones típicas paso a paso
1. **Cambiar el título.** `page.tsx` → `Proveedores y catálogo de mayoristas`.
2. **Cambiar el color de todos los botones primarios.** `page.tsx` → `const btnPrimario` → cambiar `bg-[#8cd600] … hover:bg-[#73b800]` por `bg-blue-600 … hover:bg-blue-500 text-white`. Ojo: `proveedores-form.tsx` también tiene su propia `btnPrimario`; busca allí también.
3. **Renombrar la pestaña "Datos de contacto".** `page.tsx` → `['datos', 'Datos de contacto']`.
4. **Renombrar la columna "Actualizado" del catálogo.** `proveedores-form.tsx` → `<span className="col-span-1">Actualizado</span>`.
5. **Cambiar el mensaje del NIT repetido.** `service.ts` → `Ya existe un proveedor con ese NIT` (aparece 2 veces) y `proveedores-form.tsx` → `'Ya existe un proveedor con ese NIT'`.
6. **Hacer obligatorio el teléfono.**
   1. `schema.ts` → en `proveedorSchema`, cambiar `telefono: z.preprocess(aTexto, z.string().regex(TELEFONO_REGEX, { message: 'Teléfono inválido' }).nullable()),` por `telefono: z.preprocess(aTexto, z.string({ message: 'El teléfono es obligatorio' }).regex(TELEFONO_REGEX, { message: 'Teléfono inválido' }))`.
   2. `proveedores-form.tsx` → en `function validar` agregar `if (!v.telefono?.trim()) e.telefono = 'El teléfono es obligatorio'`, y en `<Campo etiqueta="Teléfono"` agregar `requerido`.
7. **Cambiar el mínimo de la razón social a 5.** `schema.ts` → `v.length >= 3` y el mensaje; `proveedores-form.tsx` → `.length < 3) e.razon_social = 'Mínimo 3 caracteres'`.
8. **Mostrar los inactivos por defecto.** `page.tsx` → buscar `useState(false)` de `verInactivos` (`const [verInactivos, setVerInactivos]`) y cambiar a `useState(true)`.
9. **Ordenar la lista por NIT.** `service.ts` → en `obtenerListaProveedores` cambiar `.order('razon_social')`. En `page.tsx` → en `reemplazar` cambiar `a.razon_social.localeCompare(b.razon_social)`.
10. **Ocultar "Desactivar" al Encargado.** No hay control por rol en esta pantalla. **Recomendación:** que `listarProveedoresAction` devuelva también si el usuario es admin (como hace `contexto()` en `actions/ventas.ts` con `esAdmin`), mostrar el botón solo si lo es, y rechazar en `cambiarEstadoProveedorAction` si no lo es.
11. **Cambiar el texto de bitácora al desactivar.** `service.ts` → `` `Proveedor #${id} "${proveedor.razon_social}" ${activo ? 'reactivado' : 'desactivado'}` ``.
12. **Agregar la columna `sitio_web` (cadena completa).**
    1. SQL: `ALTER TABLE public.proveedor ADD COLUMN IF NOT EXISTS sitio_web VARCHAR(200);` (+ `schema.sql`).
    2. `database.types.ts` → `proveedor: {` Row/Insert/Update.
    3. `types.ts` → agregar `sitio_web` en `Proveedor`, `ProveedorDTO` y `ProveedorValidado`.
    4. `schema.ts` → `sitio_web: opcional(200, 'El sitio web no puede superar 200 caracteres'),` en `proveedorSchema`.
    5. `service.ts` → agregarlo en `function mapProveedor` y en la lista `cambios` de `actualizarProveedor`. `SELECT_PROVEEDOR` usa `*`, así que ya lo trae.
    6. `proveedores-form.tsx` → un `<Campo etiqueta="Sitio web">` con su input. `page.tsx` → `<Dato etiqueta="Sitio web" valor={seleccionado.sitio_web} />`.

### 6. Preguntas probables
1. **¿Dónde se valida el NIT?** En la pantalla (`validar`, `comprobarNit`), en el servidor (`proveedorSchema` + `verificarNitExistente`) y en la BD (restricciones `UNIQUE`/`CHECK`, traducidas en `errorBD`).
2. **¿Por qué no se elimina un proveedor?** Es baja lógica (`estado = false`) para conservar su historial de compras y su catálogo.
3. **¿Qué pasa si desactivo un proveedor?** Deja de aparecer en CU15 (`listarProveedoresActivos`), no se puede tocar su catálogo y no cuenta como "mejor precio".
4. **¿Qué es el catálogo del mayorista?** La tabla `producto_proveedor`: une producto y proveedor con `precio_compra` y `codigo_item_proveedor`.
5. **¿Cómo se calcula la mejor oferta?** `compararPreciosProducto`: mínimo `precio_compra` entre proveedores activos; `diferencia` = precio − mejor.
6. **¿Se actualiza el precio del catálogo solo?** Sí: al registrar una compra (CU15), `fn_registrar_compra` actualiza el precio pactado.
7. **¿Quién registró el cambio?** `contexto()` saca `usuarioId` de la sesión; se guarda en `bitacora.usuario_id` con la IP.
8. **¿Qué acciones van a bitácora?** CREAR/ACTUALIZAR/ACTIVAR/DESACTIVAR_PROVEEDOR, VINCULAR_PRODUCTO_PROVEEDOR, ACTUALIZAR_PRECIO_PROVEEDOR y QUITAR_PRODUCTO_PROVEEDOR.
9. **¿El NIT distingue mayúsculas?** No: se compara con `ilike`.
10. **¿Qué pasa si no tengo permiso?** El layout te redirige al inicio con `aviso=sin_permiso`.
11. **¿Qué pasa si la BD no tiene la columna `estado`?** `escribir` la omite. Al cambiar el estado, avisa "Falta la columna proveedor.estado: ejecute el script SQL del CU14".
12. **¿Diferencia entre `precio_compra` del catálogo y `precio_compra_actual` del producto?** El primero es el precio pactado con un proveedor; el segundo es el último costo general del producto (lo actualiza CU15).

### 7. Errores comunes de este CU
- Cambias `btnPrimario` en `page.tsx` y los botones del modal no cambian → hay otra definición en `proveedores-form.tsx`.
- "Ese código de ítem ya está registrado para este proveedor" → el código ya se usa en ese mismo proveedor (sí puede repetirse entre proveedores distintos).
- "El proveedor está inactivo…" al tocar el catálogo → primero Reactivar.
- Agregaste un campo al formulario pero no a `mapProveedor` → se guarda, pero no aparece al recargar.

### 8. Prueba rápida en el navegador
1. Entra como ENCARGADO → menú **Proveedores y Mayoristas (CU14)**.
2. **+ Nuevo proveedor** → NIT `ab cd` → error de formato en rojo.
3. NIT de un proveedor existente → al salir del campo: "Ya existe un proveedor con ese NIT".
4. Datos válidos → Registrar proveedor → toast verde y el proveedor aparece en la lista.
5. Selecciónalo → pestaña **Catálogo del mayorista** → agrega un producto con código y precio.
6. Edita el precio del ítem → se actualiza "Actualizado".
7. Abajo, en **Comparar precios** → elige el producto → muestra Mejor precio y Ahorro.
8. **Desactivar** → confirma → pasa a "Inactivo" y desaparece si no marcas "Mostrar inactivos".
9. Intenta agregar un ítem estando inactivo → error "El proveedor está inactivo…".
10. `/bitacora` (admin) → CREAR_PROVEEDOR, VINCULAR_PRODUCTO_PROVEEDOR, DESACTIVAR_PROVEEDOR.

### Chuleta CU14
1. Pantalla `proveedores/page.tsx`; formularios en `proveedores-form.tsx` (3 componentes).
2. Reglas en `backend/proveedores/schema.ts`; lógica en `service.ts`.
3. NIT: 3–30 caracteres, letras/números/guiones, único sin distinguir mayúsculas.
4. Baja lógica con `estado`; un proveedor inactivo no compra ni edita catálogo.
5. Catálogo = `producto_proveedor` (precio + código, único por producto y proveedor).
6. Mejor precio solo entre activos (`compararPreciosProducto`).
7. Usuario e IP desde `contexto()`.
8. Bitácora con 7 acciones (`AccionProveedor` en `types.ts`).
9. Errores de BD traducidos en `errorBD` (23505, 23514).
10. CU15 usa este catálogo y actualiza su precio.

---
## CU15 — Registrar Compras de Equipos e Insumos

**Actor(es):** Administrador y Encargado (permiso COMPRAS + acciones LEER y CREAR sobre "Compras" en `rol_funcion`). El Técnico no tiene acceso · **Rutas:** `/compras`, `/compras/nueva`, `/compras/[compraId]`

### 1. Resumen en 5 líneas
1. Registra una compra a un proveedor **activo**, con documento (FACTURA o NOTA, número único por proveedor) y de 1 a 100 líneas de productos **del catálogo de ese proveedor** (CU14). Cada compra **sube el stock** y deja un movimiento en el kárdex (CU16).
2. **Pantalla** `compras/nueva/formulario-compra.tsx` → "Revisar y registrar" → modal "¿Registrar la compra?" → `registrarCompraAction`.
3. **Acción** `src/app/actions/compras.ts`: `exigirAccesoCompras('CREAR')`. **Validación** zod con `registrarCompraSchema` (`backend/compras/schema.ts`).
4. **Control** `ControlRegistrarCompra.registrarCompra` → función SQL `fn_registrar_compra`, que en **una transacción** graba `compra` + `detalle_compra`, aplica la entrada al kárdex (`fn_kardex_aplicar`), actualiza el último costo y el precio pactado, y escribe la bitácora.
5. **Bitácora** `NUEVA_COMPRA` (dentro de la función, con IP) → redirige a `/compras/[id]?registrada=1` → "Comprobante de ingreso a almacén".

### 2. Mapa de archivos

| Archivo | Para qué sirve | Cuándo lo tocaría |
| --- | --- | --- |
| `src/app/compras/page.tsx` | Listado (filtros por URL, resumen, tabla y tarjetas en celular). | Columnas, textos, resumen. |
| `src/app/compras/filtros-compras.tsx` | Formulario de filtros (proveedor, tipo, número, desde, hasta). | Agregar o quitar filtros. |
| `src/app/compras/logica.ts` | Lee filtros de la URL (`leerFiltrosCompras`), arma la entrada del registro, calcula el resumen y valida en el navegador. | Reglas de la pantalla, límite del listado. |
| `src/app/compras/componentes.tsx` | Insignia `InsigniaCU15`, `EtiquetaDocumento`, `BotonImprimir`. | Texto de la insignia, colores FACTURA/NOTA. |
| `src/app/compras/nueva/page.tsx` | Página "Registrar compra" (carga proveedores). | Título. |
| `src/app/compras/nueva/formulario-compra.tsx` | Formulario: proveedor, documento, fecha, observaciones, productos, resumen y modal de confirmación. | Casi todo lo visible del registro. |
| `src/app/compras/[compraId]/page.tsx` | Comprobante de ingreso (solo lectura, imprimible). | Textos del comprobante. |
| `src/app/compras/layout.tsx`, `acceso.ts` | Acceso (`exigirAccesoCompras('LEER')`) y capacidades (`registrar`, `verKardex`). | Quién ve el botón "Registrar compra". |
| `src/app/actions/compras.ts` | Server Actions (función `ejecutar` = permiso + operación + mensajes). | Mensajes de éxito/fallo. |
| `src/backend/compras/control-registrar-compra.ts` | Clase `ControlRegistrarCompra`: proveedores activos, productos del catálogo, número sugerido, verificar documento, registrar, listar, comprobante. | Consultas y reglas. |
| `src/backend/compras/schema.ts`, `reglas.ts`, `types.ts` | Zod, cálculo de subtotales/total, fecha del negocio (La Paz), `MAX_LINEAS_COMPRA = 100`. | Límites y mensajes. |
| `src/backend/compras/errores.ts` | `traducirErrorBDCompras`: errores de la BD → mensajes. | Cambiar un mensaje de error de BD. |
| `src/backend/compras/autorizacion.ts` | `exigirAccesoCompras(accion)`. | Reglas de acceso. |
| `src/backend/compras/tipos-bd.ts` | Tipos locales de `compra`, `detalle_compra` y la RPC. | Columnas nuevas. |
| `db/migrations/migracion_cu15_compras.sql` | Tablas, índice único `uq_compra_documento`, triggers de solo inserción, `fn_registrar_compra` y permisos de `rol_funcion`. | Reglas de BD. |

### 3. Mapa de la pantalla

| Elemento | Archivo | Texto para buscar | Qué cambiar |
| --- | --- | --- | --- |
| Insignia | `componentes.tsx` | `'REGISTRAR COMPRAS DE EQUIPOS E INSUMOS'` | Texto de la insignia (local, mismo estilo que `PageHeaderBadge`). |
| Título del listado | `page.tsx` | `>Compras</h1>` | Texto. Subtítulo: `Compras de equipos e insumos a proveedores`. |
| Botón registrar | `page.tsx` | `Registrar compra` | Solo aparece si `capacidades.registrar`. Usa la clase global `btn-primario`. |
| Clase `btn-primario` / `tarjeta` | `src/app/globals.css` | `.btn-primario {` | `bg-lime-400 hover:bg-lime-300 rounded-xl`. **Afecta a todas las pantallas que la usan** (CU15 y CU16). |
| Encabezado del listado | `page.tsx` | `'Compras encontradas' : 'Compras recientes'` | Cambia según haya filtros. |
| Importe del listado | `page.tsx` | `Importe del listado` | Suma de la página. |
| Columnas | `page.tsx` | `<th scope="col" className="px-4 py-3">N.º</th>` | `N.º`, `Fecha`, `Proveedor`, `Documento`, `Productos`, `Total`, `Responsable` y acción (botón verde `bg-lime-100` hacia `/compras/{id}`). |
| Etiqueta FACTURA/NOTA | `componentes.tsx` | `export function EtiquetaDocumento` | Celeste (`sky`) para factura y violeta para nota. |
| Sin resultados | `page.tsx` | `No hay compras que coincidan con los filtros.`, `Todavía no hay compras registradas.` | Textos. |
| Solo consulta | `page.tsx` | `Tu rol tiene acceso de solo consulta a las compras.` | Aviso para quien tiene LEER pero no CREAR. |
| Filtros | `filtros-compras.tsx` | `htmlFor="fc-proveedor"`, `fc-tipo`, `fc-nro`, `fc-desde`, `fc-hasta`; botones `Filtrar` y `Limpiar` | Se aplican como **parámetros de URL** `?proveedor=&tipo=&nro=&desde=&hasta=` (`router.push`). |
| Error de fechas | `filtros-compras.tsx` | `La fecha inicial no puede ser posterior a la final.` | Texto. |
| Título del registro | `nueva/page.tsx` | `Registrar compra` | Texto del `<h1>`. |
| Sección 1 | `formulario-compra.tsx` | `1. Proveedor y documento` | Proveedor (`Seleccione un proveedor activo…`), `Tipo de documento<span`, número (`maxLength={50}`), botón `⚡ Autogenerar secuencial`. |
| Aviso del documento | `formulario-compra.tsx` | `✓ Documento no registrado para este proveedor.` | Verde si está libre; rojo si existe (`function AvisoDocumento`). |
| Fecha y observaciones | `formulario-compra.tsx` | `etiqueta="Fecha de compra"` (ayuda `No puede ser una fecha futura.`), `etiqueta="Observaciones"` (`maxLength={1000}`) | Textos y límites. |
| Sección 2 | `formulario-compra.tsx` | `2. Productos comprados`, `Ver catálogo completo` | Buscador de productos y aviso `Solo se permiten productos previamente registrados en el Catálogo de Mayorista`. |
| Sin catálogo | `formulario-compra.tsx` | `Este proveedor no tiene productos registrados en su catálogo (CU14).` | Texto. |
| Línea de producto | `formulario-compra.tsx` | `function FilaLinea` | Cantidad (placeholder `0`), costo (placeholder `0,00`), `Subtotal`. |
| Resumen lateral | `formulario-compra.tsx` | `Total de la compra` | Proveedor, Documento, Productos y total. |
| Botón enviar | `formulario-compra.tsx` | `Revisar y registrar` | Abre la confirmación. |
| Modal de confirmación | `formulario-compra.tsx` | `¿Registrar la compra?`, `Confirmar y registrar`, `Registrando compra…` | Subtítulo: `una compra registrada no se puede modificar`. |
| Error de conexión | `formulario-compra.tsx` | `const MENSAJE_SIN_CONEXION` | Texto. |
| Comprobante | `[compraId]/page.tsx` | `Comprobante de ingreso a almacén`, `Compra N.º`, `✓ Compra registrada.` | Textos. El mensaje verde aparece con `?registrada=1`. |
| Columnas del comprobante | `[compraId]/page.tsx` | `Stock ant. → result.`, `Kárdex` | `Producto`, `Cantidad`, `Costo unit.`, `Subtotal`, stock, enlace al kárdex. |
| Imprimir | `componentes.tsx` | `Imprimir comprobante` | `window.print()`; `print:hidden` oculta botones al imprimir. |
| Menú | `src/lib/navigation.ts` | `Compras de Equipos e Insumos (CU15)` | Texto. |

### 4. Mapa de la lógica

| Si me preguntan dónde está… | Archivo | Buscar | Explicación |
| --- | --- | --- | --- |
| Validación completa | `backend/compras/schema.ts` | `export const registrarCompraSchema` | Tipo FACTURA/NOTA; número 1–50 caracteres; fecha AAAA-MM-DD **no futura**; observación ≤ 1000; 1–100 líneas; cantidad y costo > 0 con máximo 2 decimales; sin productos repetidos. |
| Validación en el navegador | `src/app/compras/logica.ts` | `parse` / `safeParse` con los esquemas del backend | Marca errores antes de enviar, usando las mismas reglas. |
| Documento único | `control-registrar-compra.ts` | `static async verificarDocumento` | Compara `nro_documento_normalizado` (mayúsculas, sin espacios, puntos, barras ni guiones). La garantía final es el índice `uq_compra_documento`. |
| Número sugerido | `control-registrar-compra.ts` | `static async sugerirNumeroDocumento` | `FAC-0001` / `NOT-0001`: toma el mayor del proveedor + 1 y evita repetidos. |
| Solo productos del catálogo | `control-registrar-compra.ts` | `static async listarProductosDisponibles` | Primero lee `producto_proveedor` del proveedor y luego los `producto` activos de esa lista, con su precio pactado. |
| Proveedores activos | `control-registrar-compra.ts` | `static async listarProveedoresActivos` | `proveedor.estado = true`. |
| Registro atómico | `migracion_cu15_compras.sql` | `fn_registrar_compra` | Revalida todo, revisa el permiso (`fn_verificar_permiso(p_usuario_id, 'Compras', 'CREAR')`), proveedor activo, documento, cabecera, líneas, kárdex, último costo, precio pactado y bitácora. Si algo falla, no se guarda nada. |
| Subtotales y total | `backend/compras/reglas.ts` | `export function calcularResumenCompra` | Subtotal = cantidad × costo (redondeado); total = suma. La BD lo recalcula. |
| Fecha de "hoy" | `backend/compras/reglas.ts` | `ZONA_HORARIA_NEGOCIO = 'America/La_Paz'` | Para decidir si una fecha es futura. |
| Permisos | `backend/compras/autorizacion.ts` | `export async function exigirAccesoCompras` | Sesión + permiso de ruta COMPRAS + acción (LEER/CREAR) en `rol_funcion`. Mensajes: "No autorizado: tu rol no tiene acceso al módulo de Compras." |
| Quién ve "Registrar compra" | `src/app/compras/acceso.ts` | `export async function obtenerCapacidadesCompras` | `registrar` = tiene CREAR; `verKardex` = puede LEER inventario. |
| Bitácora | `migracion_cu15_compras.sql` | `'NUEVA_COMPRA'` | Texto: "Compra #id · documento · Proveedor «…» · N línea(s) · Total Bs …", con IP (`p_ip`). |
| No se modifica ni borra | `migracion_cu15_compras.sql` | `trg_compra_solo_insercion` | Triggers que impiden UPDATE/DELETE/TRUNCATE en `compra` y `detalle_compra`. |
| Traducción de errores | `backend/compras/errores.ts` | `const UNICOS`, `const CHECKS` | Por ejemplo, `uq_compra_documento` → "Documento ya registrado: …". Los códigos 22023, P0002, 42501, 22003 y 55000 muestran el mensaje de la función. |
| Comprobante | `control-registrar-compra.ts` | `static async obtenerComprobanteIngreso` | Lee la cabecera, el detalle con el producto y los movimientos de kárdex con motivo COMPRA. |

### 5. Modificaciones típicas paso a paso
1. **Cambiar el título del listado.** `page.tsx` → `>Compras</h1>` → p. ej. `>Compras a proveedores</h1>`.
2. **Cambiar el color del botón "Registrar compra" solo aquí.** `page.tsx` → en `<Link href="/compras/nueva" className="btn-primario shrink-0">` agregar al final `!bg-blue-600 !text-white` (el `!` fuerza la prioridad). Si cambias `.btn-primario` en `globals.css`, cambia en todo el sistema.
3. **Renombrar la columna "Responsable" a "Registró".** `page.tsx` → `<th scope="col" className="px-4 py-3">Responsable</th>`.
4. **Quitar la columna "Productos".** `page.tsx` → borrar su `<th>` y el `<td>` correspondiente en el `map` de `compras.data`.
5. **Cambiar el mensaje de documento repetido.** `backend/compras/errores.ts` → `uq_compra_documento: '…'`, `formulario-compra.tsx` → `Documento ya registrado: ese número…` y en la migración el `RAISE EXCEPTION 'Documento ya registrado: …'`.
6. **Hacer obligatoria la observación.**
   1. `schema.ts` → en `registrarCompraSchema`, dentro de `observacion: z.string().trim()…`, reemplazar `.nullish()` por `.min(5, 'La observación es obligatoria (mínimo 5 caracteres)')`. Deja el `.max(1000, …)` y el `.transform(...)`.
   2. `formulario-compra.tsx` → en `etiqueta="Observaciones"` agregar `obligatorio`.
7. **Cambiar el máximo de líneas de 100 a 50.** `backend/compras/types.ts` → `MAX_LINEAS_COMPRA = 50`. Para la BD, en la migración ajustar el límite de líneas de `fn_registrar_compra` y volver a ejecutar la función.
8. **Permitir fechas futuras** (cambio de regla). `schema.ts` → quitar el `ctx.addIssue` de `'La fecha de compra no puede ser futura'`, y en la migración quitar la validación equivalente de la función.
9. **Cambiar el prefijo de numeración FAC → F.** `control-registrar-compra.ts` → `const prefijo = tipoDocumento === 'FACTURA' ? 'FAC-' : 'NOT-'`.
10. **Mostrar 50 compras en lugar de 100.** `src/app/compras/logica.ts` → `export const LIMITE_LISTADO = 100`.
11. **Quitar el permiso de registrar al Encargado.** No es código, es BD: en `rol_funcion` borrar la fila (Encargado, función "Compras", acción CREAR) desde SQL Editor. El botón desaparece solo (`capacidades.registrar`) y la acción lo rechaza.
12. **Agregar la columna `nro_orden_compra` (cadena completa).**
    1. SQL: `ALTER TABLE public.compra ADD COLUMN IF NOT EXISTS nro_orden_compra VARCHAR(30);` y agregar el parámetro `p_nro_orden` a `fn_registrar_compra` (incluirlo en su `INSERT INTO public.compra`). Ejecutar en Supabase.
    2. `backend/compras/tipos-bd.ts` → agregar la columna al tipo de `compra` y el parámetro a la RPC.
    3. `schema.ts` → `nro_orden_compra: z.string().trim().max(30).nullable().optional()` en `registrarCompraSchema`.
    4. `control-registrar-compra.ts` → en `registrarCompra` agregar `p_nro_orden: d.nro_orden_compra ?? null` al `rpc('fn_registrar_compra', {…})`, y en `obtenerComprobanteIngreso` al `select`.
    5. `logica.ts` → incluirlo en la entrada de `registrarCompraAction` (el esquema es estricto: si no está en el esquema, se rechaza).
    6. `formulario-compra.tsx` → un `<Campo>` nuevo; `[compraId]/page.tsx` → mostrarlo.

### 6. Preguntas probables
1. **¿Por qué el registro está en una función SQL?** Porque cabecera, detalle, stock, kárdex, precios y bitácora deben guardarse juntos o nada. Lo garantiza la transacción de `fn_registrar_compra`.
2. **¿Cómo se evita un documento repetido?** Aviso temprano (`verificarDocumento`), validación en la función y el índice único `uq_compra_documento` sobre el número normalizado.
3. **¿Qué es el número normalizado?** Una columna generada: el número en mayúsculas, sin espacios, puntos, barras ni guiones. Así `001-23` y `00123` cuentan como el mismo.
4. **¿Por qué solo aparecen ciertos productos?** Solo se compran productos del catálogo del proveedor (CU14) que estén activos: `listarProductosDisponibles`.
5. **¿Qué pasa con el stock?** `fn_kardex_aplicar` (CU16) suma la cantidad, bloquea el producto mientras actualiza y registra un movimiento ENTRADA/COMPRA con stock anterior y resultante.
6. **¿Se puede editar o anular una compra?** No: triggers de solo inserción. Una corrección se hace con un ajuste de inventario (CU16).
7. **¿Qué precio se actualiza?** `producto.precio_compra_actual` (último costo, salvo que la compra tenga fecha anterior a otra ya registrada) y `producto_proveedor.precio_compra` (precio pactado).
8. **¿Quién puede registrar?** Quien tenga COMPRAS y la acción CREAR. Se revisa en el layout, en la acción (`exigirAccesoCompras('CREAR')`) y en la función SQL (`fn_verificar_permiso`).
9. **¿Cómo sabe quién registró?** `exigirAccesoCompras` devuelve el usuario de la sesión, y su `id` va como `p_usuario_id` a la función (columna `compra.usuario_id`).
10. **¿Qué se guarda en la bitácora?** `NUEVA_COMPRA` con número, documento, proveedor, cantidad de líneas, total e IP, en la misma transacción.
11. **¿Cómo funcionan los filtros?** Son parámetros de la URL (`?proveedor=&tipo=&nro=&desde=&hasta=`) que lee `leerFiltrosCompras` en `logica.ts`.
12. **¿Por qué hay un `tipos-bd.ts` propio?** Porque `database.types.ts` (compartido, hecho a mano) aún no incluye las tablas y columnas de CU15/CU16.

### 7. Errores comunes de este CU
- "Falta…/función no existe" o error al registrar → no se ejecutó `migracion_cu15_compras.sql` (que necesita antes la de CU16).
- Agregaste un campo al formulario y sale "Unrecognized key" → `registrarCompraSchema` es estricto (`strictObject`/`strict`): agrégalo también al esquema.
- "No autorizado: tu rol no tiene permiso para esta operación de compras." → falta la fila en `rol_funcion`, no solo en `rol_permiso`.
- Cambiaste una regla en zod pero no en `fn_registrar_compra` → la BD sigue rechazando (o aceptando) lo anterior.

### 8. Prueba rápida en el navegador
1. Entra como ENCARGADO → **Compras de Equipos e Insumos (CU15)**.
2. **+ Registrar compra** → elige un proveedor sin catálogo → aparece el aviso de catálogo vacío.
3. Elige un proveedor con catálogo → **⚡ Autogenerar secuencial** → aparece `FAC-000N` y "✓ Documento no registrado…".
4. Escribe un número ya usado → aviso rojo de documento registrado.
5. Pon una fecha de mañana → error "no puede ser futura". Corrige.
6. Agrega 2 productos con cantidad y costo → revisa los subtotales y el total.
7. **Revisar y registrar** → **Confirmar y registrar** → se abre el comprobante con "✓ Compra registrada".
8. Revisa la columna "Stock ant. → result." y abre el enlace al kárdex (CU16): hay un movimiento COMPRA.
9. Vuelve a `/compras`, filtra por ese proveedor → la URL cambia a `?proveedor=…` y aparece la compra.
10. `/bitacora` (admin) → `NUEVA_COMPRA` con IP.

### Chuleta CU15
1. Formulario `compras/nueva/formulario-compra.tsx`; lógica `backend/compras/control-registrar-compra.ts`.
2. Todo el registro ocurre en `fn_registrar_compra` (una transacción).
3. Documento único por proveedor + tipo + número normalizado (`uq_compra_documento`).
4. Solo productos activos del catálogo del proveedor (CU14).
5. 1 a 100 líneas; cantidad y costo > 0 con 2 decimales; fecha no futura (La Paz).
6. Stock y kárdex vía `fn_kardex_aplicar` (include CU16).
7. Actualiza el último costo y el precio pactado.
8. Permiso en 3 capas: layout, acción (`exigirAccesoCompras`) y SQL (`fn_verificar_permiso`).
9. Compras de solo inserción (triggers); bitácora `NUEVA_COMPRA`.
10. Filtros por URL; `.btn-primario` vive en `globals.css`.

---
## CU16 — Inventario y Kárdex

**Actor(es):** Administrador (todas las acciones: CREAR, LEER, ACTUALIZAR, ELIMINAR, PROCESAR). Encargado **solo LEER** (ve el catálogo y el kárdex, pero no edita). Ver `migracion_cu16_inventario.sql`, buscar `'Consulta de inventario y kárdex'` · **Rutas:** `/inventario`, `/inventario/kardex/[productoId]`

### 1. Resumen en 5 líneas
1. Gestiona el catálogo de productos (código, categoría, costo, margen, stock mínimo, imagen) y categorías. Marca el **stock crítico** (stock ≤ mínimo). El stock **solo cambia por movimientos de kárdex**: inventario inicial, ajuste por conteo físico, compra (CU15) y venta (CU09).
2. **Pantalla** `src/app/inventario/page.tsx` + `catalogo-productos.tsx` + modales de `formularios.tsx` → acciones de `src/app/actions/inventario.ts`.
3. **Acción**: función `ejecutar(accion, …)` → `exigirAccesoInventario(accion)` → zod (`backend/inventario/schema.ts`).
4. **Control** `ControlGestionarInventario` (productos/categorías → tablas `producto`, `categoria_producto`, `imagen_producto`) y `ControlKardex` (funciones SQL `fn_registrar_ajuste` / `fn_registrar_inventario_inicial` → `fn_kardex_aplicar` → `producto.stock_disponible` + `movimiento_kardex`).
5. **Bitácora** NUEVO_PRODUCTO, MODIFICAR_PRODUCTO, CAMBIO_PRECIO, DESACTIVAR_PRODUCTO, NUEVA_CATEGORIA (desde TypeScript); AJUSTE_INVENTARIO e INVENTARIO_INICIAL (desde SQL) → mensaje en la pantalla y recarga.

### 2. Mapa de archivos

| Archivo | Para qué sirve | Cuándo lo tocaría |
| --- | --- | --- |
| `src/app/inventario/page.tsx` | Página: lee filtros de la URL, carga catálogo, categorías y críticos; cabecera e indicadores. | Título, indicadores. |
| `src/app/inventario/catalogo-productos.tsx` | Tabla (escritorio) y tarjetas (celular), botones "Nueva categoría" y "+ Nuevo producto", acciones por fila (`AccionesProducto`). | Columnas, botones, permisos visibles. |
| `src/app/inventario/filtros-inventario.tsx` | Filtros: texto, categoría, estado, solo críticos → URL. | Agregar/quitar filtros. |
| `src/app/inventario/formularios.tsx` | Modales: `FormularioProducto`, `FormularioCategoria`, `FormularioInventarioInicial`, `FormularioAjuste`, `ConfirmarDesactivacion`. | Campos, textos, botones. |
| `src/app/inventario/componentes.tsx` | `InsigniaCU16`, `Modal`, `Campo`, `AccionesFormulario`, `EstadoProducto`, `FotoProducto`. | Insignia, etiquetas de estado. |
| `src/app/inventario/detalle-producto.tsx` | Detalle con fotos. | Vista del detalle. |
| `src/app/inventario/formato.ts` | `formatoBs`, `precioVentaReferencial`, etc. | Formato de dinero y cálculo del precio de venta mostrado. |
| `src/app/inventario/kardex/[productoId]/page.tsx` | Kárdex de un producto. | Columnas y textos del kárdex. |
| `src/app/inventario/layout.tsx`, `acceso.ts` | Acceso (`exigirAccesoInventario('LEER')`) y capacidades (`crear`, `actualizar`, `eliminar`, `procesar`). | Qué botones se ven según el rol. |
| `src/app/actions/inventario.ts` | Server Actions (`ejecutar` = permiso + operación + `revalidatePath`). | Mensajes, acción exigida. |
| `src/backend/inventario/control-gestionar-inventario.ts` | Catálogo, stock crítico, kárdex, alta/edición/desactivación, categorías, bitácora (`auditar`). | Reglas y consultas. |
| `src/backend/inventario/control-kardex.ts` | Ajuste e inventario inicial (RPC). | Parámetros de los movimientos. |
| `src/backend/inventario/schema.ts`, `reglas.ts`, `errores.ts`, `autorizacion.ts`, `tipos-bd.ts` | Zod; reglas (`esStockCritico`, `sentidoMovimiento`); traducción de errores; permisos; tipos locales. | Validaciones, mensajes y tipos. |
| `db/migrations/migracion_cu16_inventario.sql` | Columnas nuevas de `producto` y kárdex, triggers, `fn_kardex_aplicar`, `fn_registrar_ajuste`, `fn_registrar_inventario_inicial`, permisos. | Reglas de BD. |

### 3. Mapa de la pantalla

| Elemento | Archivo | Texto para buscar | Qué cambiar |
| --- | --- | --- | --- |
| Insignia | `componentes.tsx` | `'GESTIONAR INVENTARIO Y KÁRDEX'` | Texto. |
| Título y subtítulo | `page.tsx` | `>Inventario</h1>`, `Catálogo de productos con costos, márgenes y existencias` | Textos. Pestaña del navegador: `title: 'Inventario — SmartService'`. |
| Indicadores | `page.tsx` | `'Productos encontrados' : 'Productos activos'`, `Stock crítico`, `Categorías` | Etiquetas de las 3 tarjetas. |
| Filtros | `filtros-inventario.tsx` | `placeholder="Nombre o código…"`, `<option value="">Todas</option>`, `Solo activos`, `Activos e inactivos`, `Filtrar`, `Limpiar` | Parámetros de URL `?texto=&categoria=&estado=todos&critico=1` (`params.set`). |
| Botón categoría | `catalogo-productos.tsx` | `Nueva categoría` | Botón blanco con borde. |
| Botón producto | `catalogo-productos.tsx` | `Nuevo producto` | `btn-primario` (global en `globals.css`). Deshabilitado si no hay categorías (`Primero registre una categoría`). |
| Columnas | `catalogo-productos.tsx` | `<th scope="col" className="px-4 py-3">Producto</th>` | `Producto`, `P. compra`, `Margen`, `P. venta ref.`, `Stock / mín.`, `Estado`, `Acciones`. La vista de celular tiene sus propios textos (`Stock`, `Mínimo`, `P. compra`). |
| Precio de venta referencial | `formato.ts` | `precioVentaReferencial` | Costo × (1 + margen/100). |
| Etiqueta de estado | `componentes.tsx` | `export function EstadoProducto` | `Inactivo` (gris), `Stock crítico` (rojo `bg-rose-50`), `Normal`. |
| Botones de fila | `catalogo-productos.tsx` | `function AccionesProducto` | `Kárdex` (verde, siempre), `Editar` (si `actualizar`), `Inv. inicial` (si `procesar`, activo y stock 0), `Ajuste` (si `procesar` y activo), `Desactivar` (si `eliminar` y activo). |
| Sin resultados | `catalogo-productos.tsx` | `No hay productos que coincidan con los filtros.` | Texto. |
| Solo consulta | `catalogo-productos.tsx` | `Tu rol tiene acceso de solo consulta al inventario.` | Aviso para el Encargado. |
| Modal producto | `formularios.tsx` | `'Editar producto y precios' : 'Nuevo producto'` | Subtítulo: `El producto se registra con stock 0: las existencias entran por el kárdex.` |
| Campos del producto | `formularios.tsx` | `etiqueta="Código"` (ayuda `Ej. CAM-IP-01 (se guarda en mayúsculas)`), `Unidad de medida`, `Nombre`, `Categoría`, `Descripción técnica`, `Imagen del producto`, `Precio de compra (Bs)`, `Margen (%)`, `Stock mínimo` | Etiquetas, ayudas y placeholders. |
| Imagen | `formularios.tsx` | `📁 Adjuntar`, `Vista previa`, `No se pudo cargar la imagen` | Enlace o archivo. |
| Botón guardar | `formularios.tsx` | `'Guardar cambios' : 'Registrar producto'` | Texto. |
| Modal categoría | `formularios.tsx` | `titulo="Nueva categoría"`, `Registrar categoría` | Textos. |
| Modal inventario inicial | `formularios.tsx` | `titulo="Inventario inicial"`, `Registrar inventario inicial` | Textos. |
| Modal ajuste | `formularios.tsx` | `titulo="Ajuste por conteo físico"`, `Stock en sistema`, `Diferencia`, `Motivo / justificación`, `Registrar ajuste` | El botón se deshabilita si la diferencia es 0 (`deshabilitado={diferencia === 0}`). Contador `${largo}/1000 · mínimo 10 caracteres`. |
| Modal desactivar | `formularios.tsx` | `¿Desactivar producto?`, `Sí, desactivar` | Botón rojo (`peligro`). |
| Kárdex: título | `kardex/[productoId]/page.tsx` | `` Kárdex{r.ok ? ` · ${r.data.producto.nombre}` `` y `← Volver al inventario` | Textos. |
| Kárdex: columnas | `kardex/[productoId]/page.tsx` | `Fecha y hora`, `Stock resultante`, `Responsable`, `Observación` | Columnas. Sin datos: `Este producto todavía no tiene movimientos de kárdex.` |
| Menú | `src/lib/navigation.ts` | `Inventario y Kárdex (CU16)` | Texto. |

### 4. Mapa de la lógica

| Si me preguntan dónde está… | Archivo | Buscar | Explicación |
| --- | --- | --- | --- |
| Validación del producto | `backend/inventario/schema.ts` | `export const codigoProductoSchema`, `export const registrarProductoSchema` | Código 2–50, en mayúsculas, solo letras/dígitos/`. _ / -`; nombre 2–150; unidad 1–50; precio ≥ 0; margen 0–100 %; stock mínimo ≥ 0; 2 decimales. |
| Validación del ajuste | `schema.ts` | `export const registrarAjusteSchema` | Justificación 10–1000 caracteres; stock contado ≥ 0. |
| Stock nace en 0 | `control-gestionar-inventario.ts` | `static async registrarProducto` | Inserta sin stock; las existencias entran por el kárdex. Si hay imagen, la guarda en `imagen_producto`. |
| Stock crítico | `backend/inventario/reglas.ts` | `export function esStockCritico` | `stock <= mínimo`. `listarStockCritico` = `obtenerCatalogo({ solo_criticos: true })`. |
| Núcleo del kárdex | `migracion_cu16_inventario.sql` | `FUNCTION private.fn_kardex_aplicar` | Bloquea el producto (`FOR UPDATE`), valida que esté activo, que la combinación tipo/motivo sea válida y que no quede stock negativo ("Stock insuficiente…"). Actualiza `stock_disponible` e inserta en `movimiento_kardex` con stock anterior y resultante. |
| Ajuste | `migracion_cu16_inventario.sql` | `fn_registrar_ajuste` | Revisa el permiso (`fn_verificar_permiso(…, 'PROCESAR')`) y la justificación (≥ 10, también exigida por el CHECK `chk_kardex_ajuste_justificado`). Diferencia = contado − sistema: 0 → "No hay diferencia que ajustar"; + → AJUSTE_POSITIVO; − → AJUSTE_NEGATIVO. Bitácora `AJUSTE_INVENTARIO`. |
| Inventario inicial | `migracion_cu16_inventario.sql` | `fn_registrar_inventario_inicial` | Solo con stock 0 y sin movimientos previos; ENTRADA/INVENTARIO_INICIAL. |
| Kárdex inalterable | `migracion_cu16_inventario.sql` | `trg_kardex_sin_update` | Triggers que impiden modificar o vaciar movimientos. |
| Sentido del movimiento | `reglas.ts` | `export function sentidoMovimiento` | Entradas: COMPRA, INVENTARIO_INICIAL, ANULACION_VENTA, ENTRADA_OTRA, AJUSTE_POSITIVO; el resto son salidas. |
| Desactivar (baja lógica) | `control-gestionar-inventario.ts` | `static async desactivarProducto` | `estado = false`; "El producto ya está inactivo" si ya lo estaba. No se borra. |
| Cambio de precio auditado | `control-gestionar-inventario.ts` | `'CAMBIO_PRECIO'` | Si cambió `precio_compra_actual` o `margen_ganancia`, registra además CAMBIO_PRECIO. |
| Permisos | `backend/inventario/autorizacion.ts` | `export async function exigirAccesoInventario` | Sesión + permiso INVENTARIO + acción en `rol_funcion` (función "Catálogo e Inventario"). |
| Acción por operación | `actions/inventario.ts` | `ejecutar('CREAR'`, `ejecutar('ACTUALIZAR'`, `ejecutar('ELIMINAR'`, `ejecutar('PROCESAR'` | Crear producto/categoría = CREAR; editar = ACTUALIZAR; desactivar = ELIMINAR; ajuste/inicial = PROCESAR. |
| Botones según rol | `src/app/inventario/acceso.ts` | `export async function obtenerCapacidadesInventario` | Prueba cada acción y oculta los botones que no corresponden. |
| Bitácora | `control-gestionar-inventario.ts` | `async function auditar` (`registrarEvento` con IP) | En TypeScript: NUEVO_PRODUCTO, MODIFICAR_PRODUCTO, CAMBIO_PRECIO, DESACTIVAR_PRODUCTO, NUEVA_CATEGORIA. En SQL: AJUSTE_INVENTARIO, INVENTARIO_INICIAL. |
| Traducción de errores | `backend/inventario/errores.ts` | `const UNICOS`, `const CHECKS` | `uq_producto_codigo` → "Código duplicado…"; `chk_producto_stock` → "El stock no puede quedar negativo", etc. |

### 5. Modificaciones típicas paso a paso
1. **Cambiar el título.** `page.tsx` → `>Inventario</h1>`.
2. **Cambiar el color del botón "Ajuste".** `catalogo-productos.tsx` → en `AccionesProducto` cambiar `text-amber-700 hover:bg-amber-50` por `text-blue-700 hover:bg-blue-50`.
3. **Renombrar la columna "P. venta ref." a "Precio venta".** `catalogo-productos.tsx` → `<th scope="col" className="px-4 py-3 text-right">P. venta ref.</th>`.
4. **Quitar la columna "Margen".** `catalogo-productos.tsx` → borrar `<th scope="col" className="px-4 py-3 text-right">Margen</th>` y su `<td>` en la misma posición de la fila.
5. **Cambiar el mensaje de justificación corta.** `schema.ts` → `'La justificación del ajuste es obligatoria (mínimo 10 caracteres)'` y en la migración el `RAISE EXCEPTION 'La justificación del ajuste es obligatoria (mínimo 10 caracteres)'`.
6. **Bajar el mínimo de la justificación a 5.** `schema.ts` → `.min(10, …)` por `.min(5, …)`; `formularios.tsx` → texto `mínimo 10 caracteres`; migración → `IF char_length(v_just) < 10` en `fn_registrar_ajuste` **y** el CHECK `chk_kardex_ajuste_justificado` (`>= 10`). Ejecuta ambos cambios en Supabase.
7. **Permitir un margen mayor a 100 %.** `schema.ts` → `.refine((v) => v <= 100, 'El margen de ganancia no puede superar 100 %')` → cambiar `100`.
8. **Ordenar el catálogo por código.** `control-gestionar-inventario.ts` → en `obtenerCatalogo` cambiar `.order('nombre', { ascending: true })` por `.order('codigo', …)`.
9. **Dar al Encargado permiso de ajuste.** BD: insertar en `rol_funcion` (Encargado, función "Catálogo e Inventario", acción PROCESAR). El botón "Ajuste" aparece solo, gracias a `obtenerCapacidadesInventario`.
10. **Cambiar el texto de la bitácora al crear un producto.** `control-gestionar-inventario.ts` → `` `Alta del producto «${producto.nombre}» `` .
11. **Agregar el filtro "solo sin stock".**
    1. `filtros-inventario.tsx` → checkbox nuevo y `params.set('sinstock', '1')`.
    2. `page.tsx` → leer `params.sinstock` y pasarlo a `obtenerCatalogoAction`.
    3. `schema.ts` → `solo_sin_stock: z.boolean().optional()` en `filtrosProductosSchema`.
    4. `control-gestionar-inventario.ts` → en `obtenerCatalogo`, `if (f.solo_sin_stock) consulta = consulta.eq('stock_disponible', 0)`.
12. **Agregar la columna `ubicacion` (estante) al producto (cadena completa).**
    1. SQL: `ALTER TABLE public.producto ADD COLUMN IF NOT EXISTS ubicacion VARCHAR(50);` (+ `schema.sql`).
    2. `backend/inventario/tipos-bd.ts` (y `database.types.ts` → `producto: {`) → Row/Insert/Update.
    3. `schema.ts` → `ubicacion: z.string().trim().max(50).nullable().optional()` en `registrarProductoSchema` y `modificarProductoSchema` (son estrictos: si falta, el campo se rechaza).
    4. `control-gestionar-inventario.ts` → agregarla a `COLUMNAS_PRODUCTO`, al `insert` de `registrarProducto` y al `update` de `modificarProducto`. Mapearla en el DTO (`types.ts` → `ProductoInventarioDTO`).
    5. `formularios.tsx` → `<Campo etiqueta="Ubicación">` en `FormularioProducto` (y en `valoresDe`).
    6. `catalogo-productos.tsx` → columna nueva si se quiere ver.

### 6. Preguntas probables
1. **¿Por qué no puedo editar el stock directamente?** Por trazabilidad: todo cambio pasa por `fn_kardex_aplicar` y queda en `movimiento_kardex` con stock anterior y resultante.
2. **¿Cómo se registra el stock inicial?** Con "Inv. inicial" (solo si el stock es 0 y no hay movimientos) → `fn_registrar_inventario_inicial`.
3. **¿Cómo se corrige una diferencia física?** Con "Ajuste": se ingresa el stock contado y una justificación (≥ 10). La función calcula el ajuste positivo o negativo.
4. **¿Qué es stock crítico?** Stock disponible ≤ stock mínimo (`esStockCritico`). Se marca en rojo y tiene su propio indicador y filtro.
5. **¿Puede quedar stock negativo?** No: `fn_kardex_aplicar` lanza "Stock insuficiente…" y además hay un CHECK (`chk_producto_stock`).
6. **¿Qué pasa si dos usuarios ajustan a la vez?** `FOR UPDATE` bloquea la fila del producto: el segundo espera y trabaja con el stock actualizado.
7. **¿Se puede borrar un movimiento?** No: triggers que bloquean UPDATE/TRUNCATE en `movimiento_kardex`.
8. **¿Por qué el Encargado no ve "Editar"?** En `rol_funcion` solo tiene LEER sobre "Catálogo e Inventario"; `obtenerCapacidadesInventario` oculta los botones y la acción igual lo rechazaría.
9. **¿Cómo se relaciona con CU15 y CU09?** La compra (ENTRADA/COMPRA) y la venta (SALIDA/VENTA, y ANULACION_VENTA) usan el mismo núcleo `fn_kardex_aplicar`.
10. **¿Qué se guarda en la bitácora?** Altas, modificaciones, cambio de precio, desactivación y categorías (TypeScript); ajuste e inventario inicial (SQL, misma transacción).
11. **¿Dónde se calcula el precio de venta?** `precioVentaReferencial` en `formato.ts` (solo lo muestra; es "referencial").
12. **¿Por qué se usa `tipos-bd.ts`?** `database.types.ts` (manual y compartido) aún no tiene las columnas nuevas de CU16, así que se extienden ahí.

### 7. Errores comunes de este CU
- "Unrecognized key" al agregar un campo → los esquemas son `strictObject`: agrégalo también en zod.
- El botón no aparece aunque lo agregaste → está envuelto en `capacidades.*`; tu rol no tiene esa acción en `rol_funcion`.
- Cambiaste `.btn-primario` en `globals.css` → también cambia en CU15 (y en todo lo que use esa clase).
- El ajuste no se registra con diferencia 0 → es una regla (botón deshabilitado + "No hay diferencia que ajustar").

### 8. Prueba rápida en el navegador
1. Entra como ADMINISTRADOR → **Inventario y Kárdex (CU16)**.
2. **Nueva categoría** → regístrala.
3. **+ Nuevo producto** con código en minúsculas → se guarda en mayúsculas, con stock 0.
4. Pon stock mínimo 5 → el producto aparece como **Stock crítico** (0 ≤ 5).
5. **Inv. inicial** → 10 unidades → el stock pasa a 10 y desaparece "crítico".
6. **Ajuste** → contado 8, justificación corta → error; con justificación de 10+ caracteres → stock 8.
7. **Kárdex** → 2 movimientos (INVENTARIO_INICIAL +10, AJUSTE_NEGATIVO −2) con stock anterior y resultante.
8. Filtra con "solo críticos" → la URL muestra `critico=1`.
9. Entra como ENCARGADO → solo ves "Kárdex" y el aviso de solo consulta.
10. `/bitacora` (admin) → NUEVO_PRODUCTO, INVENTARIO_INICIAL, AJUSTE_INVENTARIO.

### Chuleta CU16
1. Página `inventario/page.tsx`; tabla `catalogo-productos.tsx`; modales `formularios.tsx`.
2. Controles: `ControlGestionarInventario` (productos) y `ControlKardex` (movimientos).
3. El stock nunca se edita: solo por `fn_kardex_aplicar`.
4. Producto nace con stock 0; inventario inicial solo con 0 y sin movimientos.
5. Ajuste = contado − sistema, justificación ≥ 10, nunca 0.
6. Crítico = stock ≤ mínimo.
7. Permisos finos: CREAR / ACTUALIZAR / ELIMINAR / PROCESAR; Encargado solo LEER.
8. Kárdex inalterable (triggers) y con bloqueo `FOR UPDATE`.
9. Bitácora: 5 acciones en TS + 2 en SQL.
10. Filtros por URL (`texto`, `categoria`, `estado`, `critico`).

---
## CU17 — Catálogo de Servicios

**Actor(es):** Administrador (permiso SERVICIOS; según `db/seed.sql` y `migracion_cu17_servicio.sql`, solo el Administrador lo tiene) · **Ruta:** `/servicios`

### 1. Resumen en 5 líneas
1. Mantiene el catálogo de servicios técnicos (p. ej. "Mantenimiento Preventivo CCTV") con su **tarifa base por hora**: listar con filtros, crear, modificar y activar/desactivar (baja lógica). CU08 lo usa para cotizar mano de obra.
2. **Pantalla** `src/app/servicios/page.tsx` (lee filtros de la URL) → `gestor-servicios.tsx` (tabla + modal `FormularioServicio`) → `crearServicioAction` / `actualizarServicioAction` / `cambiarEstadoServicioAction`.
3. **Acción** `src/app/actions/servicios.ts`: `requireUser()` + `tienePermisoModulo('/servicios')` + zod (`crearServicioSchema`).
4. **Servicio** `src/backend/servicios/service.ts` → tabla `servicio` (`nombre` único, `precio_hora_base > 0`, `activo`).
5. **Bitácora** `CREAR_SERVICIO`, `MODIFICAR_SERVICIO` (con detalle de cambios), `CAMBIAR_ESTADO_SERVICIO`, con IP → `revalidatePath('/servicios')` recarga la lista.

### 2. Mapa de archivos

| Archivo | Para qué sirve | Cuándo lo tocaría |
| --- | --- | --- |
| `src/app/servicios/page.tsx` | Página del servidor: lee `?q=&estado=`, llama a `listarServiciosAction` y pasa los datos. | Filtros por defecto, título de la pestaña. |
| `src/app/servicios/gestor-servicios.tsx` | Cabecera, tabla, botones y modal `FormularioServicio`. | Casi todo lo visible. |
| `src/app/servicios/filtros-servicios.tsx` | Buscador por nombre y estado → URL. | Agregar un filtro. |
| `src/app/servicios/layout.tsx` | `requerirAccesoModulo('/servicios')`. | Acceso. |
| `src/app/actions/servicios.ts` | Server Actions + `auditar` (bitácora). | Mensajes, texto de bitácora, permisos. |
| `src/backend/servicios/schema.ts` | Zod: nombre 2–150, descripción ≤ 1000, tarifa > 0 y ≤ 99 999 999. | Validaciones. |
| `src/backend/servicios/service.ts` | Consultas (`listarServicios`, `crearServicio`, `actualizarServicio`, `cambiarEstadoServicio`) y `traducirError`. | Orden, filtros y mensajes de BD. |
| `src/backend/servicios/types.ts` | Tipo `Servicio`. | Columnas nuevas. |
| `db/migrations/migracion_cu17_servicio.sql` | Agrega `activo`, `UNIQUE(nombre)`, `CHECK (precio_hora_base > 0)` y el permiso SERVICIOS para el ADMINISTRADOR. | Reglas de BD y permisos. |
| `db/schema.sql` | Tabla `servicio`. | Estructura. |

### 3. Mapa de la pantalla

| Elemento | Archivo | Texto para buscar | Qué cambiar |
| --- | --- | --- | --- |
| Insignia | `gestor-servicios.tsx` | `titulo="GESTIONAR CATÁLOGO DE SERVICIOS TÉCNICOS Y TARIFAS"` | Usa `PageHeaderBadge` (`paquete="P2"`, `cu="CU17"`). |
| Título y subtítulo | `gestor-servicios.tsx` | `Servicios Técnicos y Tarifas`, `Administración de tarifas base por hora` | Textos. |
| Título de la pestaña | `page.tsx` | `title: 'Servicios Técnicos y Tarifas — SmartService'` | Texto. |
| Botón nuevo | `gestor-servicios.tsx` | `Nuevo Servicio` | `bg-lime-400 hover:bg-lime-300 rounded-xl`. |
| Filtros | `filtros-servicios.tsx` | `Nombre del servicio` (placeholder `Ej: CCTV`), `<option value="activos">Activos</option>`, `Filtrar`, `Limpiar` | Parámetros de URL `?q=…&estado=todos/activos/inactivos` (`router.push`). |
| Error | `gestor-servicios.tsx` | `⚠ {error}` / `⚠ {errorMensaje}` | Caja roja `bg-rose-50 text-rose-700`. |
| Título de la tabla | `gestor-servicios.tsx` | `Directorio de Servicios` | Debajo va el contador `servicio{…} disponible{…}`. |
| Columnas | `gestor-servicios.tsx` | `<th className="p-4">Servicio Técnico</th>` | `ID`, `Servicio Técnico`, `Descripción`, `Tarifa por Hora`, `Estado`, `Acciones`. |
| Formato de la tarifa | `gestor-servicios.tsx` | `function formatearTarifa` | `Bs. 80,00` (formato `es-BO`, 2 decimales). |
| Estado | `gestor-servicios.tsx` | `{s.activo ? 'Activo' : 'Inactivo'}` | Etiqueta de color. |
| Botones de fila | `gestor-servicios.tsx` | `Modificar`, `{s.activo ? 'Desactivar' : 'Reactivar'}` | Desactivar/Reactivar pide `¿Desea … el servicio "…"?`. |
| Sin resultados | `gestor-servicios.tsx` | `No se encontraron servicios para los filtros seleccionados.`, `Aún no hay servicios registrados en el catálogo.` | Textos. |
| Modal | `gestor-servicios.tsx` | `'Modificar Servicio Técnico' : 'Nuevo Servicio Técnico'`, `Definición de servicio y tarifa base para cotizaciones` | Títulos. |
| Campos | `gestor-servicios.tsx` | `Nombre del Servicio *` (`maxLength={150}`), `Tarifa Base por Hora (Bs.) *` (placeholder `Ej. 80.00`), descripción (`maxLength={1000}`) | Etiquetas y límites. |
| Validación de la pantalla | `gestor-servicios.tsx` | `El nombre del servicio es obligatorio`, `La tarifa por hora debe ser un número mayor a cero` | Mensajes antes de enviar. |
| Botón guardar | `gestor-servicios.tsx` | `'Guardando…' : 'Guardar Servicio'` | Texto y color. |
| Menú | `src/lib/navigation.ts` | `Catálogo de Servicios (CU17)` | Texto. |

### 4. Mapa de la lógica

| Si me preguntan dónde está… | Archivo | Buscar | Explicación |
| --- | --- | --- | --- |
| Validación | `backend/servicios/schema.ts` | `export const crearServicioSchema` | Nombre 2–150 ("El nombre es obligatorio"); descripción ≤ 1000; tarifa numérica > 0 y ≤ 99 999 999. Editar usa `.partial()` (todos opcionales). |
| Permiso | `actions/servicios.ts` | `const MSG_NO_AUTORIZADO` | Cada acción llama a `tienePermisoModulo(RUTA)`. Si falla: "No autorizado: tu rol no tiene el permiso del módulo Servicios." |
| Quién lo hizo | `actions/servicios.ts` | `const usuario = await requireUser()` | `usuario.id` va a la bitácora. |
| Nombre único | `migracion_cu17_servicio.sql` + `service.ts` | `servicio_nombre_key`, `if (error.code === '23505') return new Error('Ya existe un servicio con ese nombre')` | La BD no deja repetir el nombre; el servicio traduce el error. |
| Tarifa > 0 en BD | `migracion_cu17_servicio.sql` | `CHECK (precio_hora_base > 0)` | Última barrera. |
| Filtros y orden | `service.ts` | `export async function listarServicios` | `ilike('nombre', '%q%')`, `activo` true/false; orden por `id`. |
| Baja lógica | `service.ts` | `export async function cambiarEstadoServicio` | `update({ activo })`. No se borra porque las cotizaciones lo referencian. |
| Bitácora | `actions/servicios.ts` | `async function auditar` | `registrarEvento` + `obtenerIpOrigen`. Si falla la bitácora no interrumpe (try/catch). MODIFICAR_SERVICIO arma la lista `cambios` (nombre, tarifa, descripción). |
| Errores | `actions/servicios.ts` | `function mensajeDe` | Muestra el mensaje del error (ya traducido por `traducirError`). Zod: `parsed.error.issues[0]?.message`. |
| Recarga | `actions/servicios.ts` | `revalidatePath(RUTA)` | Hace que la página del servidor vuelva a leer la lista. |

### 5. Modificaciones típicas paso a paso
1. **Cambiar el título.** `gestor-servicios.tsx` → `Servicios Técnicos y Tarifas` (y si quieres, el `title` de `page.tsx`).
2. **Cambiar el color del botón "Nuevo Servicio".** `gestor-servicios.tsx` → en su `className` cambiar `bg-lime-400 hover:bg-lime-300` por `bg-blue-600 hover:bg-blue-500 text-white`.
3. **Renombrar la columna "Tarifa por Hora" a "Precio/Hora".** `gestor-servicios.tsx` → `<th className="p-4 text-right">Tarifa por Hora</th>`.
4. **Quitar la columna "Descripción".** Borrar `<th className="p-4">Descripción</th>` y su `<td>` en la fila, y ajustar el `colSpan` de la fila de "sin resultados" (búscalo con `colSpan`).
5. **Cambiar un mensaje de error.** `schema.ts` → `'La tarifa por hora debe ser mayor a cero'`; en pantalla, `gestor-servicios.tsx` → `La tarifa por hora debe ser un número mayor a cero`.
6. **Hacer obligatoria la descripción.**
   1. `schema.ts` → `descripcion: z.string().trim().min(10, 'La descripción es obligatoria').max(1000, …)` (quitar `.nullable().optional()`). Ojo: `actualizarServicioSchema = crearServicioSchema.partial()` la seguirá dejando opcional al editar.
   2. `gestor-servicios.tsx` → agregar `required` al `<textarea>` y un `*` en la etiqueta.
7. **Cambiar la tarifa máxima.** `schema.ts` → `.max(99999999, 'La tarifa por hora es demasiado alta')`.
8. **Ordenar por nombre.** `service.ts` → en `listarServicios`, `.order('id', { ascending: true })` → `.order('nombre', { ascending: true })`.
9. **Mostrar solo activos por defecto.** `page.tsx` → `?? 'todos'` por `?? 'activos'`; en `filtros-servicios.tsx`, `handleLimpiar` → `setFiltros({ q: '', estado: 'activos' })`.
10. **Dar acceso al Encargado.** BD (SQL Editor): `INSERT INTO rol_permiso (rol_id, permiso_id, descripcion) SELECT r.id, p.id, 'Servicios' FROM rol r, permiso p WHERE r.nombre='ENCARGADO' AND p.nombre='SERVICIOS' ON CONFLICT DO NOTHING;` (o desde la pantalla `/roles`).
11. **Cambiar el texto de la bitácora.** `actions/servicios.ts` → `` `Se creó el servicio "${servicio.nombre}" `` .
12. **Agregar la columna `duracion_estimada_horas` (cadena completa).**
    1. SQL: `ALTER TABLE public.servicio ADD COLUMN IF NOT EXISTS duracion_estimada_horas NUMERIC(6,2);` (+ `schema.sql`).
    2. `database.types.ts` → `servicio: {` Row/Insert/Update.
    3. `schema.ts` → `duracion_estimada_horas: z.coerce.number().positive().nullable().optional()` en `crearServicioSchema`.
    4. `service.ts` → si `crearServicio`/`actualizarServicio` arman un `payload` campo por campo, agregarlo ahí (revisa la variable `payload`).
    5. `gestor-servicios.tsx` → campo en `FormularioServicio` y enviarlo en `datos`; columna en la tabla.
    6. CU08 (`cotizaciones/nuevo/page.tsx`) → usarlo como horas por defecto en `agregarServicio`.

### 6. Preguntas probables
1. **¿Quién puede entrar?** Solo roles con permiso SERVICIOS; por defecto, solo el ADMINISTRADOR (migración CU17 y seed).
2. **¿Dónde se valida la tarifa?** En pantalla (> 0), en zod (`positive`, `max`) y en la BD (`CHECK (precio_hora_base > 0)`).
3. **¿Por qué no se elimina un servicio?** Baja lógica con `activo`: las cotizaciones (`detalle_cotizacion_servicio`) lo referencian.
4. **¿Qué pasa si repito un nombre?** La BD lo impide (`servicio_nombre_key`) y se muestra "Ya existe un servicio con ese nombre".
5. **¿Cómo se filtran?** Con parámetros de URL `q` y `estado`; `page.tsx` los lee y `listarServicios` aplica `ilike` y `activo`.
6. **¿Qué se guarda en la bitácora?** CREAR_SERVICIO (nombre, ID, tarifa), MODIFICAR_SERVICIO (lista de cambios) y CAMBIAR_ESTADO_SERVICIO, con IP.
7. **¿Cómo sabe quién lo hizo?** `requireUser()` en cada acción.
8. **¿Qué pasa si no tengo permiso y llamo la acción directo?** Devuelve "No autorizado: tu rol no tiene el permiso del módulo Servicios." (se valida en el servidor, no solo en la pantalla).
9. **¿Cómo se refresca la lista después de guardar?** `revalidatePath('/servicios')` + recarga de la página del servidor.
10. **¿Cómo se relaciona con CU08?** CU08 lee `servicio` para cotizar horas × tarifa. **Ojo:** el código de CU08 lee un campo con otro nombre (ver el aviso en CU08).
11. **¿Qué es `.partial()`?** Hace opcionales todos los campos del esquema, para editar solo lo que cambió.
12. **¿Diferencia entre schema.sql y la migración CU17?** `schema.sql` crea la tabla desde cero; la migración agrega `activo`, el nombre único, el CHECK y el permiso a una BD que ya existe.

### 7. Errores comunes de este CU
- El Encargado no ve el módulo → no tiene SERVICIOS en `rol_permiso` (es intencional).
- "Ya existe un servicio con ese nombre" al editar → otro servicio ya usa ese nombre (la comparación es exacta en la BD).
- Tarifa con coma (`80,50`) → `z.coerce.number` no la entiende como número. Usa punto, o agrega `.replace(',', '.')` en la pantalla antes de enviar.
- Desactivaste un servicio y sigue en CU08 → CU08 no filtra por `activo` (ver el aviso en CU08).

### 8. Prueba rápida en el navegador
1. Entra como ADMINISTRADOR → **Catálogo de Servicios (CU17)**.
2. **+ Nuevo Servicio** sin nombre → "El nombre del servicio es obligatorio".
3. Tarifa `0` → error de tarifa.
4. Nombre "Instalación de alarma", tarifa `95.50` → Guardar Servicio → aparece con `Bs. 95,50`.
5. Crea otro con el mismo nombre → "Ya existe un servicio con ese nombre".
6. **Modificar** → cambia la tarifa → Guardar.
7. **Desactivar** → confirma → estado "Inactivo".
8. Filtra Estado = Inactivos → la URL muestra `?estado=inactivos` y aparece solo ese servicio.
9. Entra como ENCARGADO → el menú no muestra Servicios; si escribes `/servicios`, te devuelve al inicio.
10. `/bitacora` (admin) → CREAR_SERVICIO, MODIFICAR_SERVICIO (con "tarifa 95.50 → …"), CAMBIAR_ESTADO_SERVICIO.

### Chuleta CU17
1. Pantalla `servicios/gestor-servicios.tsx`; página del servidor `servicios/page.tsx`.
2. Acciones `actions/servicios.ts`: `requireUser` + `tienePermisoModulo('/servicios')` + zod.
3. Reglas: nombre 2–150 y único; tarifa > 0; descripción ≤ 1000.
4. Baja lógica con `activo` (Desactivar/Reactivar).
5. Filtros por URL `q` y `estado`.
6. Bitácora: CREAR / MODIFICAR (con cambios) / CAMBIAR_ESTADO_SERVICIO + IP.
7. Error 23505 → "Ya existe un servicio con ese nombre".
8. Solo ADMINISTRADOR tiene el permiso por defecto.
9. `revalidatePath` refresca la lista.
10. CU08 consume esta tarifa (`precio_hora_base`).

---
## Chuleta final (una página): lo 10 más importante de los 7 CU

1. **Recorrido de un dato:** pantalla (`src/app/<módulo>/…tsx`) → Server Action (`src/app/actions/<módulo>.ts`) → zod (`src/backend/<módulo>/schema.ts`) → servicio/control (`src/backend/<módulo>/`) → tabla en Supabase → bitácora con IP → la pantalla muestra el mensaje y recarga.
2. **Acceso en 3 niveles:** sesión (`src/proxy.ts`), permiso de ruta (`layout.tsx` → `requerirAccesoModulo`) y, en CU15/CU16, acción fina en `rol_funcion` (`exigirAccesoCompras` / `exigirAccesoInventario`, también dentro de las funciones SQL).
3. **Quién hizo la acción:** siempre sale de la sesión (`requireUser` / `getCurrentUser` / `contexto()`). Excepción a corregir: CU08 envía `usuario_id: 1`.
4. **Bitácora:** tabla `bitacora` (usuario, fecha_hora, acción, descripción, ip). IP con `obtenerIpOrigen()` (`src/lib/ip.ts`). En CU15 y en el ajuste/inventario inicial de CU16 se escribe dentro de la función SQL, en la misma transacción.
5. **Transacciones en la BD:** `fn_registrar_compra` (CU15), `fn_cerrar_caja` / `fn_registrar_venta` / `fn_anular_venta` (CU09), `fn_kardex_aplicar` / `fn_registrar_ajuste` / `fn_registrar_inventario_inicial` (CU16). O se guarda todo, o nada.
6. **Nada se borra en el negocio:** baja lógica en proveedores (`estado`), productos (`estado`) y servicios (`activo`); compras y kárdex son de solo inserción (triggers). Excepción: CU08 elimina cotizaciones físicamente (los detalles caen por CASCADE).
7. **Reglas clave:** documento de cliente único (CU07); NIT único sin distinguir mayúsculas (CU14); documento de compra único por proveedor con el número normalizado (CU15); una caja abierta por usuario y esperado = fondo + efectivo (CU09); el stock solo cambia por kárdex y nunca queda negativo (CU16); nombre de servicio único y tarifa > 0 (CU17).
8. **Columna nueva = 6 eslabones:** migración SQL (+ `schema.sql`) → `database.types.ts` (o `tipos-bd.ts` en CU15/CU16) → zod → servicio/control → acción → pantalla. Los esquemas `strictObject` rechazan campos que no declares.
9. **Estilos rápidos:** verde principal `bg-lime-400` (CU07, CU17, `.btn-primario` en `globals.css` para CU15/CU16) o `bg-[#8cd600]` / `bg-[#9fe82e]` (CU09, CU14, CU08). Mensajes de error `bg-rose-50 text-rose-700`; de éxito `bg-emerald-50`.
10. **Puntos débiles para anticipar (CU08):** no tiene `layout.tsx` ni permisos en las acciones, usa `usuario_id: 1` y lee la tarifa de un campo inexistente (`tarifa_por_hora` / `precio_base` en lugar de `precio_hora_base`). Conviene arreglarlos antes de la defensa (CU08, sección 5, cambios 9 a 11).

**Comandos:** `npm.cmd run dev` · `npx.cmd tsc --noEmit` · `npm.cmd run lint` · `npm.cmd run build`.
