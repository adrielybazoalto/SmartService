-- ============================================================
-- SEED: DATOS INICIALES (RBAC + USUARIOS)
-- PROYECTO: SISTEMA DE GESTIÓN DE SERVICIOS DE SEGURIDAD
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Pre-requisito: haber ejecutado `schema.sql` (reset total del esquema).
-- Idempotente: puede re-ejecutarse sin errores (ON CONFLICT DO NOTHING).
-- Incluye los GRANT de `service_role` para que la API REST (PostgREST)
-- funcione con el cliente server-only de la aplicación.
-- CREDENCIALES TEMPORALES: los 6 usuarios comparten la contraseña
-- temporal "Admin1234!" (hash bcrypt cost 10, generado con bcryptjs).
-- Cambiar la contraseña en el primer ingreso.
-- ============================================================

BEGIN;

-- ============================================================
-- 0. PERMISOS: destraba el 403 de service_role en la API REST
-- ============================================================
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- ============================================================
-- 1. TABLA: ROL (CU04)
-- ============================================================
INSERT INTO ROL (id, nombre, descripcion) VALUES
(1, 'ADMINISTRADOR', 'Acceso total y configuración del sistema'),
(2, 'ENCARGADO', 'Gestión operativa, comercial, despacho y arqueo de caja'),
(3, 'TECNICO', 'Personal de campo, reporte de labores y consumo de insumos')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 2. TABLA: MODULO (CU04)
-- ============================================================
INSERT INTO MODULO (id, nombre) VALUES
(1, 'Seguridad y Accesos'),
(2, 'Personal Técnico'),
(3, 'Clientes y Establecimientos'),
(4, 'Catálogo e Inventario'),
(5, 'Cotizaciones y Servicios'),
(6, 'Ventas y Caja'),
(7, 'Órdenes de Trabajo'),
(8, 'Mantenimiento y Alertas')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 3. TABLA: ACCION (CU04)
-- ============================================================
INSERT INTO ACCION (id, nombre) VALUES
(1, 'CREAR'),
(2, 'LEER'),
(3, 'ACTUALIZAR'),
(4, 'ELIMINAR'),
(5, 'PROCESAR')
ON CONFLICT (nombre) DO NOTHING;

-- ============================================================
-- 4. TABLA: FUNCION (CU04)
-- ============================================================
INSERT INTO FUNCION (id, modulo_id, nombre, descripcion) VALUES
-- Módulo 1: Seguridad
(1, 1, 'Usuarios', 'Gestión integral de usuarios del sistema'),
(2, 1, 'Roles y Permisos', 'Administración de la matriz RBAC'),
(3, 1, 'Bitácora', 'Consulta de logs de auditoría'),
-- Módulo 2: Personal Técnico
(4, 2, 'Jornadas y Bloqueos', 'Parametrización de turnos y ausencias'),
-- Módulo 3: Clientes
(5, 3, 'Clientes', 'Gestión del directorio y sucursales'),
-- Módulo 4: Catálogo
(6, 4, 'Catálogo e Inventario', 'Gestión de productos, stock y proveedores'),
-- Módulo 5: Cotizaciones
(7, 5, 'Cotizaciones', 'Elaboración de proformas en PDF'),
-- Módulo 6: Ventas
(8, 6, 'Caja y Ventas', 'Control de turnos y ventas en mostrador'),
-- Módulo 7: Órdenes de Trabajo
(9, 7, 'Órdenes de Trabajo', 'Despacho y reporte técnico'),
-- Módulo 8: Mantenimiento
(10, 8, 'Mantenimiento y Tickets', 'Historial técnico de equipos y alertas')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. TABLA: ROL_FUNCION (Matriz de Permisos RBAC - CU04)
-- ============================================================
-- ADMINISTRADOR: acceso total (todas las combinaciones función × acción)
INSERT INTO ROL_FUNCION (rol_id, funcion_id, accion_id, descripcion)
SELECT 1, f.id, a.id, 'Acceso total'
FROM FUNCION f
CROSS JOIN ACCION a
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

-- ENCARGADO (Gestión comercial y operativa)
INSERT INTO ROL_FUNCION (rol_id, funcion_id, accion_id, descripcion) VALUES
(2, 5, 1, 'Registrar clientes'),
(2, 5, 2, 'Consultar clientes'),
(2, 5, 3, 'Actualizar clientes'),
(2, 6, 2, 'Ver stock de inventario'),
(2, 7, 1, 'Generar cotizaciones'),
(2, 7, 2, 'Consultar cotizaciones'),
(2, 7, 5, 'Aprobar cotización a Orden de Trabajo'),
(2, 8, 1, 'Apertura de turno de caja'),
(2, 8, 5, 'Cierre y arqueo de caja'),
(2, 9, 1, 'Crear y asignar órdenes de trabajo'),
(2, 9, 2, 'Monitorear avance de órdenes')
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

