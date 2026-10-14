# 10 · Guía de exposición y demostración

[← Índice](README.md)

> No es un discurso para memorizar. Usa cada paso como un recordatorio y explícalo con tus palabras.
> Según los apuntes, la presentación del flujo de trabajo de administración de usuarios era el **martes 29/09/2026**. Se admite localhost, y la nube es recomendable (PDF-A p.19).

## Preparación (antes de entrar)

- [ ] `.env.local` con valores reales (sin mostrarlo en pantalla). ⚠️ El `.env.local` inspeccionado es idéntico a `.env.example`: comprueba que tenga las claves reales.
- [ ] `npm run dev` funcionando y un usuario de cada rol con contraseña conocida (la del README, o cambiada).
- [ ] Abrir en el editor:
  - `src/app/actions/auth.ts`
  - `src/lib/bloqueo-cu01.ts`
  - `src/lib/password.ts`
  - `src/lib/permisos.ts`
  - `src/proxy.ts`
  - `schema.sql`
- [ ] Una ventana de incógnito para el segundo usuario.
- [ ] Supabase SQL Editor abierto, con las consultas de [05 §7](05-base-de-datos.md#7-consultas-de-solo-lectura-para-demostrar) preparadas y **sin** columnas sensibles.

## Secuencia sugerida

| # | Paso | Qué explicar | Qué mostrar | Archivo o ruta que abrir | No olvidar | Pregunta probable |
|---|---|---|---|---|---|---|
| 1 | Problema | SgarNet tiene la información dispersa | PDF-P p.11-16 | — | Ser breve | «¿Cuál es el problema principal?» |
| 2 | Objetivo | Sistema web para recursos, ventas y mantenimientos | PDF-P p.16 | — | — | — |
| 3 | Iteración / PUDS | Ciclo 1 = P1 Seguridad (CU01–CU06); paquetes oficiales P1–P4 | PDF-P p.100-103, p.117 | `src/lib/navigation.ts` (P1 y P2 activos, P3 y P4 bloqueados) | Mostrar el Sidebar con los paquetes bloqueados | «¿Por qué estos CU primero?» (B2) |
| 4 | CU | 6 CU y sus relaciones (extend/include) | PDF-P p.104-112, p.118 | — | Reconocer las diferencias con el código ([07 §4](07-trazabilidad.md#4-contradicciones-entre-fuentes)) | B3 |
| 5 | Pantalla | Login, dashboard y menú por rol | `/login`, `/` | `src/app/login/login-form.tsx` | Mostrar dos roles distintos | D2 |
| 6 | Flujo del frontend | Formulario → Server Action; Client frente a Server Components | DevTools → Network: el POST de la acción | `login-form.tsx:19,62` | La validación visual no es la seguridad | D1, D5 |
| 7 | Lógica del servidor | Orden: Zod → usuario → bloqueo → bcrypt → intentos → estado → JWT → bitácora | Código | `src/app/actions/auth.ts:54-160` | Decir las líneas clave: 83, 96, 102, 119, 126 | C1 |
| 8 | Auth / BD / RLS | Auth propia, Supabase solo como BD, service role, sin RLS | Consultas 7.2 y 7.3 | `src/lib/supabase/service.ts`, `schema.sql:108-125` | **No** decir que usan Supabase Auth ni RLS | A7, F2 |
| 9 | Seguridad | Hash, JWT `httpOnly`, RBAC en BD, URL directa, DevTools | Técnico → `/usuarios` → aviso | `src/lib/permisos.ts:93-99`, `src/app/usuarios/layout.tsx` | Enseñar la matriz de amenazas ([06 §8](06-seguridad.md#8-matriz-de-amenazas-para-la-defensa)) | D3, D4, G3 |
| 10 | Demostración | Checklist de abajo | Navegador | — | Si algo falla, explicar la causa con el código | — |
| 11 | Posible cambio | Por ejemplo, 5 intentos o dar Bitácora al encargado | Editar `bloqueo-cu01.ts:17` o usar `/roles` | [08](08-cambios-defensa.md) | Guardar, recargar y demostrar | H1, H2 |
| 12 | Prueba | Pruebas manuales (no hay automatizadas) | Checklist + bitácora | — | Ser honesto sobre las pruebas | «¿Qué pruebas hicieron?» |
| 13 | Conclusión | Qué está listo, qué falta (correo real, RLS, crear rol, IP) | [11](11-informe-final.md) | — | Cerrar con el plan del Ciclo 2 | G4 |

## Checklist manual por CU

### CU01 — Sesión
| Entrada | Resultado esperado | Evidencia visible | Consulta de solo lectura |
|---|---|---|---|
| Credenciales válidas del ADMINISTRADOR | Redirige a `/`, saludo y badge del rol | Sidebar con Usuarios, Roles, Perfil y Bitácora | 7.6 → `INICIO_SESION` |
| Contraseña incorrecta ×2 | «Te quedan 2… / 1 intento(s)» | Recuadro rojo | 7.4 → `intentos_fallidos` = 1, 2 |
| 3.ª incorrecta | Mensaje de bloqueo de 1 minuto | Recuadro rojo | 7.4 → `bloqueado_hasta` futuro |
| Correcta durante el bloqueo | «…Inténtalo de nuevo en N segundos» | — | — |
| «Cerrar sesión» | `/login` | — | 7.6 → `CIERRE_SESION` |
| `/usuarios` sin sesión | `/login?next=/usuarios` | URL | — |

**Límite:** no se puede demostrar que el JWT deja de valer tras el logout, porque **no deja de valer**.

### CU02 — Recuperar
| Entrada | Resultado esperado | Evidencia | Consulta |
|---|---|---|---|
| Correo no registrado | «No existe una cuenta asociada a este correo» | Recuadro rojo | — |
| Correo registrado | «Revisa tu correo…» + enlace simulado | Recuadro verde y gris | 7.5 → token nuevo, `usado=false` |
| Nueva contraseña débil | Mensaje de política | Rojo | — |
| Nueva contraseña válida | «Contraseña restablecida correctamente» | Verde | 7.5 `usado=true`; 7.10 `version_sesion` +1 |
| Mismo enlace otra vez | «Enlace expirado, reinicie el proceso» | Vuelve al formulario 1 | — |

**Límite:** no hay correo real. El vencimiento de 15 minutos se demuestra esperando o mirando `fecha_expiracion`.

### CU03 — Usuarios
| Entrada | Resultado esperado | Evidencia | Consulta |
|---|---|---|---|
| Crear un técnico con clave «abc» | Error de política | Rojo | — |
| Crear con una clave válida | «Usuario registrado exitosamente.» | La fila aparece | 7.1 · 7.3 (hash `$2…`) · 7.6 `REGISTRO_USUARIO` |
| Crear con un correo repetido | Error (texto técnico de la BD) | Rojo | — |
| Desactivar al técnico | «Cuenta de … desactivada» | Badge «Inactivo» | 7.6 `CAMBIO_ESTADO` |
| El técnico intenta entrar | «Correo o contraseña incorrectos.» | — | — |
| Desactivar al ADMINISTRADOR | «Acción denegada…» | Rojo | — |

### CU04 — Roles
| Entrada | Resultado esperado | Evidencia | Consulta |
|---|---|---|---|
| ENCARGADO + Bitácora → Guardar | Mensaje verde | Contador x/8 actualizado | 7.2 · 7.6 `CONFIGURAR_ROLES_PERMISOS` |
| Entrar como encargado | Aparece Bitácora en el Sidebar | Menú | — |
| Quitarla de nuevo y navegar a `/bitacora` | Redirige con el aviso | Mensaje rojo en `/` | — |

**Límite:** no existe «Nuevo Rol».

### CU05 — Perfil
| Entrada | Resultado esperado | Evidencia | Consulta |
|---|---|---|---|
| Cambiar el teléfono | «Perfil actualizado correctamente.» | Valor nuevo | 7.6 `ACTUALIZAR_PERFIL` (descripción con antes y después) |
| Contraseña actual errónea | «Contraseña actual incorrecta» | Rojo | — |
| Cambio válido | «Contraseña cambiada correctamente.» | Verde | 7.6 `CAMBIAR_CONTRASENA` |

### CU06 — Bitácora
| Entrada | Resultado esperado | Evidencia | Consulta |
|---|---|---|---|
| Sin filtros | Lista descendente | Tabla | 7.6 |
| Acción `INICIO_SESION` | Solo inicios de sesión | Tabla | — |
| Acción `XYZ` | «No se encontraron registros…» | Mensaje | — |
| Técnico abre `/bitacora` | Redirige con el aviso | — | — |

**Límite:** muestra el ID de usuario, no el nombre, y no registra IP.
