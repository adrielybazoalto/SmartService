-- ============================================================
-- MIGRACIÓN RBAC — COMPLETAR MÓDULOS DEL CICLO 2 (menú lateral)
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- IDEMPOTENTE: puede re-ejecutarse sin errores. NO DESTRUCTIVA.
--
-- Garantiza que existan los PERMISOS DE RUTA de todos los casos de uso y que
-- el rol ADMINISTRADOR los tenga asignados (para que aparezcan en el menú y
-- en las tarjetas del Dashboard, que leen ROL_PERMISO ⋈ PERMISO):
--
--   PROVEEDORES (/proveedores) → CU14
--   COMPRAS     (/compras)     → CU15
--   INVENTARIO  (/inventario)  → CU16
--
-- CLIENTES (CU07) y SERVICIOS (CU17) ya los agregan sus propias migraciones.
--
-- NOTA: este script SOLO cubre el RBAC. El funcionamiento de las pantallas de
-- Compras e Inventario requiere además (en este orden):
--   1) migracion_cu16_inventario.sql
--   2) migracion_cu15_compras.sql
-- ============================================================

BEGIN;

-- 1) Catálogo de permisos de ruta (crea solo los que falten)
INSERT INTO public.permiso (nombre, ruta, descripcion)
SELECT v.nombre, v.ruta, v.descripcion
FROM (VALUES
    ('PROVEEDORES', '/proveedores', 'Gestión de proveedores y catálogo de mayoristas (CU14)'),
    ('COMPRAS',     '/compras',     'Registro de compras de equipos e insumos (CU15)'),
    ('INVENTARIO',  '/inventario',  'Inventario, kárdex y ajustes de stock (CU16)')
) AS v(nombre, ruta, descripcion)
WHERE NOT EXISTS (
    SELECT 1 FROM public.permiso p
    WHERE p.nombre = v.nombre OR p.ruta = v.ruta
);

-- 2) ADMINISTRADOR (rol 1): acceso total a los tres módulos
INSERT INTO public.rol_permiso (rol_id, permiso_id, descripcion)
SELECT r.id, p.id, 'Acceso total'
FROM public.rol r
CROSS JOIN public.permiso p
WHERE r.nombre = 'ADMINISTRADOR'
  AND p.nombre IN ('PROVEEDORES', 'COMPRAS', 'INVENTARIO')
  AND NOT EXISTS (
      SELECT 1 FROM public.rol_permiso rp
      WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );

-- 3) ENCARGADO (rol 2): módulos comerciales y de abastecimiento
INSERT INTO public.rol_permiso (rol_id, permiso_id, descripcion)
SELECT r.id, p.id, 'Módulos comerciales y de abastecimiento'
FROM public.rol r
CROSS JOIN public.permiso p
WHERE r.nombre = 'ENCARGADO'
  AND p.nombre IN ('PROVEEDORES', 'COMPRAS', 'INVENTARIO')
  AND NOT EXISTS (
      SELECT 1 FROM public.rol_permiso rp
      WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );

-- 4) Sincronización de secuencias
SELECT setval(pg_get_serial_sequence('public.permiso', 'id'), COALESCE(MAX(id), 1)) FROM public.permiso;
SELECT setval(pg_get_serial_sequence('public.rol_permiso', 'id'), COALESCE(MAX(id), 1)) FROM public.rol_permiso;

COMMIT;

-- ============================================================
-- VERIFICACIÓN (opcional): matriz final por rol
-- ============================================================
-- SELECT r.nombre AS rol, p.nombre AS modulo, p.ruta
-- FROM public.rol r
-- JOIN public.rol_permiso rp ON rp.rol_id = r.id
-- JOIN public.permiso p ON p.id = rp.permiso_id
-- ORDER BY r.id, p.id;
