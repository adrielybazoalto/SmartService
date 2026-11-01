-- =====================================================================
--  SmartService - Métodos de pago en CU09 (ventas) y CU13 (notas de servicio)
--  EFECTIVO · QR · TRANSFERENCIA (confirmados por el Encargado)
--  TARJETA (pasarela Stripe: migracion_cu09_pago_stripe.sql y
--           migracion_cu13_pago_stripe.sql)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es seguro ejecutarlo más de una vez. Ejecutar DESPUÉS de
--  migracion_cu13_pago_stripe.sql.
--
--  Contiene:
--   1. referencia_pago en VENTA y NOTA_SERVICIO (número de la transferencia).
--   2. sp_registrar_pago_manual_nota: cobro del saldo de una nota con
--      EFECTIVO, QR o TRANSFERENCIA + bitácora, en UNA transacción.
-- =====================================================================

ALTER TABLE public.venta         ADD COLUMN IF NOT EXISTS referencia_pago VARCHAR(60);
ALTER TABLE public.nota_servicio ADD COLUMN IF NOT EXISTS referencia_pago VARCHAR(60);


-- ---------------------------------------------------------------------
-- LiquidacionController.registrarPagoSaldo
-- NotaServicio.registrarPagoManual + Bitacora.registrarEvento
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_registrar_pago_manual_nota(
    p_nota_id    INTEGER,
    p_metodo     VARCHAR,
    p_referencia VARCHAR,
    p_usuario_id INTEGER,
    p_ip         VARCHAR DEFAULT NULL
)
RETURNS nota_servicio
LANGUAGE plpgsql
AS $$
DECLARE
    v_nota       nota_servicio;
    v_saldo      NUMERIC;
    v_metodo     VARCHAR := UPPER(TRIM(COALESCE(p_metodo, '')));
    v_referencia VARCHAR := NULLIF(TRIM(COALESCE(p_referencia, '')), '');
BEGIN
    IF v_metodo NOT IN ('EFECTIVO', 'QR', 'TRANSFERENCIA') THEN
        RAISE EXCEPTION 'Método de pago inválido: use EFECTIVO, QR o TRANSFERENCIA (la tarjeta se cobra con Stripe)';
    END IF;

    IF v_metodo = 'TRANSFERENCIA' AND v_referencia IS NULL THEN
        RAISE EXCEPTION 'Ingrese el número de referencia de la transferencia';
    END IF;

    SELECT * INTO v_nota FROM nota_servicio WHERE id = p_nota_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La nota de servicio no existe';
    END IF;

    IF UPPER(COALESCE(v_nota.estado, '')) <> 'PENDIENTE' THEN
        RAISE EXCEPTION 'La nota % no está pendiente de pago', v_nota.numero_nota;
    END IF;

    v_saldo := ROUND(v_nota.monto_total - v_nota.anticipo_pagado, 2);
    IF v_saldo <= 0 THEN
        RAISE EXCEPTION 'La nota no tiene saldo pendiente';
    END IF;

    UPDATE nota_servicio
       SET estado          = 'PAGADA',
           metodo_pago     = v_metodo,
           referencia_pago = v_referencia,
           fecha_pago      = NOW()
     WHERE id = p_nota_id
    RETURNING * INTO v_nota;

    INSERT INTO bitacora (usuario_id, fecha_hora, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        NOW(),
        'PAGO_NOTA_SERVICIO',
        'Nota ' || v_nota.numero_nota || ' pagada con ' || v_metodo
            || ' | saldo cobrado: Bs ' || v_saldo
            || COALESCE(' | referencia: ' || v_referencia, ''),
        p_ip
    );

    RETURN v_nota;
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.sp_registrar_pago_manual_nota(INTEGER, VARCHAR, VARCHAR, INTEGER, VARCHAR) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.sp_registrar_pago_manual_nota(INTEGER, VARCHAR, VARCHAR, INTEGER, VARCHAR) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.sp_registrar_pago_manual_nota(INTEGER, VARCHAR, VARCHAR, INTEGER, VARCHAR) TO service_role;
    END IF;
END $$;
