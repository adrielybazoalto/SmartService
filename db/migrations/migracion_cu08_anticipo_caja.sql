-- =====================================================================
--  SmartService - CU08 · El anticipo de la cotización queda registrado en caja
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente. NO crea tablas ni columnas. Ejecutar DESPUÉS de
--  migracion_cu09_cu13_abonos.sql (reemplaza fn_tg_proteger_recibo).
--
--  Antes: fn_aprobar_cotizacion guardaba el anticipo solo en la
--  cotización (anticipo_monto, anticipo_metodo...). No pasaba por caja,
--  así que el efectivo del anticipo no entraba al arqueo del turno.
--
--  Ahora (mismo patrón que el abono del CU09):
--   * Al aprobar con anticipo se genera, en la MISMA transacción, una fila
--     de VENTA con tipo_comprobante 'RECIBO_ANTICIPO', ligada a la
--     cotización (cotizacion_id) y a la caja ABIERTA del usuario. Sin
--     detalle_venta: no mueve stock.
--   * EFECTIVO / QR / TRANSFERENCIA exigen turno de caja abierto: sin caja
--     no se aprueba ("Debe abrir un turno de caja antes de registrar el
--     anticipo").
--   * TARJETA (Stripe): el cobro ya lo hizo Stripe, así que no se rechaza;
--     si hay caja abierta queda el recibo (no suma al efectivo del arqueo).
--   * fn_cerrar_caja ya suma las ventas EMITIDAS en EFECTIVO de la caja:
--     el anticipo en efectivo entra solo al arqueo.
--   * La cotización sigue guardando anticipo_monto: la liquidación (CU13)
--     y los abonos (CU09) no cambian. fn_pagos_orden solo lee RECIBO_ABONO
--     y RECIBO_SALDO, así que el anticipo NO se cuenta dos veces.
--   * Un RECIBO_ANTICIPO no se puede anular (la cotización ya quedó
--     aprobada con ese anticipo).
--   * Los anticipos anteriores a esta migración no se pasan a caja: sus
--     turnos ya están cerrados. El CU20 los sigue leyendo de la cotización.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Interno: recibo del anticipo (VENTA sin detalle) en la caja abierta
--    Devuelve NULL solo si no hay caja y p_exigir_caja = FALSE (tarjeta).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_insertar_recibo_anticipo(
    p_usuario_id    INTEGER,
    p_cotizacion_id INTEGER,
    p_monto         NUMERIC,
    p_tipo_pago     TEXT,
    p_referencia    TEXT,
    p_session_id    TEXT DEFAULT NULL,
    p_exigir_caja   BOOLEAN DEFAULT TRUE
)
RETURNS public.venta
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_caja_id    INTEGER;
    v_cliente_id INTEGER;
    v_anio       TEXT := to_char((now() AT TIME ZONE 'America/La_Paz')::date, 'YYYY');
    v_seq        INTEGER;
    v_nro        TEXT;
    v_venta      public.venta;
BEGIN
    SELECT id INTO v_caja_id
      FROM public.caja
     WHERE usuario_id = p_usuario_id AND estado = 'ABIERTA'
     ORDER BY id DESC
     LIMIT 1
       FOR UPDATE;

    IF v_caja_id IS NULL THEN
        IF p_exigir_caja THEN
            RAISE EXCEPTION 'Debe abrir un turno de caja antes de registrar el anticipo';
        END IF;
        RETURN NULL;
    END IF;

    SELECT cliente_id INTO v_cliente_id FROM public.cotizacion WHERE id = p_cotizacion_id;

    -- Mismo correlativo que los recibos de abono/saldo: RC-AAAA-00001
    PERFORM pg_advisory_xact_lock(hashtext('venta_recibo_numero'));
    SELECT COALESCE(MAX(split_part(nro_comprobante, '-', 3)::INTEGER), 0) + 1 INTO v_seq
      FROM public.venta
     WHERE nro_comprobante ~ ('^RC-' || v_anio || '-[0-9]+$');
    v_nro := 'RC-' || v_anio || '-' || lpad(v_seq::TEXT, 5, '0');

    -- fecha_emision: CURRENT_TIMESTAMP (UTC), igual que el resto de VENTA
    INSERT INTO public.venta (caja_id, cliente_id, usuario_id, cotizacion_id, orden_trabajo_id,
                              tipo_comprobante, nro_comprobante, fecha_emision,
                              subtotal, descuento, total, estado, tipo_pago,
                              stripe_session_id, referencia_pago)
    VALUES (v_caja_id, v_cliente_id, p_usuario_id, p_cotizacion_id, NULL,
            'RECIBO_ANTICIPO', v_nro, CURRENT_TIMESTAMP,
            round(p_monto, 2), 0, round(p_monto, 2), 'EMITIDA', p_tipo_pago,
            p_session_id, NULLIF(btrim(COALESCE(p_referencia, '')), ''))
    RETURNING * INTO v_venta;

    RETURN v_venta;
END;
$$;


-- ---------------------------------------------------------------------
-- 2) Aprobar la cotización + anticipo + recibo en caja (UNA transacción)
--    Misma firma que antes: el código que la llama no cambia.
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
    v_recibo     public.venta;
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
        -- Turno de caja abierto: se verifica ANTES de aprobar
        IF NOT EXISTS (SELECT 1 FROM public.caja
                        WHERE usuario_id = p_usuario_id AND estado = 'ABIERTA') THEN
            RAISE EXCEPTION 'Debe abrir un turno de caja antes de registrar el anticipo';
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

    IF p_anticipo > 0 THEN
        v_recibo := public.fn_insertar_recibo_anticipo(
            p_usuario_id, p_cotizacion_id, p_anticipo, v_metodo, v_referencia);
    END IF;

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
                || coalesce(' | referencia: ' || v_cot.anticipo_referencia, '')
                || ' | recibo: ' || v_recibo.nro_comprobante
                || ' | caja: ' || v_recibo.caja_id,
            p_ip
        );
    END IF;

    RETURN to_jsonb(v_cot) || jsonb_build_object(
        'recibo_id',       v_recibo.id,
        'recibo_nro',      v_recibo.nro_comprobante,
        'recibo_caja_id',  v_recibo.caja_id);
