-- ============================================================
-- MIGRACIÓN CU17: Catálogo de Servicios Técnicos y Tarifas
-- Ejecutar en el SQL Editor de Supabase. IDEMPOTENTE.
-- Agrega: activo, UNIQUE(nombre), CHECK(tarifa > 0) y permiso SERVICIOS.
-- ============================================================
BEGIN;

-- 1) Estado del servicio (se desactiva/reactiva; nunca se elimina)
ALTER TABLE public.servicio
    ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

-- 2) Nombre único
ALTER TABLE public.servicio DROP CONSTRAINT IF EXISTS servicio_nombre_key;
ALTER TABLE public.servicio ADD CONSTRAINT servicio_nombre_key UNIQUE (nombre);

-- 3) Tarifa > 0 (se eliminan los dos nombres históricos del CHECK)
ALTER TABLE public.servicio DROP CONSTRAINT IF EXISTS chk_precio_hora;
ALTER TABLE public.servicio DROP CONSTRAINT IF EXISTS servicio_precio_hora_base_check;
ALTER TABLE public.servicio
    ADD CONSTRAINT chk_precio_hora CHECK (precio_hora_base > 0);

-- 4) Un DEFAULT 0 contradice CHECK > 0
ALTER TABLE public.servicio ALTER COLUMN precio_hora_base DROP DEFAULT;

-- 5) Permiso del módulo SERVICIOS (solo ADMINISTRADOR)
INSERT INTO public.permiso (id, nombre, ruta, descripcion)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM public.permiso),
       'SERVICIOS', '/servicios', 'Catálogo de servicios técnicos y tarifas'
WHERE NOT EXISTS (
    SELECT 1 FROM public.permiso WHERE nombre = 'SERVICIOS' OR ruta = '/servicios'
);

SELECT setval(pg_get_serial_sequence('public.permiso', 'id'), COALESCE(MAX(id), 1)) FROM public.permiso;
SELECT setval(pg_get_serial_sequence('public.rol_permiso', 'id'), COALESCE(MAX(id), 1)) FROM public.rol_permiso;

INSERT INTO public.rol_permiso (rol_id, permiso_id, descripcion)
SELECT r.id, p.id, 'Acceso total'
FROM public.rol r, public.permiso p
WHERE r.nombre = 'ADMINISTRADOR' AND p.nombre = 'SERVICIOS'
ON CONFLICT (rol_id, permiso_id) DO NOTHING;

COMMIT;

-- Verificación (opcional):
-- SELECT id, nombre, precio_hora_base, activo FROM servicio ORDER BY id;
-- SELECT p.nombre, rp.rol_id FROM permiso p JOIN rol_permiso rp ON rp.permiso_id = p.id WHERE p.nombre = 'SERVICIOS';