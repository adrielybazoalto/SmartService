-- =====================================================================
--  CU09 + CU13 · Abonos a órdenes de trabajo y cobro del saldo por caja
--  NO crea ni modifica tablas ni columnas. Solo funciones y un trigger.
--
--  Idea:
--   * Un abono (CU09) es una fila de VENTA con tipo_comprobante
--     'RECIBO_ABONO', ligada a la orden (orden_trabajo_id) y a la caja
--     abierta. No tiene detalle_venta: no mueve stock.
--   * El cobro del saldo de la nota (CU13) también genera una fila de
--     VENTA, 'RECIBO_SALDO', en la caja abierta.
--   * fn_cerrar_caja ya suma las ventas EMITIDAS en EFECTIVO de la caja,
--     así que abonos y saldos cobrados en efectivo entran solos al arqueo.
--   * La liquidación (CU13) suma automáticamente el anticipo registrado en
--     la cotización (CU08: cotizacion.anticipo_monto) y los abonos de la
--     orden. nota_servicio.anticipo_pagado guarda el TOTAL pagado a cuenta
--     (anticipo + abonos) al momento de emitir.
--   * Pago con tarjeta (Stripe) de abonos y del saldo: se registra solo
--     después de verificar la sesión con Stripe, y es idempotente por
--     stripe_session_id (no se puede registrar dos veces el mismo pago).
--
--  Requiere (ya aplicadas): migracion_cu08_anticipo.sql,
--  migracion_cu08_anticipo_tarjeta.sql, migracion_cu12_estados_orden.sql,
--  migracion_cu13_pago_stripe.sql y migracion_metodos_pago.sql.
--  Reemplaza sp_emitir_nota_servicio, sp_registrar_pago_manual_nota y
--  sp_registrar_pago_nota (ejecutar DESPUÉS de esas migraciones).
--
--  Ejecutar completo en Supabase > SQL Editor. Se puede ejecutar más de
--  una vez.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Cliente de una orden: por la cotización o, si es correctiva, por
--    ticket -> sistema instalado -> establecimiento.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cliente_de_orden(p_orden_id INTEGER)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
           (SELECT c.cliente_id
              FROM orden_trabajo ot
              JOIN cotizacion c ON c.id = ot.cotizacion_id
             WHERE ot.id = p_orden_id),
           (SELECT e.cliente_id
              FROM orden_trabajo ot
              JOIN mantenimiento_ticket mt ON mt.id = ot.mantenimiento_ticket_id
              JOIN sistema_instalado si   ON si.id = mt.sistema_instalado_id
              JOIN establecimiento e      ON e.id = si.establecimiento_id
             WHERE ot.id = p_orden_id)
         );
$$;

-- ---------------------------------------------------------------------
-- 2) Pagos a cuenta de una orden (recibos de abono y de saldo vigentes).
--    También toma recibos ligados solo a la cotización de la orden
--    (por si el CU08 registra el anticipo como recibo en el futuro).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_pagos_orden(p_orden_id INTEGER)
RETURNS TABLE (
  venta_id         INTEGER,
  nro_comprobante  VARCHAR,
  tipo             VARCHAR,
  fecha            TIMESTAMP,
  tipo_pago        VARCHAR,
  referencia_pago  VARCHAR,
  monto            NUMERIC,
  caja_id          INTEGER,
  usuario_nombre   VARCHAR
)
LANGUAGE sql
STABLE
AS $$
  -- venta.fecha_emision se guarda en UTC (TIMESTAMP sin zona): se devuelve en hora de Bolivia
  SELECT v.id, v.nro_comprobante, v.tipo_comprobante,
         ((v.fecha_emision AT TIME ZONE 'UTC') AT TIME ZONE 'America/La_Paz')::TIMESTAMP,
         v.tipo_pago, v.referencia_pago, v.total, v.caja_id, u.nombre
    FROM venta v
    JOIN orden_trabajo ot ON ot.id = p_orden_id
    LEFT JOIN usuario u   ON u.id = v.usuario_id
   WHERE v.estado = 'EMITIDA'
     AND v.tipo_comprobante IN ('RECIBO_ABONO', 'RECIBO_SALDO')
     AND (v.orden_trabajo_id = ot.id
          OR (v.orden_trabajo_id IS NULL AND ot.cotizacion_id IS NOT NULL
              AND v.cotizacion_id = ot.cotizacion_id))
   ORDER BY v.fecha_emision, v.id;