END;
$$;


-- ---------------------------------------------------------------------
-- 3) Aprobar con tarjeta (Stripe ya cobró): recibo solo si hay caja abierta
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
    v_cot    public.cotizacion%ROWTYPE;
    v_hoy    DATE := (now() AT TIME ZONE 'America/La_Paz')::DATE;
    v_recibo public.venta;
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
        SELECT * INTO v_recibo FROM public.venta
         WHERE stripe_session_id = p_session_id AND tipo_comprobante = 'RECIBO_ANTICIPO';
        RETURN to_jsonb(v_cot) || jsonb_build_object(
            'recibo_id', v_recibo.id, 'recibo_nro', v_recibo.nro_comprobante,
            'recibo_caja_id', v_recibo.caja_id, 'ya_registrado', true);
    END IF;

    IF EXISTS (SELECT 1 FROM public.cotizacion c WHERE c.anticipo_stripe_session_id = p_session_id)
       OR EXISTS (SELECT 1 FROM public.venta v WHERE v.stripe_session_id = p_session_id) THEN
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

    v_recibo := public.fn_insertar_recibo_anticipo(
        p_usuario_id, p_cotizacion_id, p_monto_pagado, 'TARJETA', NULL, p_session_id, FALSE);

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
            || ' | sesión: ' || p_session_id
            || coalesce(' | recibo: ' || v_recibo.nro_comprobante || ' | caja: ' || v_recibo.caja_id,
                        ' | sin turno de caja abierto: sin recibo'),
        p_ip
    );

    RETURN to_jsonb(v_cot) || jsonb_build_object(
        'recibo_id',      v_recibo.id,
        'recibo_nro',     v_recibo.nro_comprobante,
        'recibo_caja_id', v_recibo.caja_id);
END;
$$;


-- ---------------------------------------------------------------------
-- 4) Trigger: tampoco se anula un recibo de anticipo de cotización
--    (reemplaza la versión de migracion_cu09_cu13_abonos.sql)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tg_proteger_recibo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado = 'ANULADA' AND OLD.estado <> 'ANULADA' THEN
    IF OLD.tipo_comprobante = 'RECIBO_ANTICIPO' THEN
      RAISE EXCEPTION 'El recibo % es el anticipo de una cotización aprobada y no se puede anular',
        OLD.nro_comprobante;
    END IF;
    IF OLD.tipo_comprobante IN ('RECIBO_ABONO', 'RECIBO_SALDO')
       AND EXISTS (SELECT 1 FROM nota_servicio WHERE orden_trabajo_id = OLD.orden_trabajo_id) THEN
      RAISE EXCEPTION 'El recibo % pertenece a una orden ya liquidada y no se puede anular',
        OLD.nro_comprobante;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_proteger_recibo ON public.venta;
CREATE TRIGGER tg_proteger_recibo
  BEFORE UPDATE OF estado ON public.venta
  FOR EACH ROW EXECUTE FUNCTION public.fn_tg_proteger_recibo();


-- ---------------------------------------------------------------------
-- 5) Seguridad: solo el servidor (service_role) ejecuta estas funciones
-- ---------------------------------------------------------------------
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.fn_insertar_recibo_anticipo(integer,integer,numeric,text,text,text,boolean)',
    'public.fn_aprobar_cotizacion(integer,integer,numeric,text,text,text)',
    'public.fn_aprobar_cotizacion_tarjeta(integer,integer,text,numeric,text)',
    'public.fn_tg_proteger_recibo()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verificación (ejecutar aparte):
-- Recibos de anticipo por caja:
-- SELECT v.caja_id, v.nro_comprobante, c.numero_cotizacion, v.tipo_pago, v.total
--   FROM public.venta v JOIN public.cotizacion c ON c.id = v.cotizacion_id
--  WHERE v.tipo_comprobante = 'RECIBO_ANTICIPO' ORDER BY v.id DESC;
-- Cerradas al navegador (anon = false, service_role = true):
-- SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon,
--        has_function_privilege('service_role', oid, 'EXECUTE') AS service_role
--   FROM pg_proc WHERE proname IN ('fn_insertar_recibo_anticipo', 'fn_aprobar_cotizacion', 'fn_aprobar_cotizacion_tarjeta');
-- Siguen 34 tablas:
-- SELECT count(*) FROM pg_tables WHERE schemaname = 'public';
