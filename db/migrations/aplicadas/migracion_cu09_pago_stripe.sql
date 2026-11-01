-- =====================================================================
--  SmartService - CU09 Venta en mostrador con pago con tarjeta
--  (pasarela de pago Stripe, modo de prueba)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es seguro ejecutarlo más de una vez. Requiere fn_registrar_venta
--  (migration_ventas_proveedores.sql), que ya está instalada.
--
--  Contiene:
--   1. venta.stripe_session_id: el código del pago de Stripe de la venta.
--   2. fn_registrar_venta_tarjeta: registra la venta SOLO después de que
--      Stripe confirmó el pago, en UNA transacción, usando fn_registrar_venta
--      (detalle, stock y kárdex). Si se confirma dos veces el mismo pago,
--      devuelve la venta ya registrada (no la duplica).
-- =====================================================================

ALTER TABLE public.venta ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);
CREATE UNIQUE INDEX IF NOT EXISTS uq_venta_stripe_session
    ON public.venta (stripe_session_id) WHERE stripe_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_registrar_venta_tarjeta(
  p_session_id       VARCHAR,
  p_monto_pagado     NUMERIC,
  p_usuario_id       INTEGER,
  p_cliente_id       INTEGER,
  p_tipo_comprobante TEXT,
  p_descuento        NUMERIC,
  p_items            JSONB
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_venta RECORD;
  v_r     JSONB;
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' THEN
    RAISE EXCEPTION 'Falta el código del pago con tarjeta';
  END IF;

  -- Dos confirmaciones del mismo pago al mismo tiempo: la segunda espera aquí
  PERFORM pg_advisory_xact_lock(hashtext('stripe_' || p_session_id));

  -- Pago ya usado: se devuelve la venta registrada (no se duplica)
  SELECT id, nro_comprobante, subtotal, descuento, total
    INTO v_venta FROM public.venta WHERE stripe_session_id = p_session_id;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_venta.id, 'nro_comprobante', v_venta.nro_comprobante,
                              'subtotal', v_venta.subtotal, 'descuento', v_venta.descuento,
                              'total', v_venta.total, 'ya_registrada', true);
  END IF;

  -- Venta normal del CU09 (caja abierta, stock, detalle, kárdex) con TARJETA
  v_r := public.fn_registrar_venta(p_usuario_id, p_cliente_id, 'TARJETA', p_tipo_comprobante, p_descuento, p_items);

  -- Lo cobrado debe coincidir con el total calculado; si no, se revierte todo
  IF p_monto_pagado IS NULL OR ABS((v_r ->> 'total')::NUMERIC - p_monto_pagado) > 0.05 THEN
    RAISE EXCEPTION 'El total de la venta (Bs %) no coincide con lo pagado con tarjeta (Bs %). La venta no se registró.',
      v_r ->> 'total', p_monto_pagado;
  END IF;

  UPDATE public.venta SET stripe_session_id = p_session_id WHERE id = (v_r ->> 'id')::INTEGER;

  RETURN v_r || jsonb_build_object('ya_registrada', false);
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.fn_registrar_venta_tarjeta(VARCHAR, NUMERIC, INTEGER, INTEGER, TEXT, NUMERIC, JSONB) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.fn_registrar_venta_tarjeta(VARCHAR, NUMERIC, INTEGER, INTEGER, TEXT, NUMERIC, JSONB) FROM anon, authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.fn_registrar_venta_tarjeta(VARCHAR, NUMERIC, INTEGER, INTEGER, TEXT, NUMERIC, JSONB) TO service_role;
  END IF;
END $$;
