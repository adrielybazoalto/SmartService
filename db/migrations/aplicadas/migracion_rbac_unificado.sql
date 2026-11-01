-- =====================================================================
--  SmartService - RBAC UNIFICADO EN ROL_FUNCION  (PASO 1 de 2)
--
--  Antes había dos modelos de permisos:
--    PERMISO + ROL_PERMISO              -> acceso a cada módulo (ruta)
--    MODULO + FUNCION + ACCION + ROL_FUNCION -> acciones (solo CU15 y CU16)
--
--  Desde ahora hay UNO solo: ROL_FUNCION.
--    MODULO   = paquete (Seguridad, Comercial, ...)
--    FUNCION  = módulo/pantalla: + clave (ej. VENTAS) + ruta (ej. /ventas)
--    ACCION   = CREAR, LEER, ACTUALIZAR, ELIMINAR, PROCESAR
--    ROL_FUNCION (rol_id, funcion_id, accion_id) = qué puede hacer cada rol.
--    Entrar a un módulo = tener la acción LEER sobre su FUNCION.
--
--  Este paso:
--    1. Agrega clave y ruta a FUNCION.
--    2. Pasa cada PERMISO a una FUNCION (la existente si ya hay una
--       equivalente, si no la crea en el módulo que le corresponde).
--    3. Pasa cada fila de ROL_PERMISO a ROL_FUNCION con la acción LEER.
--    4. Quita LEER donde el rol NO tenía el permiso de ruta (así nadie gana
--       acceso que antes no tenía).
--  NO borra PERMISO ni ROL_PERMISO: eso lo hace el PASO 2, después de probar.
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es seguro ejecutarlo más de una vez.
-- =====================================================================
BEGIN;

-- 1) FUNCION: clave y ruta del módulo -----------------------------------
ALTER TABLE public.funcion ADD COLUMN IF NOT EXISTS clave VARCHAR(100);
ALTER TABLE public.funcion ADD COLUMN IF NOT EXISTS ruta  VARCHAR(100);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_funcion_clave') THEN
        ALTER TABLE public.funcion ADD CONSTRAINT uq_funcion_clave UNIQUE (clave);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_funcion_ruta') THEN
        ALTER TABLE public.funcion ADD CONSTRAINT uq_funcion_ruta UNIQUE (ruta);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
         WHERE c.conrelid = 'public.rol_funcion'::regclass AND c.contype = 'u'
           AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
                  FROM pg_attribute a
                 WHERE a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey))
               = ARRAY['accion_id','funcion_id','rol_id']
    ) THEN
        ALTER TABLE public.rol_funcion
            ADD CONSTRAINT uq_rol_funcion UNIQUE (rol_id, funcion_id, accion_id);
    END IF;
END $$;

-- La acción LEER es la que da acceso al módulo
INSERT INTO public.accion (nombre)
SELECT 'LEER' WHERE NOT EXISTS (SELECT 1 FROM public.accion WHERE nombre = 'LEER');

-- 2) PERMISO -> FUNCION --------------------------------------------------
--    equivalencia: clave del permiso -> nombre de la FUNCION que ya existe
--    y, si hay que crearla, la FUNCION de referencia para elegir el MODULO.
CREATE TEMP TABLE equivalencia (clave text PRIMARY KEY, funcion_existente text, funcion_referencia text) ON COMMIT DROP;
INSERT INTO equivalencia VALUES
    ('USUARIOS',         'Usuarios',              'Usuarios'),
    ('ROLES',            'Roles y Permisos',      'Usuarios'),
    ('BITACORA',         'Bitácora',              'Usuarios'),
    ('PERFIL',           NULL,                    'Usuarios'),
    ('CLIENTES',         'Clientes',              'Clientes'),
    ('INVENTARIO',       'Catálogo e Inventario', 'Catálogo e Inventario'),
    ('PROVEEDORES',      NULL,                    'Catálogo e Inventario'),
    ('COMPRAS',          'Compras',               'Catálogo e Inventario'),
    ('COTIZACIONES',     'Cotizaciones',          'Cotizaciones'),
    ('SERVICIOS',        NULL,                    'Cotizaciones'),
    ('VENTAS',           'Caja y Ventas',         'Caja y Ventas'),
    ('CAJA',             NULL,                    'Caja y Ventas'),
    ('ORDENES_TRABAJO',  'Órdenes de Trabajo',    'Órdenes de Trabajo'),
    ('ASIGNAR_TECNICOS', NULL,                    'Órdenes de Trabajo'),
    ('NOTAS_SERVICIO',   NULL,                    'Órdenes de Trabajo');

