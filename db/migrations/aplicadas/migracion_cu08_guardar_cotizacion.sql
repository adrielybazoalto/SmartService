-- =====================================================================
--  SmartService - CU08 Guardar cotización en el servidor (Fase 8)
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente (CREATE OR REPLACE FUNCTION). Sin tablas nuevas.
--
--  fn_guardar_cotizacion crea o edita la cabecera y el detalle en UNA
--  transacción. Precios, subtotales y total se calculan aquí: lo que mande el
--  navegador se ignora. Al editar, las líneas ya cotizadas conservan su precio y
--  las nuevas toman el del catálogo. Solo se edita en PENDIENTE.
--  El correlativo COT-AAAA-NNNN se genera con un bloqueo.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_guardar_cotizacion(
    p_usuario_id         INTEGER,
    p_cotizacion_id      INTEGER,
    p_cliente_id         INTEGER,
    p_establecimiento_id INTEGER,
    p_productos          JSONB,
    p_servicios          JSONB,
    p_ip                 TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_productos JSONB := coalesce(p_productos, '[]'::jsonb);
    v_servicios JSONB := coalesce(p_servicios, '[]'::jsonb);
    v_hoy       DATE := (now() AT TIME ZONE 'America/La_Paz')::DATE;
    v_anio      TEXT := to_char(now() AT TIME ZONE 'America/La_Paz', 'YYYY');
    v_seq       INTEGER;
    v_numero    TEXT;
    v_id        INTEGER := p_cotizacion_id;
    v_estado    TEXT;
    v_fila      RECORD;
    v_nombre    TEXT;
    v_activo    BOOLEAN;
    v_precio    NUMERIC(12,2);
    v_subtotal  NUMERIC(12,2);
    v_total     NUMERIC(12,2) := 0;
    v_lineas_p  JSONB := '[]'::jsonb;
    v_lineas_s  JSONB := '[]'::jsonb;
BEGIN
    IF jsonb_typeof(v_productos) <> 'array' OR jsonb_typeof(v_servicios) <> 'array' THEN
        RAISE EXCEPTION 'El detalle de la cotización no es válido';
    END IF;
    IF jsonb_array_length(v_productos) + jsonb_array_length(v_servicios) = 0 THEN
        RAISE EXCEPTION 'No se puede guardar una cotización sin equipos ni servicios';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.cliente WHERE id = p_cliente_id) THEN
        RAISE EXCEPTION 'El cliente no existe';
    END IF;
    IF p_establecimiento_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.establecimiento WHERE id = p_establecimiento_id AND cliente_id = p_cliente_id
    ) THEN
        RAISE EXCEPTION 'El establecimiento no pertenece al cliente seleccionado';
    END IF;

    IF v_id IS NOT NULL THEN
        SELECT estado INTO v_estado FROM public.cotizacion WHERE id = v_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'La cotización no existe';
        END IF;
        IF v_estado <> 'PENDIENTE' THEN
            RAISE EXCEPTION 'Solo se puede editar una cotización en estado PENDIENTE';
        END IF;
    END IF;

    -- Productos (líneas repetidas se agrupan; orden fijo)
    FOR v_fila IN
        SELECT x.producto_id, round(sum(x.cantidad), 2) AS cantidad
          FROM jsonb_to_recordset(v_productos) AS x(producto_id INTEGER, cantidad NUMERIC)
         GROUP BY x.producto_id ORDER BY x.producto_id
    LOOP
        IF v_fila.cantidad IS NULL OR v_fila.cantidad <= 0 THEN
            RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
        END IF;

        SELECT p.nombre, p.estado,
               round(p.precio_compra_actual * (1 + coalesce(p.margen_ganancia, 0) / 100), 2)
          INTO v_nombre, v_activo, v_precio
          FROM public.producto p WHERE p.id = v_fila.producto_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El producto % no existe', v_fila.producto_id;
        END IF;

        IF EXISTS (SELECT 1 FROM public.detalle_cotizacion_producto d
                    WHERE d.cotizacion_id = v_id AND d.producto_id = v_fila.producto_id) THEN
            SELECT d.precio_unitario INTO v_precio FROM public.detalle_cotizacion_producto d
             WHERE d.cotizacion_id = v_id AND d.producto_id = v_fila.producto_id LIMIT 1;
        ELSIF v_activo IS NOT TRUE THEN
            RAISE EXCEPTION 'El producto "%" no está activo', v_nombre;
        END IF;

        v_subtotal := round(v_precio * v_fila.cantidad, 2);
        v_total := v_total + v_subtotal;
        v_lineas_p := v_lineas_p || jsonb_build_object(
            'producto_id', v_fila.producto_id, 'cantidad', v_fila.cantidad,
            'precio_unitario', v_precio, 'subtotal', v_subtotal);
    END LOOP;

    -- Servicios
    FOR v_fila IN
        SELECT x.servicio_id, round(sum(x.horas_estimadas), 2) AS horas
          FROM jsonb_to_recordset(v_servicios) AS x(servicio_id INTEGER, horas_estimadas NUMERIC)
         GROUP BY x.servicio_id ORDER BY x.servicio_id
    LOOP
        IF v_fila.horas IS NULL OR v_fila.horas <= 0 THEN
            RAISE EXCEPTION 'Las horas deben ser mayores a 0';
        END IF;

        SELECT s.nombre, s.activo, s.precio_hora_base
          INTO v_nombre, v_activo, v_precio
          FROM public.servicio s WHERE s.id = v_fila.servicio_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'El servicio % no existe', v_fila.servicio_id;
        END IF;

        IF EXISTS (SELECT 1 FROM public.detalle_cotizacion_servicio d
                    WHERE d.cotizacion_id = v_id AND d.servicio_id = v_fila.servicio_id) THEN
            SELECT d.precio_hora INTO v_precio FROM public.detalle_cotizacion_servicio d
             WHERE d.cotizacion_id = v_id AND d.servicio_id = v_fila.servicio_id LIMIT 1;
        ELSIF v_activo IS NOT TRUE THEN
            RAISE EXCEPTION 'El servicio "%" no está activo', v_nombre;
        END IF;

        v_subtotal := round(v_precio * v_fila.horas, 2);
        v_total := v_total + v_subtotal;
        v_lineas_s := v_lineas_s || jsonb_build_object(
            'servicio_id', v_fila.servicio_id, 'horas_estimadas', v_fila.horas,
            'precio_hora', v_precio, 'subtotal', v_subtotal);
    END LOOP;

    IF v_id IS NULL THEN
        -- Correlativo COT-AAAA-NNNN (bloqueo para que no se repita)
        PERFORM pg_advisory_xact_lock(hashtext('cotizacion_correlativo_' || v_anio));
        SELECT coalesce(max(split_part(numero_cotizacion, '-', 3)::INTEGER), 0) + 1 INTO v_seq
          FROM public.cotizacion
         WHERE numero_cotizacion ~ ('^COT-' || v_anio || '-[0-9]+$');
        v_numero := 'COT-' || v_anio || '-' || lpad(v_seq::TEXT, 4, '0');

        INSERT INTO public.cotizacion (
            cliente_id, establecimiento_id, usuario_id, numero_cotizacion,
            fecha_emision, fecha_vencimiento, estado, total
        ) VALUES (
            p_cliente_id, p_establecimiento_id, p_usuario_id, v_numero,
            v_hoy, v_hoy + 15, 'PENDIENTE', v_total
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.cotizacion
           SET cliente_id = p_cliente_id, establecimiento_id = p_establecimiento_id, total = v_total
         WHERE id = v_id
         RETURNING numero_cotizacion INTO v_numero;

        DELETE FROM public.detalle_cotizacion_producto WHERE cotizacion_id = v_id;
        DELETE FROM public.detalle_cotizacion_servicio WHERE cotizacion_id = v_id;
    END IF;

    INSERT INTO public.detalle_cotizacion_producto (cotizacion_id, producto_id, cantidad, precio_unitario, subtotal)
    SELECT v_id, x.producto_id, x.cantidad, x.precio_unitario, x.subtotal
      FROM jsonb_to_recordset(v_lineas_p) AS x(producto_id INTEGER, cantidad NUMERIC, precio_unitario NUMERIC, subtotal NUMERIC);

    INSERT INTO public.detalle_cotizacion_servicio (cotizacion_id, servicio_id, horas_estimadas, precio_hora, subtotal)
    SELECT v_id, x.servicio_id, x.horas_estimadas, x.precio_hora, x.subtotal
      FROM jsonb_to_recordset(v_lineas_s) AS x(servicio_id INTEGER, horas_estimadas NUMERIC, precio_hora NUMERIC, subtotal NUMERIC);

    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        CASE WHEN p_cotizacion_id IS NULL THEN 'CREAR_COTIZACION' ELSE 'ACTUALIZAR_COTIZACION' END,
        CASE WHEN p_cotizacion_id IS NULL
             THEN 'Se creó la cotización ' || v_numero || ' con estado PENDIENTE | total: ' || v_total
             ELSE 'Se actualizó la cotización ' || v_numero || ' | total: ' || v_total END,
        p_ip
    );

    RETURN jsonb_build_object('id', v_id, 'numero_cotizacion', v_numero, 'total', v_total);
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.fn_guardar_cotizacion(INTEGER, INTEGER, INTEGER, INTEGER, JSONB, JSONB, TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_guardar_cotizacion(INTEGER, INTEGER, INTEGER, INTEGER, JSONB, JSONB, TEXT) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_guardar_cotizacion(INTEGER, INTEGER, INTEGER, INTEGER, JSONB, JSONB, TEXT) TO service_role;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verificación (ejecutar aparte): anon = false, service_role = true
-- SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon,
--        has_function_privilege('service_role', oid, 'EXECUTE') AS service_role
--   FROM pg_proc WHERE proname = 'fn_guardar_cotizacion';