-- TECNICO (Acceso operativo en campo)
INSERT INTO ROL_FUNCION (rol_id, funcion_id, accion_id, descripcion) VALUES
(3, 9, 2, 'Consultar órdenes de trabajo asignadas'),
(3, 9, 3, 'Actualizar estados y registrar avance en campo'),
(3, 9, 5, 'Declarar consumo real de materiales'),
(3, 10, 2, 'Consultar hoja de vida de sistemas')
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

-- ============================================================
-- 5B. TABLA: PERMISO / ROL_PERMISO (RBAC por RUTAS - menú y protección)
-- La interfaz lee aquí qué módulos puede ver cada rol. Matriz por defecto:
--   ADMINISTRADOR: 8/8 módulos
--   ENCARGADO:     perfil, cotizaciones, órdenes de trabajo, caja, ventas
--   TECNICO:       perfil, cotizaciones (lectura), órdenes de trabajo
-- ============================================================
INSERT INTO PERMISO (id, nombre, ruta, descripcion) VALUES
(1, 'PERFIL', '/perfil', 'Configuración de perfil personal'),
(2, 'USUARIOS', '/usuarios', 'Gestión de usuarios del sistema'),
(3, 'ROLES', '/roles', 'Administración de roles y permisos'),
(4, 'BITACORA', '/bitacora', 'Consulta de auditoría de eventos'),
(5, 'COTIZACIONES', '/cotizaciones', 'Cotizaciones y servicios'),
(6, 'ORDENES_TRABAJO', '/ordenes-trabajo', 'Órdenes de trabajo'),
(7, 'CAJA', '/caja', 'Control y arqueo de caja'),
(8, 'VENTAS', '/ventas', 'Registro de ventas')
ON CONFLICT (nombre) DO NOTHING;

-- ADMINISTRADOR: acceso total (todos los módulos)
INSERT INTO ROL_PERMISO (rol_id, permiso_id, descripcion) VALUES
(1, 1, 'Acceso total'), (1, 2, 'Acceso total'), (1, 3, 'Acceso total'),
(1, 4, 'Acceso total'), (1, 5, 'Acceso total'), (1, 6, 'Acceso total'),
(1, 7, 'Acceso total'), (1, 8, 'Acceso total')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- ENCARGADO: módulos operativos (NO /usuarios, /roles, /bitacora)
INSERT INTO ROL_PERMISO (rol_id, permiso_id, descripcion) VALUES
(2, 1, 'Módulo propio'), (2, 5, 'Cotizaciones y servicios'),
(2, 6, 'Órdenes de trabajo'), (2, 7, 'Caja'), (2, 8, 'Ventas')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- TECNICO: cotizaciones (lectura), órdenes de trabajo y perfil
INSERT INTO ROL_PERMISO (rol_id, permiso_id, descripcion) VALUES
(3, 1, 'Módulo propio'), (3, 5, 'Cotizaciones (solo lectura)'),
(3, 6, 'Órdenes de trabajo')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- ============================================================
-- 6. TABLA: USUARIO (CU01, CU03, CU05)
-- Contraseña temporal "Admin1234!" (bcrypt cost 10). ¡Cambiar al ingresar!
-- ============================================================
INSERT INTO USUARIO (id, rol_id, nombre, correo, contrasena, telefono, estado) VALUES
-- Administrador / Gerencia
(1, 1, 'Jaime Garnica Soria', 'gerencia@sgarnet.bo', '$2b$10$M7tGGHXeJ5YvI6aTcg4MYecqIAph17/pPvg/m3xQIwee.noZlJ.mq', '70001001', TRUE),
-- Encargada Comercial y Caja
(2, 2, 'Mariela Morales Vega', 'administracion@sgarnet.bo', '$2b$10$M7tGGHXeJ5YvI6aTcg4MYecqIAph17/pPvg/m3xQIwee.noZlJ.mq', '70001002', TRUE),
-- Técnicos Operativos en Campo
(3, 3, 'Juan Carlos Pérez', 'jperez@sgarnet.bo', '$2b$10$M7tGGHXeJ5YvI6aTcg4MYecqIAph17/pPvg/m3xQIwee.noZlJ.mq', '70001003', TRUE),
(4, 3, 'Pedro Ramírez Justiniano', 'pramirez@sgarnet.bo', '$2b$10$M7tGGHXeJ5YvI6aTcg4MYecqIAph17/pPvg/m3xQIwee.noZlJ.mq', '70001004', TRUE),
(5, 3, 'Luis Fernández Arce', 'lfernandez@sgarnet.bo', '$2b$10$M7tGGHXeJ5YvI6aTcg4MYecqIAph17/pPvg/m3xQIwee.noZlJ.mq', '70001005', TRUE),
(6, 3, 'Diego Castillo Montaño', 'dcastillo@sgarnet.bo', '$2b$10$M7tGGHXeJ5YvI6aTcg4MYecqIAph17/pPvg/m3xQIwee.noZlJ.mq', '70001006', TRUE)
ON CONFLICT (correo) DO NOTHING;

