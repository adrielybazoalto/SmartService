-- =====================================================================
--  SmartService - CU13 Emitir Notas de Servicio y Liquidación Operativa
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es seguro ejecutarlo más de una vez (CREATE OR REPLACE / IF NOT EXISTS).
--
--  Contiene:
--   1. Restricción: una sola nota de servicio por orden de trabajo.
--   2. fn_calcular_liquidacion  -> calcula materiales + mano de obra.
--   3. sp_emitir_nota_servicio  -> valida, numera (NS-2026-001), registra
--                                  la nota y la bitácora en UNA transacción.
--
--  Supuestos (ajustar si su base es distinta):
--   - El CU12 deja la orden en estado 'COMPLETADA' cuando el técnico termina
--     (también se acepta 'FINALIZADA').
--   - Horas trabajadas = fecha_fin_real - fecha_inicio_real (columnas del CU12).
--   - producto.margen_ganancia es un porcentaje (30 = 30 %).
--   - Tarifa por hora: la de los servicios cotizados en la cotización de
--     la orden; si la orden no tiene cotización (correctivo), la del
--     servicio que elija el Encargado (p_servicio_id).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Una sola nota de servicio por orden de trabajo
-- ---------------------------------------------------------------------
--    Solo se crea si la tabla todavía NO tiene un UNIQUE sobre orden_trabajo_id
--    (así no queda la restricción repetida).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint con
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY (con.conkey)
         WHERE con.conrelid = 'public.nota_servicio'::regclass
           AND con.contype = 'u'
           AND array_length(con.conkey, 1) = 1
           AND a.attname = 'orden_trabajo_id'
    ) THEN
        ALTER TABLE nota_servicio
            ADD CONSTRAINT uq_nota_servicio_orden UNIQUE (orden_trabajo_id);
    END IF;
END $$;


-- ---------------------------------------------------------------------
-- 2. Cálculo de la liquidación (no modifica datos)
--    LiquidacionController: calcularCostoMateriales, calcularManoDeObra,
--    calcularMontoTotal
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_calcular_liquidacion(
    p_orden_id    INTEGER,
    p_servicio_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    costo_materiales NUMERIC,
    horas_trabajadas NUMERIC,
    tarifa_hora      NUMERIC,
    costo_mano_obra  NUMERIC,
    total_liquidacion NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cotizacion_id INTEGER;
    v_horas         NUMERIC;
    v_inicio        TIMESTAMP;
    v_fin           TIMESTAMP;
    v_materiales    NUMERIC;
    v_tarifa        NUMERIC;
    v_mano_obra     NUMERIC;
BEGIN
    SELECT ot.cotizacion_id, ot.fecha_inicio_real, ot.fecha_fin_real
      INTO v_cotizacion_id, v_inicio, v_fin
      FROM orden_trabajo ot
     WHERE ot.id = p_orden_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'La orden de trabajo % no existe', p_orden_id;
    END IF;

    -- Horas efectivas registradas por el técnico en el CU12
    v_horas := CASE
                 WHEN v_inicio IS NOT NULL AND v_fin IS NOT NULL AND v_fin > v_inicio
                 THEN ROUND(EXTRACT(EPOCH FROM (v_fin - v_inicio)) / 3600.0, 2)
                 ELSE 0
               END;

    -- Materiales consumidos en campo a precio de venta
    SELECT COALESCE(SUM(
               dcm.cantidad_utilizada
             * p.precio_compra_actual
             * (1 + COALESCE(p.margen_ganancia, 0) / 100)
           ), 0)
      INTO v_materiales
      FROM detalle_consumo_material dcm
      JOIN producto p ON p.id = dcm.producto_id
     WHERE dcm.orden_trabajo_id = p_orden_id;

    -- Tarifa por hora
    IF p_servicio_id IS NOT NULL THEN
        SELECT s.precio_hora_base INTO v_tarifa
          FROM servicio s
         WHERE s.id = p_servicio_id;
    ELSIF v_cotizacion_id IS NOT NULL THEN
        -- promedio ponderado de los servicios cotizados
        SELECT CASE WHEN SUM(d.horas_estimadas) > 0
                    THEN SUM(d.precio_hora * d.horas_estimadas) / SUM(d.horas_estimadas)
               END
          INTO v_tarifa
          FROM detalle_cotizacion_servicio d
         WHERE d.cotizacion_id = v_cotizacion_id;
    END IF;

    v_materiales := ROUND(v_materiales, 2);
    v_tarifa     := ROUND(COALESCE(v_tarifa, 0), 2);
    v_mano_obra  := ROUND(v_horas * v_tarifa, 2);

    RETURN QUERY
    SELECT v_materiales, v_horas, v_tarifa, v_mano_obra, v_materiales + v_mano_obra;
END;
$$;


-- ---------------------------------------------------------------------
-- 3. Emisión de la nota de servicio (transacción atómica)
--    LiquidacionController.emitirNotaServicio
--    NotaServicio.generarNumero / registrar  +  Bitacora.registrarEvento
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sp_emitir_nota_servicio(
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
       v_anio       TEXT := TO_CHAR((NOW() AT TIME ZONE 'America/La_Paz')::date, 'YYYY');
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
    IF UPPER(COALESCE(v_estado, '')) NOT IN ('COMPLETADA', 'FINALIZADA') THEN
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
               (NOW() AT TIME ZONE 'America/La_Paz')::date,   -- fecha de Bolivia, no UTC
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
