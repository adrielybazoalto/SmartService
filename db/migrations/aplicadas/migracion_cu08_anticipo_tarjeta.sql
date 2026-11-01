-- =====================================================================
--  SmartService - CU08 Anticipo con tarjeta (Stripe, modo de prueba)
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente. Ejecutar DESPUÉS de migracion_cu08_anticipo.sql.
--
--  La cotización se aprueba SOLO cuando Stripe confirmó el pago. La misma
--  sesión no puede aprobar dos cotizaciones ni registrarse dos veces.
--  fn_aprobar_cotizacion sigue sin aceptar TARJETA: este método solo entra
--  por fn_aprobar_cotizacion_tarjeta.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Columna y restricciones
-- ---------------------------------------------------------------------
ALTER TABLE public.cotizacion ADD COLUMN IF NOT EXISTS anticipo_stripe_session_id VARCHAR(255) UNIQUE;

ALTER TABLE public.cotizacion DROP CONSTRAINT IF EXISTS chk_cotizacion_anticipo_metodo;
ALTER TABLE public.cotizacion ADD CONSTRAINT chk_cotizacion_anticipo_metodo
    CHECK (anticipo_metodo IS NULL OR anticipo_metodo IN ('EFECTIVO', 'QR', 'TRANSFERENCIA', 'TARJETA'));

-- Un anticipo con tarjeta siempre tiene su sesión de pago
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cotizacion_anticipo_tarjeta') THEN
        ALTER TABLE public.cotizacion ADD CONSTRAINT chk_cotizacion_anticipo_tarjeta
            CHECK (anticipo_metodo IS DISTINCT FROM 'TARJETA' OR anticipo_stripe_session_id IS NOT NULL);
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 2. Aprobar con el pago confirmado por Stripe
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_aprobar_cotizacion_tarjeta(
    p_usuario_id    INTEGER,
    p_cotizacion_id INTEGER,
    p_session_id    TEXT,
    p_monto_pagado  NUMERIC,
    p_ip            TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_cot public.cotizacion%ROWTYPE;
    v_hoy DATE := (now() AT TIME ZONE 'America/La_Paz')::DATE;
BEGIN
    IF p_session_id IS NULL OR p_session_id = '' THEN
        RAISE EXCEPTION 'Falta el código del pago con tarjeta';
    END IF;

    -- Dos confirmaciones del mismo pago al mismo tiempo: la segunda espera aquí
    PERFORM pg_advisory_xact_lock(hashtext('stripe_' || p_session_id));

    SELECT * INTO v_cot
      FROM public.cotizacion
     WHERE id = p_cotizacion_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La cotización no existe';
    END IF;

    -- Mismo pago confirmado otra vez (recargar la página): no se repite
    IF v_cot.anticipo_stripe_session_id = p_session_id THEN
        RETURN to_jsonb(v_cot);
    END IF;

    IF EXISTS (SELECT 1 FROM public.cotizacion c WHERE c.anticipo_stripe_session_id = p_session_id) THEN
        RAISE EXCEPTION 'Este pago ya fue usado en otra cotización';
    END IF;

    IF v_cot.estado <> 'PENDIENTE' THEN
        RAISE EXCEPTION 'Solo se pueden aprobar cotizaciones en estado PENDIENTE';
    END IF;

    IF v_cot.fecha_vencimiento IS NOT NULL AND v_cot.fecha_vencimiento < v_hoy THEN
        RAISE EXCEPTION 'La cotización venció el %', to_char(v_cot.fecha_vencimiento, 'DD/MM/YYYY');
    END IF;

    IF p_monto_pagado IS NULL OR p_monto_pagado <= 0 THEN
        RAISE EXCEPTION 'El monto pagado debe ser mayor a 0';
    END IF;
    IF p_monto_pagado > v_cot.total THEN
        RAISE EXCEPTION 'El anticipo (%) no puede ser mayor al total de la cotización (%)', p_monto_pagado, v_cot.total;
    END IF;

    UPDATE public.cotizacion
       SET estado                     = 'APROBADA',
           anticipo_monto             = p_monto_pagado,
           anticipo_metodo            = 'TARJETA',
           anticipo_stripe_session_id = p_session_id,
           anticipo_fecha             = now() AT TIME ZONE 'America/La_Paz',
           anticipo_usuario_id        = p_usuario_id
     WHERE id = p_cotizacion_id
     RETURNING * INTO v_cot;

    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        'APROBAR_COTIZACION',
        'Se aprobó la cotización ' || v_cot.numero_cotizacion || ' | total: ' || v_cot.total,
        p_ip
    );

    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        'REGISTRAR_ANTICIPO',
        'Anticipo de la cotización ' || v_cot.numero_cotizacion
            || ' | monto: ' || v_cot.anticipo_monto
            || ' | método: TARJETA'
            || ' | sesión: ' || p_session_id,
        p_ip
    );

    RETURN to_jsonb(v_cot);
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.fn_aprobar_cotizacion_tarjeta(INTEGER, INTEGER, TEXT, NUMERIC, TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_aprobar_cotizacion_tarjeta(INTEGER, INTEGER, TEXT, NUMERIC, TEXT) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_aprobar_cotizacion_tarjeta(INTEGER, INTEGER, TEXT, NUMERIC, TEXT) TO service_role;
    END IF;
END $$;

COMMIT;

-- Verificación (ejecutar aparte):
-- La columna y el UNIQUE:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--  WHERE conrelid = 'public.cotizacion'::regclass AND conname ~ 'anticipo';
-- Cerrada al navegador (anon = false, service_role = true):
-- SELECT has_function_privilege('anon', oid, 'EXECUTE') AS anon, has_function_privilege('service_role', oid, 'EXECUTE') AS service_role
--   FROM pg_proc WHERE proname = 'fn_aprobar_cotizacion_tarjeta';
-- Siguen 34 tablas:
-- SELECT count(*) FROM pg_tables WHERE schemaname = 'public';
