-- =====================================================================
--  SmartService - RBAC UNIFICADO EN ROL_FUNCION  (PASO 2 de 2)
--
--  Borra PERMISO y ROL_PERMISO. Ejecutar SOLO después de:
--    1. migracion_rbac_unificado.sql (paso 1),
--    2. desplegar el código que lee ROL_FUNCION (lib/permisos.ts y /roles),
--    3. comprobar que cada rol entra a los mismos módulos que antes
--       (consulta de verificación al final del paso 1).
--
--  Si una consulta del paso 1 no coincide, NO ejecutar este paso.
-- =====================================================================
BEGIN;

-- Seguridad: no borrar si algún permiso quedó sin su FUNCION
DO $$
BEGIN
    IF to_regclass('public.permiso') IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.permiso p
         WHERE NOT EXISTS (SELECT 1 FROM public.funcion f WHERE f.clave = p.nombre)
    ) THEN
        RAISE EXCEPTION 'Hay permisos sin FUNCION: ejecute primero migracion_rbac_unificado.sql';
    END IF;
END $$;

DROP TABLE IF EXISTS public.rol_permiso;
DROP TABLE IF EXISTS public.permiso;

COMMIT;
