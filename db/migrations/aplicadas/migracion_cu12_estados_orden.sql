-- =====================================================================
--  SmartService - CU12 Estados de la orden de trabajo
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente. Ejecutar DESPUÉS de migracion_cu13_nota_servicio.sql.
--
--  Estados válidos: PROGRAMADA, EN_PROGRESO, FINALIZADA, CANCELADA.
--  COMPLETADA desaparece. fn_calcular_liquidacion no filtra por estado, así
--  que no cambia; sp_emitir_nota_servicio solo cambia en la excepción del CU13.
-- =====================================================================

BEGIN;

UPDATE public.orden_trabajo SET estado = 'FINALIZADA' WHERE estado = 'COMPLETADA';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orden_estado') THEN
    ALTER TABLE public.orden_trabajo ADD CONSTRAINT chk_orden_estado
      CHECK (estado IN ('PROGRAMADA','EN_PROGRESO','FINALIZADA','CANCELADA'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sp_emitir_nota_servicio(
    p_orden_id    INTEGER,
    p_anticipo    NUMERIC,
    p_usuario_id  INTEGER,
    p_ip          VARCHAR DEFAULT NULL,
    p_servicio_id INTEGER DEFAULT NULL
)
RETURNS nota_servicio
LANGUAGE plpgsql
AS $$
DECLARE
    v_estado     VARCHAR;
    v_codigo     VARCHAR;
    v_liq        RECORD;
    v_anio       TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
    v_secuencia  INTEGER;
    v_numero     VARCHAR;
    v_nota       nota_servicio;
BEGIN
    -- Bloquea la orden para evitar dos emisiones simultáneas
    SELECT ot.estado, ot.codigo_orden
      INTO v_estado, v_codigo
      FROM orden_trabajo ot
     WHERE ot.id = p_orden_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La orden de trabajo no existe';
    END IF;

    -- Excepción del CU13
    IF UPPER(COALESCE(v_estado, '')) <> 'FINALIZADA' THEN
        RAISE EXCEPTION 'No se puede liquidar una orden que no se encuentra en estado Finalizada';
    END IF;

    IF EXISTS (SELECT 1 FROM nota_servicio WHERE orden_trabajo_id = p_orden_id) THEN
        RAISE EXCEPTION 'La orden % ya tiene una nota de servicio emitida', v_codigo;
    END IF;

    SELECT * INTO v_liq FROM fn_calcular_liquidacion(p_orden_id, p_servicio_id);

    IF p_anticipo IS NULL OR p_anticipo < 0 THEN
        RAISE EXCEPTION 'El anticipo no puede ser negativo';
    END IF;

    IF p_anticipo > v_liq.total_liquidacion THEN
        RAISE EXCEPTION 'El anticipo (%) no puede ser mayor al monto total (%)',
            p_anticipo, v_liq.total_liquidacion;
    END IF;

    -- Número correlativo NS-AAAA-NNN (bloqueo para que no se repita)
    PERFORM pg_advisory_xact_lock(hashtext('nota_servicio_numero'));

    SELECT COALESCE(MAX(CAST(SPLIT_PART(ns.numero_nota, '-', 3) AS INTEGER)), 0) + 1
      INTO v_secuencia
      FROM nota_servicio ns
     WHERE ns.numero_nota ~ ('^NS-' || v_anio || '-[0-9]+$');

    v_numero := 'NS-' || v_anio || '-' || LPAD(v_secuencia::TEXT, 3, '0');

    INSERT INTO nota_servicio (
        orden_trabajo_id, numero_nota, anticipo_pagado,
        fecha_emision, estado, monto_total
    )
    VALUES (
        p_orden_id, v_numero, p_anticipo,
        CURRENT_DATE,
        CASE WHEN p_anticipo >= v_liq.total_liquidacion THEN 'PAGADA' ELSE 'PENDIENTE' END,
        v_liq.total_liquidacion
    )
    RETURNING * INTO v_nota;

    -- Bitácora (CU06)
    INSERT INTO bitacora (usuario_id, fecha_hora, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        NOW(),
        'EMITIR_NOTA_SERVICIO',
        'Nota ' || v_numero || ' de la orden ' || v_codigo
            || ' | total: ' || v_liq.total_liquidacion
            || ' | anticipo: ' || p_anticipo
            || ' | saldo: ' || (v_liq.total_liquidacion - p_anticipo),
        p_ip
    );

    RETURN v_nota;
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.sp_emitir_nota_servicio(INTEGER, NUMERIC, INTEGER, VARCHAR, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.sp_emitir_nota_servicio(INTEGER, NUMERIC, INTEGER, VARCHAR, INTEGER) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.sp_emitir_nota_servicio(INTEGER, NUMERIC, INTEGER, VARCHAR, INTEGER) TO service_role;
    END IF;
END $$;

COMMIT;

-- Verificación (ejecutar aparte): solo PROGRAMADA, EN_PROGRESO, FINALIZADA o CANCELADA
-- SELECT estado, count(*) FROM public.orden_trabajo GROUP BY estado;
