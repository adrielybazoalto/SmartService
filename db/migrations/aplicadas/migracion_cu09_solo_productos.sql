-- =====================================================================
--  SmartService - CU09 La venta en mostrador solo admite productos
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente (CREATE OR REPLACE FUNCTION).
--
--  Los servicios se liquidan en la nota de servicio (CU13); no se agrega
--  detalle_venta.servicio_id. fn_registrar_venta_tarjeta no cambia: no tiene
--  rama de servicios y llama a esta función, así que hereda el rechazo.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_registrar_venta(
    p_usuario_id       INTEGER,
    p_cliente_id       INTEGER,
    p_tipo_pago        TEXT,
    p_tipo_comprobante TEXT,
    p_descuento        NUMERIC,
    p_items            JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_caja_id  INTEGER;
  v_venta_id INTEGER;
  v_anio     TEXT := to_char(CURRENT_DATE, 'YYYY');
  v_seq      INTEGER;
  v_nro      TEXT;
  v_desc     NUMERIC(12,2) := round(COALESCE(p_descuento, 0), 2);
  v_subtotal NUMERIC(12,2) := 0;
  v_total    NUMERIC(12,2);
  v_item     RECORD;
  v_prod     RECORD;
  v_precio   NUMERIC(12,2);
  v_lineas   JSONB := '[]'::JSONB;
  v_linea    JSONB;
BEGIN
  IF p_tipo_pago IS NULL OR p_tipo_pago NOT IN ('EFECTIVO','QR','TARJETA','TRANSFERENCIA') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Agregue al menos un producto o servicio a la venta';
  END IF;
  IF v_desc < 0 THEN
    RAISE EXCEPTION 'El descuento no puede ser negativo';
  END IF;

  -- Excepción: vender sin caja abierta (se bloquea la caja durante la venta)
  SELECT id INTO v_caja_id FROM public.caja
   WHERE usuario_id = p_usuario_id AND estado = 'ABIERTA'
   FOR UPDATE;
  IF v_caja_id IS NULL THEN
    RAISE EXCEPTION 'Debe abrir un turno de caja antes de vender';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.cliente WHERE id = p_cliente_id) THEN
    RAISE EXCEPTION 'El cliente no existe';
  END IF;

  -- 1ª pasada: validar y valorizar (líneas repetidas se agrupan)
  FOR v_item IN
    SELECT x.producto_id, x.servicio_id, round(SUM(x.cantidad), 2) AS cantidad
      FROM jsonb_to_recordset(p_items) AS x(producto_id INTEGER, servicio_id INTEGER, cantidad NUMERIC)
     GROUP BY x.producto_id, x.servicio_id
     ORDER BY x.producto_id NULLS LAST, x.servicio_id   -- orden fijo de bloqueo: evita interbloqueos
  LOOP
    IF v_item.servicio_id IS NOT NULL OR v_item.producto_id IS NULL THEN
      RAISE EXCEPTION 'La venta en mostrador (CU09) solo admite productos; los servicios se liquidan en la nota de servicio (CU13)';
    END IF;
    IF v_item.cantidad IS NULL OR v_item.cantidad <= 0 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
    END IF;

    SELECT id, nombre, stock_disponible, precio_compra_actual, COALESCE(margen_ganancia, 0) AS margen
      INTO v_prod FROM public.producto WHERE id = v_item.producto_id
       FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto % no existe', v_item.producto_id;
    END IF;
    -- Si el stock es INTEGER no se aceptan fracciones (PostgreSQL las
    -- redondearía en silencio y el kárdex no cuadraría).
    IF pg_typeof(v_prod.stock_disponible)::TEXT IN ('integer', 'bigint', 'smallint')
       AND v_item.cantidad <> trunc(v_item.cantidad) THEN
      RAISE EXCEPTION 'La cantidad de "%" debe ser un número entero', v_prod.nombre;
    END IF;
    -- Excepción: stock insuficiente → RAISE revierte la venta completa
    IF v_prod.stock_disponible::NUMERIC < v_item.cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente para "%": disponible %, solicitado %',
        v_prod.nombre, v_prod.stock_disponible, v_item.cantidad;
    END IF;
    v_precio := round(v_prod.precio_compra_actual::NUMERIC * (1 + v_prod.margen::NUMERIC / 100), 2);
    v_lineas := v_lineas || jsonb_build_object(
      'producto_id', v_prod.id, 'cantidad', v_item.cantidad, 'precio', v_precio,
      'stock_anterior', v_prod.stock_disponible);

    v_subtotal := v_subtotal + round(v_precio * v_item.cantidad, 2);
  END LOOP;

  -- Excepción: descuento mayor al subtotal
  IF v_desc > v_subtotal THEN
    RAISE EXCEPTION 'El descuento no puede ser mayor al subtotal';
  END IF;
  v_total := v_subtotal - v_desc;

  -- Correlativo NV-AAAA-00001 (bloqueo para que dos cajas no tomen el mismo)
  PERFORM pg_advisory_xact_lock(hashtext('venta_correlativo_' || v_anio));
  SELECT COALESCE(MAX(split_part(nro_comprobante, '-', 3)::INTEGER), 0) + 1 INTO v_seq
    FROM public.venta WHERE nro_comprobante ~ ('^NV-' || v_anio || '-[0-9]+$');
  v_nro := 'NV-' || v_anio || '-' || lpad(v_seq::TEXT, 5, '0');

  -- Cabecera
  INSERT INTO public.venta (caja_id, cliente_id, usuario_id, tipo_comprobante, nro_comprobante,
                            subtotal, descuento, total, estado, tipo_pago)
  VALUES (v_caja_id, p_cliente_id, p_usuario_id, p_tipo_comprobante, v_nro,
          v_subtotal, v_desc, v_total, 'EMITIDA', p_tipo_pago)
  RETURNING id INTO v_venta_id;

  -- 2ª pasada: detalle, stock y kárdex
  FOR v_linea IN SELECT * FROM jsonb_array_elements(v_lineas) LOOP
    INSERT INTO public.detalle_venta (venta_id, producto_id, cantidad, precio_unitario, subtotal)
    VALUES (v_venta_id,
            (v_linea ->> 'producto_id')::INTEGER,
            (v_linea ->> 'cantidad')::NUMERIC,
            (v_linea ->> 'precio')::NUMERIC,
            round((v_linea ->> 'precio')::NUMERIC * (v_linea ->> 'cantidad')::NUMERIC, 2));

    UPDATE public.producto
       SET stock_disponible = stock_disponible - (v_linea ->> 'cantidad')::NUMERIC
     WHERE id = (v_linea ->> 'producto_id')::INTEGER;

    -- include CU16: cada producto vendido registra una SALIDA
    INSERT INTO public.movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad,
                                          stock_anterior, origen_movimiento, observacion)
    VALUES ((v_linea ->> 'producto_id')::INTEGER, p_usuario_id, 'SALIDA',
            (v_linea ->> 'cantidad')::NUMERIC, (v_linea ->> 'stock_anterior')::NUMERIC,
            'VENTA', 'Venta ' || v_nro);
  END LOOP;

  RETURN jsonb_build_object('id', v_venta_id, 'nro_comprobante', v_nro,
                            'subtotal', v_subtotal, 'descuento', v_desc, 'total', v_total);
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) TO service_role;
    END IF;
END $$;

COMMIT;

-- Verificación (ejecutar aparte): ninguna de las dos debe usar servicio de venta
-- SELECT proname, prosrc LIKE '%detalle_venta (venta_id, servicio_id%' AS tiene_rama_servicio
--   FROM pg_proc WHERE proname IN ('fn_registrar_venta', 'fn_registrar_venta_tarjeta');