DO $$
DECLARE
    p        record;
    v_func   integer;
    v_modulo integer;
BEGIN
    FOR p IN SELECT * FROM public.permiso ORDER BY id LOOP
        -- ¿ya está pasada?
        SELECT id INTO v_func FROM public.funcion WHERE clave = p.nombre OR ruta = p.ruta LIMIT 1;

        -- ¿hay una FUNCION equivalente sin clave?
        IF v_func IS NULL THEN
            SELECT f.id INTO v_func
              FROM public.funcion f
              JOIN equivalencia e ON e.funcion_existente = f.nombre
             WHERE e.clave = p.nombre AND f.clave IS NULL
             LIMIT 1;
        END IF;

        IF v_func IS NOT NULL THEN
            UPDATE public.funcion
               SET clave = p.nombre,
                   ruta  = p.ruta,
                   descripcion = COALESCE(descripcion, p.descripcion)
             WHERE id = v_func AND clave IS NULL;
        ELSE
            -- crear la FUNCION en el módulo de su referencia (o en el primero)
            SELECT f.modulo_id INTO v_modulo
              FROM public.funcion f
              JOIN equivalencia e ON e.funcion_referencia = f.nombre
             WHERE e.clave = p.nombre
             LIMIT 1;
            IF v_modulo IS NULL THEN
                SELECT MIN(id) INTO v_modulo FROM public.modulo;
            END IF;
            PERFORM setval(pg_get_serial_sequence('public.funcion', 'id'),
                           (SELECT COALESCE(MAX(id), 1) FROM public.funcion));
            INSERT INTO public.funcion (modulo_id, nombre, descripcion, clave, ruta)
            VALUES (v_modulo, INITCAP(LOWER(REPLACE(p.nombre, '_', ' '))),
                    p.descripcion, p.nombre, p.ruta);
        END IF;
    END LOOP;
END $$;

-- 3) ROL_PERMISO -> ROL_FUNCION con LEER ---------------------------------
SELECT setval(pg_get_serial_sequence('public.rol_funcion', 'id'),
              (SELECT COALESCE(MAX(id), 1) FROM public.rol_funcion));

INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
SELECT rp.rol_id, f.id, a.id, COALESCE(rp.descripcion, 'Acceso al módulo')
  FROM public.rol_permiso rp
  JOIN public.permiso p ON p.id = rp.permiso_id
  JOIN public.funcion f ON f.clave = p.nombre
  JOIN public.accion  a ON a.nombre = 'LEER'
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

-- 4) Mismo acceso que antes: LEER solo donde había permiso de ruta --------
DELETE FROM public.rol_funcion rf
 USING public.funcion f, public.accion a
 WHERE rf.funcion_id = f.id
   AND rf.accion_id  = a.id
   AND a.nombre = 'LEER'
   AND f.clave IS NOT NULL
   AND NOT EXISTS (
       SELECT 1
         FROM public.rol_permiso rp
         JOIN public.permiso p ON p.id = rp.permiso_id
        WHERE rp.rol_id = rf.rol_id AND p.nombre = f.clave
   );

COMMIT;

-- =====================================================================
-- VERIFICACIÓN (ejecutar aparte). Las dos consultas deben dar el MISMO
-- resultado: los módulos a los que entra cada rol, antes y ahora.
-- =====================================================================
-- Antes (ROL_PERMISO):
-- SELECT r.nombre AS rol, p.nombre AS modulo
--   FROM rol_permiso rp JOIN rol r ON r.id = rp.rol_id JOIN permiso p ON p.id = rp.permiso_id
--  ORDER BY 1, 2;
-- Ahora (ROL_FUNCION con LEER):
-- SELECT r.nombre AS rol, f.clave AS modulo
--   FROM rol_funcion rf JOIN rol r ON r.id = rf.rol_id
--   JOIN funcion f ON f.id = rf.funcion_id JOIN accion a ON a.id = rf.accion_id
--  WHERE a.nombre = 'LEER' AND f.clave IS NOT NULL
--  ORDER BY 1, 2;
