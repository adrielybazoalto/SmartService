-- =====================================================================
--  SmartService - Matriz completa de acciones y guardado atómico (Fase 5)
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente. Sin tablas nuevas.
--  Aplicar ANTES de usar exigirPermiso: el código valida cada acción y hoy la
--  mayoría de los roles solo tiene LEER.
--
--  Contiene:
--   1. Las acciones que cada rol necesita (solo agrega; no quita ninguna).
--   2. fn_guardar_permisos_rol -> guarda la matriz de un rol en UNA transacción.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Matriz de acciones
-- ---------------------------------------------------------------------
-- ADMINISTRADOR: todas las acciones en todos los módulos
INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
SELECT r.id, f.id, a.id, 'Acceso total'
  FROM public.rol r
 CROSS JOIN public.funcion f
 CROSS JOIN public.accion a
 WHERE r.nombre = 'ADMINISTRADOR'
   AND f.clave IS NOT NULL
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

-- ENCARGADO: lo que ya hacía con el permiso de módulo y exige una acción propia.
-- No recibe ELIMINAR en cotizaciones: la Fase 8 quita esa operación.
INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
SELECT r.id, f.id, a.id, v.descripcion
  FROM (VALUES
    ('COTIZACIONES',     'ACTUALIZAR', 'Editar cotizaciones (CU08)'),
    ('PROVEEDORES',      'CREAR',      'Registrar proveedores (CU14)'),
    ('PROVEEDORES',      'ACTUALIZAR', 'Actualizar proveedores y catálogo (CU14)'),
    ('ASIGNAR_TECNICOS', 'ACTUALIZAR', 'Asignar y modificar cuadrillas (CU11)'),
    ('NOTAS_SERVICIO',   'CREAR',      'Emitir notas de servicio (CU13)'),
    ('NOTAS_SERVICIO',   'PROCESAR',   'Cobrar el saldo de la nota (CU13)')
  ) AS v(clave, accion, descripcion)
  JOIN public.rol r     ON r.nombre = 'ENCARGADO'
  JOIN public.funcion f ON f.clave = v.clave
  JOIN public.accion a  ON a.nombre = v.accion
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2. Guardar la matriz de un rol
-- ---------------------------------------------------------------------
--    Reemplaza las filas del rol en los módulos con clave; las funciones sin
--    clave (p. ej. Mantenimiento y Tickets) no se tocan. Cualquier error
--    revierte todo: el rol nunca queda con la matriz a medias.
--    Tener una acción implica LEER: sin LEER no se entra al módulo.
CREATE OR REPLACE FUNCTION public.fn_guardar_permisos_rol(
    p_usuario_id INTEGER,
    p_rol_id     INTEGER,
    p_permisos   JSONB,
    p_ip         TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_rol   public.rol%ROWTYPE;
    v_leer  INTEGER;
    v_total INTEGER;
BEGIN
    SELECT * INTO v_rol FROM public.rol WHERE id = p_rol_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El rol seleccionado no es válido';
    END IF;

    IF p_permisos IS NULL OR jsonb_typeof(p_permisos) <> 'array' THEN
        RAISE EXCEPTION 'La lista de permisos no es válida';
    END IF;

    SELECT id INTO v_leer FROM public.accion WHERE nombre = 'LEER';

    CREATE TEMP TABLE tmp_permisos (funcion_id INTEGER, accion_id INTEGER) ON COMMIT DROP;
    INSERT INTO tmp_permisos
    SELECT DISTINCT x.funcion_id, x.accion_id
      FROM jsonb_to_recordset(p_permisos) AS x(funcion_id INTEGER, accion_id INTEGER);

    IF EXISTS (
        SELECT 1 FROM tmp_permisos t
          LEFT JOIN public.funcion f ON f.id = t.funcion_id AND f.clave IS NOT NULL
          LEFT JOIN public.accion a  ON a.id = t.accion_id
         WHERE f.id IS NULL OR a.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Uno o más permisos seleccionados no existen en el sistema';
    END IF;

    INSERT INTO tmp_permisos
    SELECT DISTINCT t.funcion_id, v_leer FROM tmp_permisos t
    EXCEPT SELECT funcion_id, accion_id FROM tmp_permisos;

    -- El Administrador no puede perder Roles ni Usuarios: se quedaría sin poder corregirlo
    IF v_rol.nombre = 'ADMINISTRADOR' AND (
        SELECT count(*) FROM tmp_permisos t
          JOIN public.funcion f ON f.id = t.funcion_id
          JOIN public.accion a  ON a.id = t.accion_id
         WHERE f.clave IN ('ROLES', 'USUARIOS') AND a.nombre IN ('LEER', 'ACTUALIZAR')
    ) < 4 THEN
        RAISE EXCEPTION 'El rol Administrador Principal no puede perder permisos del sistema';
    END IF;

    DELETE FROM public.rol_funcion rf
     USING public.funcion f
     WHERE rf.funcion_id = f.id
       AND rf.rol_id = p_rol_id
       AND f.clave IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tmp_permisos t
                        WHERE t.funcion_id = rf.funcion_id AND t.accion_id = rf.accion_id);

    INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
    SELECT p_rol_id, t.funcion_id, t.accion_id, 'Asignado desde /roles (Consola RBAC)'
      FROM tmp_permisos t
    ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

    SELECT count(*) INTO v_total FROM tmp_permisos;

    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        'CONFIGURAR_ROLES_PERMISOS',
        'Se guardaron ' || v_total || ' permiso(s) para el rol ' || v_rol.nombre,
        p_ip
    );

    RETURN v_total;
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.fn_guardar_permisos_rol(INTEGER, INTEGER, JSONB, TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_guardar_permisos_rol(INTEGER, INTEGER, JSONB, TEXT) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_guardar_permisos_rol(INTEGER, INTEGER, JSONB, TEXT) TO service_role;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verificación (ejecutar aparte): acciones por rol y módulo
-- SELECT r.nombre, f.clave, string_agg(a.nombre, ', ' ORDER BY a.nombre) AS acciones
--   FROM public.rol_funcion rf
--   JOIN public.rol r ON r.id = rf.rol_id
--   JOIN public.funcion f ON f.id = rf.funcion_id
--   JOIN public.accion a ON a.id = rf.accion_id
--  WHERE f.clave IS NOT NULL
--  GROUP BY r.nombre, f.clave ORDER BY r.nombre, f.clave;