$$;

-- ---------------------------------------------------------------------
-- 2b) Datos para la nota de servicio completa: cliente, establecimiento,
--     cotización de referencia y técnicos de la orden.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_datos_nota_orden(p_orden_id INTEGER)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH o AS (
    SELECT ot.id, ot.cotizacion_id, ot.mantenimiento_ticket_id,
           COALESCE(c.establecimiento_id, si.establecimiento_id) AS establecimiento_id
      FROM orden_trabajo ot
      LEFT JOIN cotizacion c            ON c.id = ot.cotizacion_id
      LEFT JOIN mantenimiento_ticket mt ON mt.id = ot.mantenimiento_ticket_id
      LEFT JOIN sistema_instalado si    ON si.id = mt.sistema_instalado_id
     WHERE ot.id = p_orden_id
  )
  SELECT jsonb_build_object(
    'cliente', (SELECT jsonb_build_object('id', cl.id, 'nombre', cl.nombre,
                        'documento_identidad', cl.documento_identidad,
                        'razon_social', cl.razon_social, 'telefono', cl.telefono,
                        'correo', cl.correo)
                  FROM cliente cl WHERE cl.id = fn_cliente_de_orden(p_orden_id)),
    'establecimiento', (SELECT jsonb_build_object('nombre', e.nombre_establecimiento,
                                'direccion', e.direccion)
                          FROM establecimiento e WHERE e.id = o.establecimiento_id),
    'cotizacion', (SELECT jsonb_build_object('numero', c.numero_cotizacion, 'total', c.total,
                           'fecha_emision', c.fecha_emision,
                           'anticipo_monto', c.anticipo_monto, 'anticipo_metodo', c.anticipo_metodo,
                           'anticipo_fecha', c.anticipo_fecha)
                     FROM cotizacion c WHERE c.id = o.cotizacion_id),
    'tecnicos', COALESCE((SELECT jsonb_agg(jsonb_build_object('nombre', u.nombre,
                                  'es_lider', COALESCE(ott.es_lider, false))
                                  ORDER BY ott.es_lider DESC NULLS LAST, u.nombre)
                            FROM orden_trabajo_tecnico ott
                            JOIN usuario u ON u.id = ott.usuario_id
                           WHERE ott.orden_trabajo_id = o.id), '[]'::jsonb)
  )
  FROM o;
$$;

