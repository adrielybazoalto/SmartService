-- =====================================================================
--  SmartService - CU13 Cobro del saldo de la Nota de Servicio con tarjeta
--  (pasarela de pago Stripe, modo de prueba)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es seguro ejecutarlo más de una vez (IF NOT EXISTS / CREATE OR REPLACE).
--  Ejecutar DESPUÉS de migracion_cu13_nota_servicio.sql.
--
--  Contiene:
--   1. Columnas del pago en NOTA_SERVICIO: metodo_pago, stripe_session_id, fecha_pago
--      (y stripe_session_id en VENTA, para el pago con tarjeta del CU09).
--   2. sp_registrar_pago_nota -> NotaServicio.registrarPago + Bitacora.registrarEvento
--      en UNA transacción. Si se llama dos veces con el mismo pago, no lo
--      registra dos veces (idempotente).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Columnas del pago
-- ---------------------------------------------------------------------
ALTER TABLE nota_servicio ADD COLUMN IF NOT EXISTS metodo_pago       VARCHAR(20);
ALTER TABLE nota_servicio ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);
ALTER TABLE nota_servicio ADD COLUMN IF NOT EXISTS fecha_pago        TIMESTAMPTZ;

ALTER TABLE venta ADD COLUMN IF NOT EXISTS stripe_session_id VARCHAR(255);

-- Un mismo pago de Stripe no puede usarse en dos notas ni en dos ventas
CREATE UNIQUE INDEX IF NOT EXISTS uq_nota_servicio_stripe_session
    ON nota_servicio (stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_venta_stripe_session
    ON venta (stripe_session_id) WHERE stripe_session_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- 2. Registrar el pago del saldo (transacción atómica)
--    LiquidacionController.confirmarPagoSaldo
--    NotaServicio.registrarPago  +  Bitacora.registrarEvento
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_registrar_pago_nota(
    p_nota_id      INTEGER,
    p_session_id   VARCHAR,
    p_monto_pagado NUMERIC,
    p_usuario_id   INTEGER,
    p_ip           VARCHAR DEFAULT NULL
)
RETURNS nota_servicio
LANGUAGE plpgsql
AS $$
DECLARE
    v_nota  nota_servicio;
    v_saldo NUMERIC;
BEGIN
    -- Bloquea la nota para que dos confirmaciones simultáneas no choquen
    SELECT * INTO v_nota FROM nota_servicio WHERE id = p_nota_id FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La nota de servicio no existe';
    END IF;

    -- Mismo pago confirmado otra vez (recargar la página): no se repite
    IF v_nota.stripe_session_id = p_session_id THEN
        RETURN v_nota;
    END IF;

    IF UPPER(COALESCE(v_nota.estado, '')) <> 'PENDIENTE' THEN
        RAISE EXCEPTION 'La nota % no está pendiente de pago', v_nota.numero_nota;
    END IF;

    v_saldo := ROUND(v_nota.monto_total - v_nota.anticipo_pagado, 2);

    IF p_monto_pagado IS NULL OR ABS(p_monto_pagado - v_saldo) > 0.05 THEN
        RAISE EXCEPTION 'El monto pagado (%) no coincide con el saldo de la nota (%)', p_monto_pagado, v_saldo;
    END IF;

    UPDATE nota_servicio
       SET estado            = 'PAGADA',
           metodo_pago       = 'TARJETA',
           stripe_session_id = p_session_id,
           fecha_pago        = NOW()
     WHERE id = p_nota_id
    RETURNING * INTO v_nota;

    -- Bitácora (CU06)
    INSERT INTO bitacora (usuario_id, fecha_hora, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        NOW(),
        'PAGO_NOTA_SERVICIO',
        'Nota ' || v_nota.numero_nota || ' pagada con tarjeta (Stripe)'
            || ' | saldo cobrado: Bs ' || v_saldo
            || ' | pago: ' || p_session_id,
        p_ip
    );

    RETURN v_nota;
END;
$$;


-- Verificación (ejecutar aparte): deben aparecer las 3 columnas nuevas
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_name = 'nota_servicio' AND column_name IN ('metodo_pago', 'stripe_session_id', 'fecha_pago');
