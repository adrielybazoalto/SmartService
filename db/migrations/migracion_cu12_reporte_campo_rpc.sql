-- =====================================================================
--  SmartService - CU12 Reporte de Campo y Descuento de Kárdex Atómico
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente (CREATE OR REPLACE FUNCTION).
--
--  Garantiza atomicidad estricta (todo o nada):
--   1. Bloquea la orden (FOR UPDATE).
--   2. Valida asignación del técnico si el usuario es técnico.
--   3. Valida stock suficiente para TODOS los materiales antes de aplicar.
--   4. Si algún producto no tiene stock, hace RAISE EXCEPTION y revierte TODO.
--   5. Descuenta stock, registra en movimiento_kardex y detalle_consumo_material.
--   6. Actualiza la orden a estado 'FINALIZADA'.
--   7. Registra auditoría en bitácora en la misma transacción.
-- =====================================================================

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
AS $$
DECLARE
    v_orden          orden_trabajo%ROWTYPE;
    v_mat            JSONB;
    v_prod_id        INTEGER;
    v_cant           NUMERIC;
    v_obs            TEXT;
    v_stock_anterior NUMERIC;
    v_stock_nuevo    NUMERIC;
    v_prod_nombre    TEXT;
    v_consumos       JSONB := '[]'::jsonb;
    v_consumo_elem   JSONB;
    v_consumo_id     INTEGER;
BEGIN
    -- 1. Obtener y bloquear la orden de trabajo
    SELECT * INTO v_orden
      FROM orden_trabajo
     WHERE id = p_orden_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró la orden de trabajo con ID %', p_orden_id;
    END IF;

    -- Validar que no esté ya finalizada
    IF UPPER(COALESCE(v_orden.estado, '')) IN ('FINALIZADA', 'COMPLETADA') THEN
        RAISE EXCEPTION 'La orden de trabajo % ya se encuentra finalizada', v_orden.codigo_orden;
    END IF;

    -- Validar que el usuario (si es técnico) esté asignado a la orden
    IF EXISTS (
        SELECT 1
          FROM usuario u
          JOIN rol r ON r.id = u.rol_id
         WHERE u.id = p_usuario_id
           AND UPPER(r.nombre) LIKE '%TECNICO%'
    ) THEN
        IF NOT EXISTS (
            SELECT 1
              FROM orden_trabajo_tecnico
             WHERE orden_trabajo_id = p_orden_id
               AND usuario_id = p_usuario_id
        ) THEN
            RAISE EXCEPTION 'Acceso denegado: el técnico no está asignado a esta orden de trabajo';
        END IF;
    END IF;

    -- 2. Procesar cada material de forma atómica
    IF p_materiales IS NOT NULL AND jsonb_array_length(p_materiales) > 0 THEN
        FOR v_mat IN SELECT * FROM jsonb_array_elements(p_materiales)
        LOOP
            v_prod_id := (v_mat->>'producto_id')::INTEGER;
            v_cant    := (v_mat->>'cantidad_utilizada')::NUMERIC;
            v_obs     := v_mat->>'observacion';

            IF v_cant <= 0 THEN
                RAISE EXCEPTION 'La cantidad del producto debe ser mayor a 0';
            END IF;

            -- Bloquear producto para actualización
            SELECT nombre, stock_disponible::NUMERIC
              INTO v_prod_nombre, v_stock_anterior
              FROM producto
             WHERE id = v_prod_id
               FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'No se encontró el producto con ID %', v_prod_id;
            END IF;

            IF v_cant > v_stock_anterior THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto "%" (Disponible: %, Solicitado: %)',
                    v_prod_nombre, v_stock_anterior, v_cant;
            END IF;

            v_stock_nuevo := v_stock_anterior - v_cant;

            -- Actualizar stock del producto
            UPDATE producto
               SET stock_disponible = v_stock_nuevo::TEXT
             WHERE id = v_prod_id;

            -- Registrar movimiento en kardex
            INSERT INTO movimiento_kardex (
                producto_id,
                usuario_id,
                tipo_movimiento,
                cantidad,
                stock_anterior,
                origen_movimiento,
                observacion
            ) VALUES (
                v_prod_id,
                p_usuario_id,
                'SALIDA',
                v_cant::TEXT,
                v_stock_anterior::TEXT,
                'orden_trabajo:' || p_orden_id,
                COALESCE('Consumo en OT ' || v_orden.codigo_orden || ' - ' || v_obs, 'Consumo en OT ' || v_orden.codigo_orden)
            );

            -- Registrar detalle de consumo
            INSERT INTO detalle_consumo_material (
                orden_trabajo_id,
                producto_id,
                cantidad_utilizada,
                observacion
            ) VALUES (
                p_orden_id,
                v_prod_id,
                v_cant::TEXT,
                v_obs
            ) RETURNING id INTO v_consumo_id;

            v_consumo_elem := jsonb_build_object(
                'id', v_consumo_id,
                'orden_trabajo_id', p_orden_id,
                'producto_id', v_prod_id,
                'cantidad_utilizada', v_cant,
                'observacion', v_obs
            );
            v_consumos := v_consumos || jsonb_build_array(v_consumo_elem);
        END LOOP;
    END IF;

    -- 3. Actualizar la orden a FINALIZADA
    UPDATE orden_trabajo
       SET estado = 'FINALIZADA',
           fecha_fin_real = COALESCE(v_orden.fecha_fin_real, CURRENT_TIMESTAMP),
           observaciones_tecnico = p_diagnostico
     WHERE id = p_orden_id
     RETURNING * INTO v_orden;

    -- 4. Registrar en bitácora
    INSERT INTO bitacora (
        usuario_id,
        accion,
        descripcion,
        ip
    ) VALUES (
        p_usuario_id,
        'FINALIZAR_ORDEN_TRABAJO',
        'Se finalizó la Orden de Trabajo ' || v_orden.codigo_orden || ' con diagnóstico: ' || SUBSTRING(p_diagnostico FROM 1 FOR 100),
        p_ip
    );

    RETURN jsonb_build_object(
        'orden', to_jsonb(v_orden),
        'consumos', v_consumos
    );
END;
$$;
