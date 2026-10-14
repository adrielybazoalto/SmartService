-- ============================================================
-- MIGRACIÓN RBAC (Permisos por Rol vía BD)
-- Ejecutar en el SQL Editor de Supabase (la BD en vivo ya existe).
-- IDEMPOTENTE: puede re-ejecutarse sin errores.
-- Crea PERMISO + ROL_PERMISO y siembra la matriz por defecto:
--   ADMINISTRADOR: 8/8 módulos | ENCARGADO: 5 | TECNICO: 3
-- ============================================================

-- 1) Tabla PERMISO (módulo/ruta)
CREATE TABLE IF NOT EXISTS public.permiso (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    ruta VARCHAR(100) NOT NULL UNIQUE,
    descripcion VARCHAR(255)
);

-- 2) Tabla ROL_PERMISO (matriz rol -> permiso)
CREATE TABLE IF NOT EXISTS public.rol_permiso (
    id SERIAL PRIMARY KEY,
    rol_id INTEGER NOT NULL,
    permiso_id INTEGER NOT NULL,
    descripcion VARCHAR(255),
    CONSTRAINT fk_rol_permiso_rol
        FOREIGN KEY (rol_id) REFERENCES public.rol(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_rol_permiso_permiso
        FOREIGN KEY (permiso_id) REFERENCES public.permiso(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT uq_rol_permiso UNIQUE (rol_id, permiso_id)
);

-- 3) Accesos del service role (PostgREST)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON TABLE public.permiso, public.rol_permiso TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.permiso_id_seq, public.rol_permiso_id_seq TO service_role;

-- 4) Catálogo de 8 permisos (rutas)
INSERT INTO public.permiso (id, nombre, ruta, descripcion) VALUES
(1, 'PERFIL', '/perfil', 'Configuración de perfil personal'),
(2, 'USUARIOS', '/usuarios', 'Gestión de usuarios del sistema'),
(3, 'ROLES', '/roles', 'Administración de roles y permisos'),
(4, 'BITACORA', '/bitacora', 'Consulta de auditoría de eventos'),
(5, 'COTIZACIONES', '/cotizaciones', 'Cotizaciones y servicios'),
(6, 'ORDENES_TRABAJO', '/ordenes-trabajo', 'Órdenes de trabajo'),
(7, 'CAJA', '/caja', 'Control y arqueo de caja'),
(8, 'VENTAS', '/ventas', 'Registro de ventas')
ON CONFLICT (nombre) DO NOTHING;

-- 5) Matriz por defecto
-- ADMINISTRADOR (rol 1): acceso total
INSERT INTO public.rol_permiso (rol_id, permiso_id, descripcion) VALUES
(1, 1, 'Acceso total'), (1, 2, 'Acceso total'), (1, 3, 'Acceso total'),
(1, 4, 'Acceso total'), (1, 5, 'Acceso total'), (1, 6, 'Acceso total'),
(1, 7, 'Acceso total'), (1, 8, 'Acceso total')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- ENCARGADO (rol 2): módulos operativos
INSERT INTO public.rol_permiso (rol_id, permiso_id, descripcion) VALUES
(2, 1, 'Módulo propio'), (2, 5, 'Cotizaciones y servicios'),
(2, 6, 'Órdenes de trabajo'), (2, 7, 'Caja'), (2, 8, 'Ventas')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- TECNICO (rol 3): cotizaciones lectura + órdenes de trabajo + perfil
INSERT INTO public.rol_permiso (rol_id, permiso_id, descripcion) VALUES
(3, 1, 'Módulo propio'), (3, 5, 'Cotizaciones (solo lectura)'),
(3, 6, 'Órdenes de trabajo')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- 6) Sincronización de secuencias
SELECT setval(pg_get_serial_sequence('permiso', 'id'), COALESCE(MAX(id), 1)) FROM public.permiso;
SELECT setval(pg_get_serial_sequence('rol_permiso', 'id'), COALESCE(MAX(id), 1)) FROM public.rol_permiso;