-- ============================================================
-- 7. TABLA: TOKEN_RECUPERACION (CU02)
-- ============================================================
INSERT INTO TOKEN_RECUPERACION (id, usuario_id, hash_token, fecha_creacion, fecha_expiracion, usado) VALUES
(1, 3, encode(sha256('tok_rec_8f3a9b2c1d4e5f6a7b8c9d0e1f2a3b4c'::bytea), 'hex'), '2026-09-20 08:30:00', '2026-09-20 09:30:00', TRUE),
(2, 6, encode(sha256('tok_rec_5d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a'::bytea), 'hex'), '2026-09-27 15:00:00', '2026-09-27 17:00:00', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. TABLA: BITACORA (Auditoría de eventos sensibles - CU06)
-- ============================================================
INSERT INTO BITACORA (id, usuario_id, fecha_hora, accion, descripcion) VALUES
(1, 1, '2026-09-01 08:00:00', 'INICIO_SESION', 'Inicio de sesión exitoso del usuario Administrador'),
(2, 1, '2026-09-01 08:15:00', 'CONFIG_ROLES', 'Parametrización inicial de matriz de permisos por roles'),
(3, 1, '2026-09-01 08:45:00', 'CREAR_USUARIO', 'Alta de usuario Mariela Morales Vega con rol ENCARGADO'),
(4, 1, '2026-09-01 09:00:00', 'CREAR_USUARIO', 'Alta de cuadrilla técnica (usuarios: jperez, pramirez, lfernandez, dcastillo)'),
(5, 2, '2026-09-02 08:30:00', 'INICIO_SESION', 'Inicio de sesión de Encargado de ventas y operaciones'),
(6, 3, '2026-09-20 08:28:00', 'SOLICITUD_RECUPERACION', 'Solicitud de enlace para restablecimiento de contraseña generada'),
(7, 3, '2026-09-20 08:40:00', 'CAMBIO_PASSWORD', 'Restablecimiento exitoso de contraseña mediante token seguro'),
(8, 2, '2026-09-26 18:00:00', 'CIERRE_SESION', 'Cierre regular de sesión en terminal de recepción'),
(9, 1, '2026-09-27 09:00:00', 'AUDITORIA_BITACORA', 'Consulta general de registros de bitácora y accesos sensibles')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SINCRONIZACIÓN DE SECUENCIAS (PostgreSQL SERIAL)
-- ============================================================
SELECT setval(pg_get_serial_sequence('ROL', 'id'), COALESCE(MAX(id), 1)) FROM ROL;
SELECT setval(pg_get_serial_sequence('MODULO', 'id'), COALESCE(MAX(id), 1)) FROM MODULO;
SELECT setval(pg_get_serial_sequence('PERMISO', 'id'), COALESCE(MAX(id), 1)) FROM PERMISO;
SELECT setval(pg_get_serial_sequence('ROL_PERMISO', 'id'), COALESCE(MAX(id), 1)) FROM ROL_PERMISO;
SELECT setval(pg_get_serial_sequence('ACCION', 'id'), COALESCE(MAX(id), 1)) FROM ACCION;
SELECT setval(pg_get_serial_sequence('FUNCION', 'id'), COALESCE(MAX(id), 1)) FROM FUNCION;
SELECT setval(pg_get_serial_sequence('ROL_FUNCION', 'id'), COALESCE(MAX(id), 1)) FROM ROL_FUNCION;
SELECT setval(pg_get_serial_sequence('USUARIO', 'id'), COALESCE(MAX(id), 1)) FROM USUARIO;
SELECT setval(pg_get_serial_sequence('TOKEN_RECUPERACION', 'id'), COALESCE(MAX(id), 1)) FROM TOKEN_RECUPERACION;
SELECT setval(pg_get_serial_sequence('BITACORA', 'id'), COALESCE(MAX(id), 1)) FROM BITACORA;

COMMIT;