-- ---------------------------------------------------------------------
-- 2c) CU09 · Órdenes que pueden recibir abonos (no canceladas y sin nota)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_ordenes_para_abono();
CREATE OR REPLACE FUNCTION public.fn_ordenes_para_abono()
RETURNS TABLE (
  orden_id          INTEGER,
  codigo_orden      VARCHAR,
  tipo_trabajo      VARCHAR,
  estado            VARCHAR,
  cliente_nombre    VARCHAR,
  numero_cotizacion VARCHAR,
  monto_pactado     NUMERIC,
  anticipo          NUMERIC,
  total_abonado     NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT ot.id, ot.codigo_orden, ot.tipo_trabajo, ot.estado,
         (SELECT cl.nombre FROM cliente cl WHERE cl.id = fn_cliente_de_orden(ot.id)),
         c.numero_cotizacion, c.total, COALESCE(c.anticipo_monto, 0),
         COALESCE((SELECT SUM(p.monto) FROM fn_pagos_orden(ot.id) p), 0)
    FROM orden_trabajo ot
    LEFT JOIN cotizacion c ON c.id = ot.cotizacion_id
   WHERE upper(COALESCE(ot.estado, '')) NOT IN ('CANCELADA', 'ANULADA')
     AND NOT EXISTS (SELECT 1 FROM nota_servicio ns WHERE ns.orden_trabajo_id = ot.id)
   ORDER BY ot.id DESC;
$$;

-- ---------------------------------------------------------------------
-- 3) Interno: inserta un recibo (VENTA sin detalle) en la caja abierta
--    del usuario. Lo usan el abono (CU09) y el cobro del saldo (CU13).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_insertar_recibo(
  p_usuario_id  INTEGER,
  p_orden_id    INTEGER,
  p_tipo        TEXT,      -- 'RECIBO_ABONO' | 'RECIBO_SALDO'
  p_monto       NUMERIC,
  p_tipo_pago   TEXT,
  p_referencia  TEXT,
  p_session_id  TEXT DEFAULT NULL,
  p_exigir_caja BOOLEAN DEFAULT TRUE
)
RETURNS venta
LANGUAGE plpgsql
AS $$
DECLARE
  v_caja_id    INTEGER;
  v_cliente_id INTEGER;
  v_cot_id     INTEGER;
  v_anio       TEXT := to_char((now() AT TIME ZONE 'America/La_Paz')::date, 'YYYY');
  v_seq        INTEGER;
  v_nro        TEXT;
  v_venta      venta;
BEGIN
  SELECT id INTO v_caja_id FROM caja
   WHERE usuario_id = p_usuario_id AND estado = 'ABIERTA'
   ORDER BY id DESC LIMIT 1
   FOR UPDATE;
  IF v_caja_id IS NULL THEN
    IF p_exigir_caja THEN
      RAISE EXCEPTION 'Debe abrir un turno de caja antes de registrar el cobro';
    END IF;
    RETURN NULL;   -- solo pago con tarjeta ya cobrado por Stripe
  END IF;

  v_cliente_id := fn_cliente_de_orden(p_orden_id);
  IF v_cliente_id IS NULL THEN
    -- Orden sin cliente identificable: se usa el cliente de mostrador del CU09
    SELECT id INTO v_cliente_id FROM cliente
     WHERE lower(nombre) = lower('Cliente de mostrador') ORDER BY id LIMIT 1;
  END IF;
  IF v_cliente_id IS NULL THEN
    IF p_exigir_caja THEN
      RAISE EXCEPTION 'La orden no tiene un cliente asociado';
    END IF;
    RETURN NULL;   -- tarjeta ya cobrada: la nota se marca pagada igual
  END IF;
  SELECT cotizacion_id INTO v_cot_id FROM orden_trabajo WHERE id = p_orden_id;

  -- Correlativo RC-AAAA-00001 (bloqueo para que no se repita)
  PERFORM pg_advisory_xact_lock(hashtext('venta_recibo_numero'));
  SELECT COALESCE(MAX(split_part(nro_comprobante, '-', 3)::INTEGER), 0) + 1 INTO v_seq
    FROM venta WHERE nro_comprobante ~ ('^RC-' || v_anio || '-[0-9]+$');
  v_nro := 'RC-' || v_anio || '-' || lpad(v_seq::TEXT, 5, '0');

  INSERT INTO venta (caja_id, cliente_id, usuario_id, cotizacion_id, orden_trabajo_id,
                     tipo_comprobante, nro_comprobante, fecha_emision,
                     subtotal, descuento, total, estado, tipo_pago,
                     stripe_session_id, referencia_pago)
  VALUES (v_caja_id, v_cliente_id, p_usuario_id, v_cot_id, p_orden_id,
          p_tipo, v_nro, CURRENT_TIMESTAMP,
          round(p_monto, 2), 0, round(p_monto, 2), 'EMITIDA', p_tipo_pago,
          p_session_id, NULLIF(btrim(COALESCE(p_referencia, '')), ''))
  RETURNING * INTO v_venta;

  RETURN v_venta;
