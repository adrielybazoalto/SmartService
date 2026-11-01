-- =====================================================================
--  SmartService - CU12 Crear orden de trabajo con correlativo en SQL (Fase 7)
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente (CREATE OR REPLACE FUNCTION). Sin tablas nuevas.
--
--  fn_crear_orden_trabajo crea las dos clases de orden en UNA transacción:
--   - con p_cotizacion_id: convierte una cotización APROBADA;
--   - sin él: orden correctiva (subflujo del CU12).
--  El código OT-AAAA-NNN se genera con un bloqueo: dos usuarios a la vez no
--  pueden obtener el mismo. La ventana llega en hora de Bolivia, sin zona.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_crear_orden_trabajo(
    p_usuario_id    INTEGER,
    p_cotizacion_id INTEGER,
    p_tipo_trabajo  TEXT,
    p_inicio        TIMESTAMP,
    p_fin           TIMESTAMP,
    p_ip            TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_estado  TEXT;
    v_tipo    TEXT := nullif(btrim(coalesce(p_tipo_trabajo, '')), '');
    v_anio    TEXT := to_char(now() AT TIME ZONE 'America/La_Paz', 'YYYY');
    v_prefijo TEXT := 'OT-' || v_anio || '-';
    v_seq     INTEGER;
    v_codigo  TEXT;
    v_orden   public.orden_trabajo%ROWTYPE;
BEGIN
    IF p_inicio IS NULL OR p_fin IS NULL THEN
        RAISE EXCEPTION 'La ventana horaria es obligatoria para crear la orden de trabajo';
    END IF;
    IF p_fin <= p_inicio THEN
        RAISE EXCEPTION 'La hora de fin programada debe ser posterior a la hora de inicio';
    END IF;

    IF p_cotizacion_id IS NOT NULL THEN
        -- Bloquea la cotización: dos conversiones simultáneas no crean dos órdenes
        SELECT estado INTO v_estado FROM public.cotizacion WHERE id = p_cotizacion_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'No se encontró la cotización';
        END IF;
        IF v_estado <> 'APROBADA' THEN
            RAISE EXCEPTION 'Solo se pueden convertir cotizaciones en estado APROBADA';
        END IF;

        SELECT codigo_orden INTO v_codigo FROM public.orden_trabajo WHERE cotizacion_id = p_cotizacion_id LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'Ya existe una Orden de Trabajo para esta cotización: %', v_codigo;
        END IF;
        v_tipo := coalesce(v_tipo, 'SERVICIO');
    ELSIF v_tipo IS NULL THEN
        RAISE EXCEPTION 'El tipo de trabajo es obligatorio';
    END IF;

    -- Correlativo OT-AAAA-NNN (bloqueo para que no se repita)
    PERFORM pg_advisory_xact_lock(hashtext('orden_trabajo_correlativo_' || v_anio));
    SELECT coalesce(max(split_part(codigo_orden, '-', 3)::INTEGER), 0) + 1 INTO v_seq
      FROM public.orden_trabajo
     WHERE codigo_orden ~ ('^' || v_prefijo || '[0-9]+$');
    v_codigo := v_prefijo || lpad(v_seq::TEXT, 3, '0');

    INSERT INTO public.orden_trabajo (
        cotizacion_id, codigo_orden, tipo_trabajo, estado, fecha_inicio_programada, fecha_fin_programada
    ) VALUES (
        p_cotizacion_id, v_codigo, v_tipo, 'PROGRAMADA', p_inicio, p_fin
    )
    RETURNING * INTO v_orden;

    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        'CREAR_ORDEN_TRABAJO',
        'Se creó la Orden de Trabajo ' || v_codigo
            || CASE WHEN p_cotizacion_id IS NULL THEN ' correctiva'
                    ELSE ' a partir de la cotización #' || p_cotizacion_id END
            || ' (Ventana: ' || to_char(p_inicio, 'YYYY-MM-DD HH24:MI')
            || ' a ' || to_char(p_fin, 'YYYY-MM-DD HH24:MI') || ')',
        p_ip
    );

    RETURN to_jsonb(v_orden);
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.fn_crear_orden_trabajo(INTEGER, INTEGER, TEXT, TIMESTAMP, TIMESTAMP, TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_crear_orden_trabajo(INTEGER, INTEGER, TEXT, TIMESTAMP, TIMESTAMP, TEXT) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_crear_orden_trabajo(INTEGER, INTEGER, TEXT, TIMESTAMP, TIMESTAMP, TEXT) TO service_role;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verificación (ejecutar aparte): anon = false, service_role = true
-- SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon,
--        has_function_privilege('service_role', oid, 'EXECUTE') AS service_role
--   FROM pg_proc WHERE proname = 'fn_crear_orden_trabajo';
