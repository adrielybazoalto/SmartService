-- =====================================================================
--  SmartService - CU18 Gestionar Tickets de Soporte y Mantenimientos
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente. Sin tablas ni columnas nuevas.
--
--  Contiene:
--   1. RBAC: la FUNCION 10 "Mantenimiento y Tickets" pasa a ser el módulo
--      MANTENIMIENTO_TICKETS (/tickets-soporte); el ENCARGADO recibe LEER,
--      CREAR y ACTUALIZAR (el ADMINISTRADOR y el TECNICO ya los tienen).
--   2. CHECK de estado, tipo y urgencia en MANTENIMIENTO_TICKET.
--   3. fn_derivar_ticket_orden: deriva un ticket a una Orden de Trabajo en
--      UNA transacción, reutilizando fn_crear_orden_trabajo (CU12).
--
--  Va junto con src/lib/navigation.ts (P4 habilitado). Aplicar el SQL ANTES
--  de usar ese código: sin él nadie entra a /tickets-soporte.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. RBAC
-- ---------------------------------------------------------------------
UPDATE public.funcion
   SET clave = 'MANTENIMIENTO_TICKETS', ruta = '/tickets-soporte'
 WHERE id = 10 AND nombre = 'Mantenimiento y Tickets' AND clave IS NULL;

INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
SELECT r.id, f.id, a.id, 'Tickets de soporte (CU18)'
  FROM public.rol r, public.funcion f, public.accion a
 WHERE r.nombre IN ('ADMINISTRADOR', 'ENCARGADO')
   AND f.clave = 'MANTENIMIENTO_TICKETS'
   AND a.nombre IN ('LEER', 'CREAR', 'ACTUALIZAR')
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
SELECT r.id, f.id, a.id, 'Tickets de soporte (CU18) - consulta'
  FROM public.rol r, public.funcion f, public.accion a
 WHERE r.nombre = 'TECNICO'
   AND f.clave = 'MANTENIMIENTO_TICKETS'
   AND a.nombre = 'LEER'
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2. CHECK del ticket (la tabla estaba vacía al crear la migración)
-- ---------------------------------------------------------------------
ALTER TABLE public.mantenimiento_ticket DROP CONSTRAINT IF EXISTS chk_ticket_estado;
ALTER TABLE public.mantenimiento_ticket ADD CONSTRAINT chk_ticket_estado
    CHECK (estado IN ('ABIERTO', 'EN_PROCESO', 'RESUELTO', 'CANCELADO'));

ALTER TABLE public.mantenimiento_ticket DROP CONSTRAINT IF EXISTS chk_ticket_tipo;
ALTER TABLE public.mantenimiento_ticket ADD CONSTRAINT chk_ticket_tipo
    CHECK (tipo_mantenimiento IN ('PREVENTIVO', 'CORRECTIVO'));

ALTER TABLE public.mantenimiento_ticket DROP CONSTRAINT IF EXISTS chk_ticket_urgencia;
ALTER TABLE public.mantenimiento_ticket ADD CONSTRAINT chk_ticket_urgencia
    CHECK (nivel_urgencia IS NULL OR nivel_urgencia IN ('BAJA', 'MEDIA', 'ALTA', 'CRITICA'));

ALTER TABLE public.mantenimiento_ticket DROP CONSTRAINT IF EXISTS chk_ticket_descripcion;
ALTER TABLE public.mantenimiento_ticket ADD CONSTRAINT chk_ticket_descripcion
    CHECK (btrim(descripcion_incidencia) <> '');


-- ---------------------------------------------------------------------
-- 3. Derivar ticket a Orden de Trabajo
-- ---------------------------------------------------------------------
--    Bloquea el ticket (dos derivaciones simultáneas no crean dos OT), crea
--    la OT con fn_crear_orden_trabajo (correlativo OT-AAAA-NNN y su bitácora),
--    la vincula por mantenimiento_ticket_id, deja el ticket EN_PROCESO y
--    registra DERIVAR_TICKET_ORDEN. Si algo falla, no queda nada a medias.
CREATE OR REPLACE FUNCTION public.fn_derivar_ticket_orden(
    p_usuario_id INTEGER,
    p_ticket_id  INTEGER,
    p_inicio     TIMESTAMP,
    p_fin        TIMESTAMP,
    p_ip         TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_ticket  public.mantenimiento_ticket%ROWTYPE;
    v_codigo  TEXT;
    v_tk      TEXT;
    v_creada  jsonb;
    v_orden   public.orden_trabajo%ROWTYPE;
BEGIN
    SELECT * INTO v_ticket FROM public.mantenimiento_ticket WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró el ticket';
    END IF;

    v_tk := 'TK-' || to_char(v_ticket.fecha_reporte, 'YYYY') || '-' || lpad(v_ticket.id::TEXT, 3, '0');

    SELECT codigo_orden INTO v_codigo FROM public.orden_trabajo WHERE mantenimiento_ticket_id = p_ticket_id;
    IF FOUND THEN
        RAISE EXCEPTION 'El ticket % ya fue derivado a la Orden de Trabajo %', v_tk, v_codigo;
    END IF;

    IF v_ticket.estado NOT IN ('ABIERTO', 'EN_PROCESO') THEN
        RAISE EXCEPTION 'Solo se pueden derivar tickets abiertos o en proceso';
    END IF;

    v_creada := public.fn_crear_orden_trabajo(
        p_usuario_id,
        NULL,
        'MANTENIMIENTO ' || v_ticket.tipo_mantenimiento,
        p_inicio,
        p_fin,
        p_ip,
        'Ticket ' || v_tk || ': ' || v_ticket.descripcion_incidencia
    );

    UPDATE public.orden_trabajo
       SET mantenimiento_ticket_id = p_ticket_id
     WHERE id = (v_creada ->> 'id')::INTEGER
    RETURNING * INTO v_orden;

    UPDATE public.mantenimiento_ticket
       SET estado = 'EN_PROCESO'
     WHERE id = p_ticket_id AND estado = 'ABIERTO';

    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        'DERIVAR_TICKET_ORDEN',
        'Se derivó el ticket ' || v_tk || ' a la Orden de Trabajo ' || v_orden.codigo_orden,
        p_ip
    );

    RETURN to_jsonb(v_orden);
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.fn_derivar_ticket_orden(INTEGER, INTEGER, TIMESTAMP, TIMESTAMP, TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_derivar_ticket_orden(INTEGER, INTEGER, TIMESTAMP, TIMESTAMP, TEXT) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_derivar_ticket_orden(INTEGER, INTEGER, TIMESTAMP, TIMESTAMP, TEXT) TO service_role;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verificación (ejecutar aparte):
-- SELECT id, clave, ruta FROM funcion WHERE id = 10;           -- MANTENIMIENTO_TICKETS, /tickets-soporte
-- SELECT r.nombre, string_agg(a.nombre, ',' ORDER BY a.nombre)
--   FROM rol_funcion rf JOIN rol r ON r.id = rf.rol_id JOIN accion a ON a.id = rf.accion_id
--  WHERE rf.funcion_id = 10 GROUP BY r.nombre;                 -- ENCARGADO: ACTUALIZAR,CREAR,LEER
-- SELECT conname FROM pg_constraint WHERE conrelid = 'mantenimiento_ticket'::regclass AND contype = 'c';
-- SELECT has_function_privilege('anon', 'public.fn_derivar_ticket_orden(integer,integer,timestamp,timestamp,text)', 'EXECUTE');  -- false
