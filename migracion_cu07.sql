-- ============================================================
-- MIGRACIÓN CU07 — GESTIONAR CLIENTES Y ESTABLECIMIENTOS
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
-- IDEMPOTENTE: puede re-ejecutarse sin romper nada.
--
-- Incluye:
--   1) Tablas CLIENTE y ESTABLECIMIENTO (si la BD en vivo aún no las tiene)
--      + accesos del service role (PostgREST).
--   2) Permiso CLIENTES ('/clientes') y su matriz ROL_PERMISO:
--        ADMINISTRADOR: acceso total | ENCARGADO: clientes y establecimientos
-- ============================================================

-- 1) Tabla CLIENTE
CREATE TABLE IF NOT EXISTS public.cliente (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    tipo_cliente VARCHAR(30) NOT NULL,
    razon_social VARCHAR(200),
    documento_identidad VARCHAR(50) UNIQUE,
    correo VARCHAR(150),
    telefono VARCHAR(30),
    telefono_alternativo VARCHAR(30),
    fecha_registro DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 2) Tabla ESTABLECIMIENTO (vinculada a CLIENTE)
CREATE TABLE IF NOT EXISTS public.establecimiento (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL,
    nombre_establecimiento VARCHAR(150) NOT NULL,
    direccion VARCHAR(255) NOT NULL,
    tipo_inmueble VARCHAR(100),
    latitud NUMERIC(10,7),
    longitud NUMERIC(10,7),
    CONSTRAINT fk_establecimiento_cliente
        FOREIGN KEY (cliente_id)
        REFERENCES public.cliente(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

-- 3) Índices de rendimiento
CREATE INDEX IF NOT EXISTS idx_establecimiento_cliente ON public.establecimiento(cliente_id);

-- 4) Accesos del service role (PostgREST)
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON TABLE public.cliente, public.establecimiento TO service_role;
GRANT USAGE, SELECT ON SEQUENCE
    public.cliente_id_seq,
    public.establecimiento_id_seq
    TO service_role;

-- 5) Permiso CLIENTES (RBAC por rutas)
INSERT INTO public.permiso (id, nombre, ruta, descripcion) VALUES
(9, 'CLIENTES', '/clientes', 'Gestión de clientes y establecimientos')
ON CONFLICT (nombre) DO NOTHING;

-- 6) Matriz ROL_PERMISO por defecto
INSERT INTO public.rol_permiso (rol_id, permiso_id, descripcion) VALUES
(1, 9, 'Acceso total'),
(2, 9, 'Clientes y establecimientos')
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

-- 7) Sincronización de secuencias
SELECT setval(pg_get_serial_sequence('cliente', 'id'), COALESCE(MAX(id), 1)) FROM public.cliente;
SELECT setval(pg_get_serial_sequence('establecimiento', 'id'), COALESCE(MAX(id), 1)) FROM public.establecimiento;
SELECT setval(pg_get_serial_sequence('permiso', 'id'), COALESCE(MAX(id), 1)) FROM public.permiso;