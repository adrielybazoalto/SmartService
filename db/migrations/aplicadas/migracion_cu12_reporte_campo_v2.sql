-- =====================================================================
--  SmartService - CU12 Reporte de campo (versión 2)
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente (CREATE OR REPLACE FUNCTION).
--  Reemplaza a la función de migracion_cu12_reporte_campo_rpc.sql, que
--  fallaba al declarar materiales: guardaba con ::TEXT columnas NUMERIC.
--
--  El stock y el kárdex se aplican con private.fn_kardex_aplicar («include»
--  CU12 → CU16). Todo o nada: cualquier error revierte la función completa.
--
--  Se mantiene SECURITY DEFINER con search_path vacío, igual que
--  fn_registrar_ajuste y fn_registrar_compra: service_role no tiene USAGE
--  sobre el esquema private, así que sin DEFINER no podría llamar al kárdex.
--  La función sigue cerrada por el REVOKE/GRANT del final.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_procesar_reporte_campo(
    p_orden_id    INTEGER,
    p_diagnostico TEXT,
    p_materiales  JSONB,
    p_usuario_id  INTEGER,
    p_ip          TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_orden      public.orden_trabajo%ROWTYPE;
    v_materiales JSONB := COALESCE(p_materiales, '[]'::jsonb);
    v_mat        JSONB;
    v_prod_id    INTEGER;
    v_cant       NUMERIC;
    v_obs        TEXT;
    v_consumo_id INTEGER;
    v_consumos   JSONB := '[]'::jsonb;
BEGIN
    PERFORM private.fn_exigir_llamada_servidor();

    IF jsonb_typeof(v_materiales) <> 'array' THEN
        RAISE EXCEPTION 'La lista de materiales no es válida';
    END IF;

    -- 1. Obtener y bloquear la orden de trabajo
    SELECT * INTO v_orden
      FROM public.orden_trabajo
     WHERE id = p_orden_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró la orden de trabajo con ID %', p_orden_id;
    END IF;

    IF v_orden.estado = 'FINALIZADA' THEN
        RAISE EXCEPTION 'La orden de trabajo % ya se encuentra finalizada', v_orden.codigo_orden;
    END IF;

    IF v_orden.estado <> 'EN_PROGRESO' OR v_orden.fecha_inicio_real IS NULL THEN
        RAISE EXCEPTION 'Debe iniciar la labor antes de reportar';
    END IF;

    -- Validar que el usuario (si es técnico) esté asignado a la orden
    IF EXISTS (
        SELECT 1
          FROM public.usuario u
          JOIN public.rol r ON r.id = u.rol_id
         WHERE u.id = p_usuario_id
           AND UPPER(r.nombre) LIKE '%TECNICO%'
    ) THEN
        IF NOT EXISTS (
            SELECT 1
              FROM public.orden_trabajo_tecnico
             WHERE orden_trabajo_id = p_orden_id
               AND usuario_id = p_usuario_id
        ) THEN
            RAISE EXCEPTION 'Acceso denegado: el técnico no está asignado a esta orden de trabajo';
        END IF;
    END IF;

    -- 2. Procesar cada material (orden fijo de bloqueo: evita interbloqueos)
    FOR v_mat IN
        SELECT m FROM jsonb_array_elements(v_materiales) AS m
         ORDER BY (m ->> 'producto_id')::INTEGER
    LOOP
        v_prod_id := (v_mat ->> 'producto_id')::INTEGER;
        v_cant    := (v_mat ->> 'cantidad_utilizada')::NUMERIC;
        v_obs     := v_mat ->> 'observacion';

        -- include CU16: valida el stock, lo descuenta y registra el kárdex
        PERFORM private.fn_kardex_aplicar(
            v_prod_id, p_usuario_id, 'SALIDA', 'CONSUMO_OT', v_cant,
            NULL, 'orden_trabajo:' || p_orden_id, NULL, v_obs
        );

        INSERT INTO public.detalle_consumo_material (
            orden_trabajo_id, producto_id, cantidad_utilizada, observacion
        ) VALUES (
            p_orden_id, v_prod_id, v_cant, v_obs
        ) RETURNING id INTO v_consumo_id;

        v_consumos := v_consumos || jsonb_build_array(jsonb_build_object(
            'id', v_consumo_id,
            'orden_trabajo_id', p_orden_id,
            'producto_id', v_prod_id,
            'cantidad_utilizada', v_cant,
            'observacion', v_obs
        ));
    END LOOP;

    -- 3. Actualizar la orden a FINALIZADA
    UPDATE public.orden_trabajo
       SET estado = 'FINALIZADA',
           fecha_fin_real = COALESCE(v_orden.fecha_fin_real, now() AT TIME ZONE 'America/La_Paz'),
           observaciones_tecnico = p_diagnostico
     WHERE id = p_orden_id
     RETURNING * INTO v_orden;

    -- 4. Registrar en bitácora
    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        'FINALIZAR_ORDEN_TRABAJO',
        'Se finalizó la Orden de Trabajo ' || v_orden.codigo_orden
            || ' con diagnóstico: ' || left(p_diagnostico, 100),
        p_ip
    );

    RETURN jsonb_build_object(
        'orden', to_jsonb(v_orden),
        'consumos', v_consumos
    );
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.fn_procesar_reporte_campo(INTEGER, TEXT, JSONB, INTEGER, TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_procesar_reporte_campo(INTEGER, TEXT, JSONB, INTEGER, TEXT) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_procesar_reporte_campo(INTEGER, TEXT, JSONB, INTEGER, TEXT) TO service_role;
    END IF;
END $$;

COMMIT;

-- Verificación (ejecutar aparte): definer = true, search_path vacío, sin ::TEXT
-- SELECT prosecdef, proconfig, prosrc LIKE '%::TEXT%' AS tiene_text, proacl
--   FROM pg_proc WHERE proname = 'fn_procesar_reporte_campo';