END;
$$;

-- ---------------------------------------------------------------------
-- 4) CU09 · Registrar abono a una orden de trabajo
--    EFECTIVO / QR / TRANSFERENCIA: lo confirma el Encargado.
--    TARJETA: solo con p_session_id de un pago ya verificado con Stripe.
--    Idempotente por stripe_session_id: el mismo pago no se registra dos veces.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_registrar_abono(INTEGER, INTEGER, NUMERIC, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.fn_registrar_abono(
  p_usuario_id INTEGER,
  p_orden_id   INTEGER,
  p_monto      NUMERIC,
  p_tipo_pago  TEXT,
  p_referencia TEXT DEFAULT NULL,
  p_ip         TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_orden     RECORD;
  v_monto     NUMERIC(12,2) := round(p_monto, 2);
  v_metodo    TEXT := upper(btrim(COALESCE(p_tipo_pago, '')));
  v_pagado    NUMERIC(12,2);
  v_pactado   NUMERIC(12,2);
  v_anticipo  NUMERIC(12,2) := 0;
  v_recibo    venta;
BEGIN
  IF v_monto IS NULL OR v_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser mayor a 0';
  END IF;
  IF p_session_id IS NOT NULL THEN
    -- Pago con tarjeta ya verificado con Stripe: mismo pago = mismo recibo
    PERFORM pg_advisory_xact_lock(hashtext('stripe_' || p_session_id));
    SELECT * INTO v_recibo FROM venta WHERE stripe_session_id = p_session_id;
    IF FOUND THEN
      IF v_recibo.orden_trabajo_id IS DISTINCT FROM p_orden_id OR v_recibo.tipo_comprobante <> 'RECIBO_ABONO' THEN
        RAISE EXCEPTION 'Este pago con tarjeta ya fue usado en otro comprobante';
      END IF;
      RETURN jsonb_build_object('id', v_recibo.id, 'nro_comprobante', v_recibo.nro_comprobante,
        'orden', (SELECT codigo_orden FROM orden_trabajo WHERE id = p_orden_id),
        'monto', v_recibo.total, 'ya_registrado', true,
        'total_abonado', (SELECT COALESCE(SUM(monto), 0) FROM fn_pagos_orden(p_orden_id)));
    END IF;
    v_metodo := 'TARJETA';
  ELSIF v_metodo NOT IN ('EFECTIVO', 'QR', 'TRANSFERENCIA') THEN
    RAISE EXCEPTION 'Método de pago inválido: use EFECTIVO, QR o TRANSFERENCIA (la tarjeta se cobra con Stripe)';
  END IF;
  IF v_metodo = 'TRANSFERENCIA' AND NULLIF(btrim(COALESCE(p_referencia, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Ingrese el número de referencia de la transferencia';
  END IF;

  SELECT ot.id, ot.codigo_orden, ot.estado, ot.cotizacion_id
    INTO v_orden
    FROM orden_trabajo ot WHERE ot.id = p_orden_id
     FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La orden de trabajo no existe'; END IF;
  IF upper(COALESCE(v_orden.estado, '')) IN ('CANCELADA', 'ANULADA') THEN
    RAISE EXCEPTION 'La orden % está cancelada: no admite abonos', v_orden.codigo_orden;
  END IF;
  IF EXISTS (SELECT 1 FROM nota_servicio WHERE orden_trabajo_id = p_orden_id) THEN
    RAISE EXCEPTION 'La orden % ya fue liquidada: cobre el saldo desde la nota de servicio',
      v_orden.codigo_orden;
  END IF;

  -- Tope: anticipo (CU08) + abonos no pueden superar el monto pactado
  SELECT COALESCE(SUM(monto), 0) INTO v_pagado FROM fn_pagos_orden(p_orden_id);
  IF v_orden.cotizacion_id IS NOT NULL THEN
    SELECT total, COALESCE(anticipo_monto, 0) INTO v_pactado, v_anticipo
      FROM cotizacion WHERE id = v_orden.cotizacion_id;
    IF v_pactado IS NOT NULL AND v_anticipo + v_pagado + v_monto > v_pactado THEN
      RAISE EXCEPTION 'El abono supera el monto pactado: pactado Bs %, anticipo Bs %, ya abonado Bs %, máximo Bs %',
        v_pactado, v_anticipo, v_pagado, greatest(v_pactado - v_anticipo - v_pagado, 0);
    END IF;
  END IF;

  v_recibo := fn_insertar_recibo(p_usuario_id, p_orden_id, 'RECIBO_ABONO',
                                 v_monto, v_metodo, p_referencia, p_session_id);

  INSERT INTO bitacora (usuario_id, fecha_hora, accion, descripcion, ip)
  VALUES (p_usuario_id, now(), 'ABONO_ORDEN',
          'Recibo ' || v_recibo.nro_comprobante || ' | orden ' || v_orden.codigo_orden
          || ' | abono Bs ' || v_monto || ' (' || v_metodo || ')'
          || COALESCE(' | ref: ' || NULLIF(btrim(COALESCE(p_referencia, '')), ''), '')
          || COALESCE(' | pago Stripe: ' || p_session_id, ''),
          p_ip);

  RETURN jsonb_build_object(
    'ya_registrado', false,
    'monto_anticipo', v_anticipo,
    'id', v_recibo.id,
    'nro_comprobante', v_recibo.nro_comprobante,
    'orden', v_orden.codigo_orden,
    'monto', v_monto,
    'total_abonado', v_pagado + v_monto,
    'monto_pactado', v_pactado);
END;
$$;

-- ---------------------------------------------------------------------
-- 5) CU13 · Emitir nota de servicio con cálculo dinámico de pagos a cuenta
--    total = fn_calcular_liquidacion (materiales + mano de obra)
--    a cuenta = anticipo (CU08: cotizacion.anticipo_monto; en órdenes
--               correctivas sin cotización, p_anticipo) + abonos en caja (CU09)
--    Si lo pagado a cuenta supera el total, se aplica hasta el total, la nota
--    queda PAGADA y el excedente (saldo a favor del cliente) va a la bitácora.
--    Misma firma que antes: el código que la llama no cambia.
-- ---------------------------------------------------------------------
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
    v_liq           RECORD;
    v_anticipo      NUMERIC(12,2);
    v_abonos        NUMERIC(12,2);
    v_pagado        NUMERIC(12,2);
    v_a_cuenta      NUMERIC(12,2);
    v_excedente     NUMERIC(12,2) := 0;
    v_anio          TEXT := TO_CHAR(CURRENT_DATE, 'YYYY');
    v_secuencia     INTEGER;
    v_numero        VARCHAR;
    v_nota          nota_servicio;
BEGIN
    -- Bloquea la orden para evitar dos emisiones simultáneas
    SELECT ot.estado, ot.codigo_orden, ot.cotizacion_id
      INTO v_estado, v_codigo, v_cotizacion_id
      FROM orden_trabajo ot WHERE ot.id = p_orden_id FOR UPDATE;
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

    -- Anticipo: con cotización sale de la base (CU08); sin cotización lo ingresa el Encargado
    IF v_cotizacion_id IS NOT NULL THEN
        SELECT COALESCE(c.anticipo_monto, 0) INTO v_anticipo FROM cotizacion c WHERE c.id = v_cotizacion_id;
    ELSE
        IF p_anticipo IS NULL OR p_anticipo < 0 THEN
            RAISE EXCEPTION 'El anticipo no puede ser negativo';
        END IF;
        v_anticipo := ROUND(p_anticipo, 2);
    END IF;

    -- Abonos registrados en caja (CU09)
    SELECT COALESCE(SUM(monto), 0) INTO v_abonos FROM fn_pagos_orden(p_orden_id);

    v_pagado := v_anticipo + v_abonos;
    IF v_cotizacion_id IS NULL AND v_pagado > v_liq.total_liquidacion THEN
        RAISE EXCEPTION 'El anticipo (Bs %) más los abonos (Bs %) superan el monto total (Bs %)',
            v_anticipo, v_abonos, v_liq.total_liquidacion;
    END IF;
    v_a_cuenta  := LEAST(v_pagado, v_liq.total_liquidacion);
    v_excedente := v_pagado - v_a_cuenta;

    -- Número correlativo NS-AAAA-NNN (bloqueo para que no se repita)
    PERFORM pg_advisory_xact_lock(hashtext('nota_servicio_numero'));
    SELECT COALESCE(MAX(CAST(SPLIT_PART(ns.numero_nota, '-', 3) AS INTEGER)), 0) + 1
      INTO v_secuencia
      FROM nota_servicio ns
     WHERE ns.numero_nota ~ ('^NS-' || v_anio || '-[0-9]+$');
    v_numero := 'NS-' || v_anio || '-' || LPAD(v_secuencia::TEXT, 3, '0');

    INSERT INTO nota_servicio (orden_trabajo_id, numero_nota, anticipo_pagado,
                               fecha_emision, estado, monto_total)
    VALUES (p_orden_id, v_numero, v_a_cuenta, CURRENT_DATE,
            CASE WHEN v_a_cuenta >= v_liq.total_liquidacion THEN 'PAGADA' ELSE 'PENDIENTE' END,
            v_liq.total_liquidacion)
    RETURNING * INTO v_nota;

    -- Bitácora (CU06)
    INSERT INTO bitacora (usuario_id, fecha_hora, accion, descripcion, ip)
    VALUES (p_usuario_id, NOW(), 'EMITIR_NOTA_SERVICIO',
            'Nota ' || v_numero || ' de la orden ' || v_codigo
            || ' | total: ' || v_liq.total_liquidacion
            || ' | anticipo: ' || v_anticipo
            || ' | abonos en caja: ' || v_abonos
            || ' | saldo: ' || (v_liq.total_liquidacion - v_a_cuenta)
            || CASE WHEN v_excedente > 0 THEN ' | saldo a favor del cliente: ' || v_excedente ELSE '' END,
            p_ip);

    RETURN v_nota;
END;
$$;

-- ---------------------------------------------------------------------
-- 6) CU13 · Cobro del saldo en EFECTIVO / QR / TRANSFERENCIA:
--    exige caja abierta y genera el recibo RECIBO_SALDO (entra al arqueo).
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
    v_recibo     venta;
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

    v_recibo := fn_insertar_recibo(p_usuario_id, v_nota.orden_trabajo_id, 'RECIBO_SALDO',
                                   v_saldo, v_metodo, v_referencia);

    UPDATE nota_servicio
       SET estado          = 'PAGADA',
           metodo_pago     = v_metodo,
           referencia_pago = COALESCE(v_referencia, v_recibo.nro_comprobante),
           fecha_pago      = NOW()
     WHERE id = p_nota_id
    RETURNING * INTO v_nota;

    INSERT INTO bitacora (usuario_id, fecha_hora, accion, descripcion, ip)
    VALUES (p_usuario_id, NOW(), 'PAGO_NOTA_SERVICIO',
            'Nota ' || v_nota.numero_nota || ' pagada con ' || v_metodo
            || ' | saldo cobrado: Bs ' || v_saldo
            || ' | recibo: ' || v_recibo.nro_comprobante
            || COALESCE(' | referencia: ' || v_referencia, ''),
            p_ip);

    RETURN v_nota;
END;
$$;

-- ---------------------------------------------------------------------
-- 7) CU13 · Cobro del saldo con tarjeta (Stripe). Si el Encargado tiene
--    la caja abierta, también queda el recibo (tipo_pago TARJETA, no
--    suma al efectivo del arqueo). El cobro ya lo hizo Stripe, así que
--    no se rechaza si no hay caja.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sp_registrar_pago_nota(
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
    v_nota   nota_servicio;
    v_saldo  NUMERIC;
    v_recibo venta;
BEGIN
    SELECT * INTO v_nota FROM nota_servicio WHERE id = p_nota_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La nota de servicio no existe';
    END IF;

    IF v_nota.stripe_session_id = p_session_id THEN
        RETURN v_nota;   -- misma confirmación otra vez (recarga)
    END IF;
    IF UPPER(COALESCE(v_nota.estado, '')) <> 'PENDIENTE' THEN
        RAISE EXCEPTION 'La nota % no está pendiente de pago', v_nota.numero_nota;
    END IF;

    v_saldo := ROUND(v_nota.monto_total - v_nota.anticipo_pagado, 2);
    IF p_monto_pagado IS NULL OR ABS(p_monto_pagado - v_saldo) > 0.05 THEN
        RAISE EXCEPTION 'El monto pagado (%) no coincide con el saldo de la nota (%)', p_monto_pagado, v_saldo;
    END IF;

    v_recibo := fn_insertar_recibo(p_usuario_id, v_nota.orden_trabajo_id, 'RECIBO_SALDO',
                                   v_saldo, 'TARJETA', NULL, p_session_id, FALSE);

    UPDATE nota_servicio
       SET estado            = 'PAGADA',
           metodo_pago       = 'TARJETA',
           stripe_session_id = p_session_id,
           referencia_pago   = v_recibo.nro_comprobante,
           fecha_pago        = NOW()
     WHERE id = p_nota_id
    RETURNING * INTO v_nota;

    INSERT INTO bitacora (usuario_id, fecha_hora, accion, descripcion, ip)
    VALUES (p_usuario_id, NOW(), 'PAGO_NOTA_SERVICIO',
            'Nota ' || v_nota.numero_nota || ' pagada con tarjeta (Stripe)'
            || ' | saldo cobrado: Bs ' || v_saldo
            || COALESCE(' | recibo: ' || v_recibo.nro_comprobante, '')
            || ' | pago: ' || p_session_id,
            p_ip);

    RETURN v_nota;
END;
$$;

-- ---------------------------------------------------------------------
-- 8) Trigger: un recibo de una orden ya liquidada no se puede anular
--    (la nota ya los descontó). Protege cualquier camino de anulación.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_tg_proteger_recibo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.estado = 'ANULADA' AND OLD.estado <> 'ANULADA'
     AND OLD.tipo_comprobante IN ('RECIBO_ABONO', 'RECIBO_SALDO')
     AND EXISTS (SELECT 1 FROM nota_servicio WHERE orden_trabajo_id = OLD.orden_trabajo_id) THEN
    RAISE EXCEPTION 'El recibo % pertenece a una orden ya liquidada y no se puede anular',
      OLD.nro_comprobante;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_proteger_recibo ON public.venta;
CREATE TRIGGER tg_proteger_recibo
  BEFORE UPDATE OF estado ON public.venta
  FOR EACH ROW EXECUTE FUNCTION public.fn_tg_proteger_recibo();

-- ---------------------------------------------------------------------
-- 9) Seguridad: solo el servidor (service_role) ejecuta estas funciones
-- ---------------------------------------------------------------------
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.fn_cliente_de_orden(integer)',
    'public.fn_pagos_orden(integer)',
    'public.fn_datos_nota_orden(integer)',
    'public.fn_ordenes_para_abono()',
    'public.fn_insertar_recibo(integer,integer,text,numeric,text,text,text,boolean)',
    'public.fn_registrar_abono(integer,integer,numeric,text,text,text,text)',
    'public.sp_emitir_nota_servicio(integer,numeric,integer,character varying,integer)',
    'public.sp_registrar_pago_manual_nota(integer,character varying,character varying,integer,character varying)',
    'public.sp_registrar_pago_nota(integer,character varying,numeric,integer,character varying)',
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
