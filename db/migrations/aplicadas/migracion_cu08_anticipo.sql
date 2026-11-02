-- =====================================================================
--  SmartService - CU08 Anticipo del 50 % al aprobar la cotización
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente. Ejecutar DESPUÉS de migracion_cu12_estados_orden.sql:
--  reemplaza sp_emitir_nota_servicio (no volver a ejecutar aquella después).
--
--  Contiene:
--   1. Columnas y restricciones del anticipo en COTIZACION (sin tablas nuevas).
--   2. fn_aprobar_cotizacion -> aprueba y registra el anticipo en UNA transacción.
--   3. sp_emitir_nota_servicio -> con cotización, el anticipo sale de la base.
--
--  Las cotizaciones ya aprobadas quedan con anticipo 0: no se inventan datos.
--  anticipo_fecha es TIMESTAMP sin zona, en hora de Bolivia.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Columnas del anticipo
-- ---------------------------------------------------------------------
ALTER TABLE public.cotizacion ADD COLUMN IF NOT EXISTS anticipo_monto      NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE public.cotizacion ADD COLUMN IF NOT EXISTS anticipo_metodo     VARCHAR(20);
ALTER TABLE public.cotizacion ADD COLUMN IF NOT EXISTS anticipo_referencia VARCHAR(60);
ALTER TABLE public.cotizacion ADD COLUMN IF NOT EXISTS anticipo_fecha      TIMESTAMP;
ALTER TABLE public.cotizacion ADD COLUMN IF NOT EXISTS anticipo_usuario_id INTEGER REFERENCES public.usuario(id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cotizacion_anticipo_monto') THEN
        ALTER TABLE public.cotizacion ADD CONSTRAINT chk_cotizacion_anticipo_monto
            CHECK (anticipo_monto >= 0 AND anticipo_monto <= total);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cotizacion_anticipo_metodo') THEN
        ALTER TABLE public.cotizacion ADD CONSTRAINT chk_cotizacion_anticipo_metodo
            CHECK (anticipo_metodo IS NULL OR anticipo_metodo IN ('EFECTIVO', 'QR', 'TRANSFERENCIA'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cotizacion_anticipo_completo') THEN
        ALTER TABLE public.cotizacion ADD CONSTRAINT chk_cotizacion_anticipo_completo
            CHECK (anticipo_monto = 0 OR (anticipo_metodo IS NOT NULL AND anticipo_fecha IS NOT NULL));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cotizacion_anticipo_referencia') THEN
        ALTER TABLE public.cotizacion ADD CONSTRAINT chk_cotizacion_anticipo_referencia
            CHECK (anticipo_metodo IS DISTINCT FROM 'TRANSFERENCIA'
                   OR nullif(btrim(anticipo_referencia), '') IS NOT NULL);
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 2. Aprobar la cotización y registrar el anticipo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_aprobar_cotizacion(
    p_usuario_id    INTEGER,
    p_cotizacion_id INTEGER,
    p_anticipo      NUMERIC,
    p_metodo        TEXT DEFAULT NULL,
    p_referencia    TEXT DEFAULT NULL,
    p_ip            TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_cot        public.cotizacion%ROWTYPE;
    v_hoy        DATE := (now() AT TIME ZONE 'America/La_Paz')::DATE;
    v_metodo     TEXT := upper(btrim(coalesce(p_metodo, '')));
    v_referencia TEXT := nullif(btrim(coalesce(p_referencia, '')), '');
BEGIN
    -- Bloquea la cotización: dos aprobaciones simultáneas no registran dos anticipos
    SELECT * INTO v_cot
      FROM public.cotizacion
     WHERE id = p_cotizacion_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La cotización no existe';
    END IF;

    IF v_cot.estado <> 'PENDIENTE' THEN
        RAISE EXCEPTION 'Solo se pueden aprobar cotizaciones en estado PENDIENTE';
    END IF;

    IF v_cot.fecha_vencimiento IS NOT NULL AND v_cot.fecha_vencimiento < v_hoy THEN
        RAISE EXCEPTION 'La cotización venció el %', to_char(v_cot.fecha_vencimiento, 'DD/MM/YYYY');
    END IF;

    IF p_anticipo IS NULL OR p_anticipo < 0 THEN
        RAISE EXCEPTION 'El anticipo no puede ser negativo';
    END IF;
    IF p_anticipo <> round(p_anticipo, 2) THEN
        RAISE EXCEPTION 'El anticipo admite como máximo 2 decimales';
    END IF;
    IF p_anticipo > v_cot.total THEN
        RAISE EXCEPTION 'El anticipo (%) no puede ser mayor al total de la cotización (%)', p_anticipo, v_cot.total;
    END IF;

    IF p_anticipo > 0 THEN
        IF v_metodo NOT IN ('EFECTIVO', 'QR', 'TRANSFERENCIA') THEN
            RAISE EXCEPTION 'Seleccione el método de pago del anticipo';
        END IF;
        IF v_metodo = 'TRANSFERENCIA' AND v_referencia IS NULL THEN
            RAISE EXCEPTION 'Ingrese el número de referencia de la transferencia';
        END IF;
        IF char_length(v_referencia) > 60 THEN
            RAISE EXCEPTION 'La referencia no puede superar 60 caracteres';
        END IF;
    END IF;

    UPDATE public.cotizacion
       SET estado              = 'APROBADA',
           anticipo_monto      = p_anticipo,
           anticipo_metodo     = CASE WHEN p_anticipo > 0 THEN v_metodo END,
           anticipo_referencia = CASE WHEN p_anticipo > 0 AND v_metodo = 'TRANSFERENCIA' THEN v_referencia END,
           anticipo_fecha      = CASE WHEN p_anticipo > 0 THEN now() AT TIME ZONE 'America/La_Paz' END,
           anticipo_usuario_id = CASE WHEN p_anticipo > 0 THEN p_usuario_id END
     WHERE id = p_cotizacion_id
     RETURNING * INTO v_cot;

    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        'APROBAR_COTIZACION',
        'Se aprobó la cotización ' || v_cot.numero_cotizacion || ' | total: ' || v_cot.total,
        p_ip
    );

    IF p_anticipo > 0 THEN
        INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
        VALUES (
            p_usuario_id,
            'REGISTRAR_ANTICIPO',
            'Anticipo de la cotización ' || v_cot.numero_cotizacion
                || ' | monto: ' || v_cot.anticipo_monto
                || ' | método: ' || v_cot.anticipo_metodo
                || coalesce(' | referencia: ' || v_cot.anticipo_referencia, ''),
            p_ip
        );
    END IF;

    RETURN to_jsonb(v_cot);
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.fn_aprobar_cotizacion(INTEGER, INTEGER, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_aprobar_cotizacion(INTEGER, INTEGER, NUMERIC, TEXT, TEXT, TEXT) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_aprobar_cotizacion(INTEGER, INTEGER, NUMERIC, TEXT, TEXT, TEXT) TO service_role;
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 3. Emitir la nota: con cotización, el anticipo sale de la base
-- ---------------------------------------------------------------------
--    p_anticipo solo se usa en órdenes sin cotización (correctivas). Si el
--    anticipo registrado supera el total liquidado, se aplica hasta el total
--    y la nota queda PAGADA con saldo 0.
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
    v_estado        VARCHAR;
    v_codigo        VARCHAR;
    v_cotizacion_id INTEGER;
    v_registrado    NUMERIC;
    v_anticipo      NUMERIC;
    v_excedente     NUMERIC := 0;
    v_liq           RECORD;
    v_anio          TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
    v_secuencia     INTEGER;
    v_numero        VARCHAR;
    v_nota          nota_servicio;
BEGIN
    -- Bloquea la orden para evitar dos emisiones simultáneas
    SELECT ot.estado, ot.codigo_orden, ot.cotizacion_id
      INTO v_estado, v_codigo, v_cotizacion_id
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

    IF v_cotizacion_id IS NOT NULL THEN
        SELECT c.anticipo_monto INTO v_registrado FROM cotizacion c WHERE c.id = v_cotizacion_id;
        v_anticipo  := LEAST(v_registrado, v_liq.total_liquidacion);
        v_excedente := v_registrado - v_anticipo;
    ELSE
        IF p_anticipo IS NULL OR p_anticipo < 0 THEN
            RAISE EXCEPTION 'El anticipo no puede ser negativo';
        END IF;

        IF p_anticipo > v_liq.total_liquidacion THEN
            RAISE EXCEPTION 'El anticipo (%) no puede ser mayor al monto total (%)',
                p_anticipo, v_liq.total_liquidacion;
        END IF;
        v_anticipo := p_anticipo;
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
        p_orden_id, v_numero, v_anticipo,
        CURRENT_DATE,
        CASE WHEN v_anticipo >= v_liq.total_liquidacion THEN 'PAGADA' ELSE 'PENDIENTE' END,
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
            || ' | anticipo: ' || v_anticipo
            || ' | saldo: ' || (v_liq.total_liquidacion - v_anticipo)
            || CASE WHEN v_excedente > 0 THEN ' | anticipo excedente: ' || v_excedente ELSE '' END,
        p_ip
    );

    RETURN v_nota;
END;
$$;

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

-- Verificación (ejecutar aparte):
-- 5 columnas nuevas:
-- SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'cotizacion' AND column_name LIKE 'anticipo%';
-- 4 restricciones:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname LIKE 'chk_cotizacion_anticipo%';
-- Las ya aprobadas quedan en 0 (monto_distinto_de_0 = 0):
-- SELECT count(*) FILTER (WHERE anticipo_monto <> 0) AS monto_distinto_de_0, count(*) AS total FROM public.cotizacion;
-- Cerrada al navegador (anon = false, service_role = true):
-- SELECT has_function_privilege('anon', oid, 'EXECUTE') AS anon, has_function_privilege('service_role', oid, 'EXECUTE') AS service_role
--   FROM pg_proc WHERE proname = 'fn_aprobar_cotizacion';
-- Siguen 34 tablas:
-- SELECT count(*) FROM pg_tables WHERE schemaname = 'public';
