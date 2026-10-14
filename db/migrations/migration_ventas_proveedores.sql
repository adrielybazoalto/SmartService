-- =====================================================================
-- SmartService · CU09 — Gestionar Ventas y Arqueo de Caja
-- Script MÍNIMO y seguro: agrega solo lo que le falta al CU09.
--
--  · NO toca la BITÁCORA (la columna `ip` la migra otro compañero).
--  · NO crea, borra ni renombra tablas o columnas existentes.
--  · NO cambia RLS, permisos de tablas ni datos de otros casos de uso.
--  · Solo AGREGA (IF NOT EXISTS) y crea 3 funciones nuevas del CU09.
--  · Se puede ejecutar varias veces; si algo falla, no se aplica nada.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 0. Verificación previa: las tablas del DDL deben existir.
--    Si falta alguna, se detiene sin modificar nada.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['caja','venta','detalle_venta','producto','servicio','cliente','movimiento_kardex'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Falta la tabla public.% del DDL: no se aplicó ningún cambio', t;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 1. Columnas nuevas (solo se agregan; las filas existentes no cambian)
-- ---------------------------------------------------------------------
-- Arqueo: diferencia entre lo contado y lo esperado, y su justificación
ALTER TABLE public.caja  ADD COLUMN IF NOT EXISTS monto_diferencia NUMERIC(12,2);
ALTER TABLE public.caja  ADD COLUMN IF NOT EXISTS observacion      TEXT;

-- Método de pago (paso 5). Las ventas que ya existan quedan como EFECTIVO.
ALTER TABLE public.venta ADD COLUMN IF NOT EXISTS tipo_pago VARCHAR(20) DEFAULT 'EFECTIVO';
DO $$ BEGIN
  ALTER TABLE public.venta ADD CONSTRAINT venta_tipo_pago_check
    CHECK (tipo_pago IN ('EFECTIVO','QR','TARJETA','TRANSFERENCIA'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- 2. Índices (solo si los datos actuales lo permiten; si no, se avisa
--    con un NOTICE y se sigue, sin romper nada)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  -- Un usuario no puede tener dos cajas ABIERTAS a la vez
  IF to_regclass('public.ux_caja_usuario_abierta') IS NULL THEN
    IF EXISTS (SELECT usuario_id FROM public.caja WHERE estado = 'ABIERTA'
                GROUP BY usuario_id HAVING count(*) > 1) THEN
      RAISE NOTICE 'Hay usuarios con más de una caja ABIERTA: no se creó ux_caja_usuario_abierta (el código igual lo valida)';
    ELSE
      CREATE UNIQUE INDEX ux_caja_usuario_abierta ON public.caja (usuario_id) WHERE estado = 'ABIERTA';
    END IF;
  END IF;

  -- El número de comprobante no se repite
  IF to_regclass('public.ux_venta_nro_comprobante') IS NULL THEN
    IF EXISTS (SELECT nro_comprobante FROM public.venta WHERE nro_comprobante IS NOT NULL
                GROUP BY nro_comprobante HAVING count(*) > 1) THEN
      RAISE NOTICE 'Hay números de comprobante repetidos: no se creó ux_venta_nro_comprobante';
    ELSE
      CREATE UNIQUE INDEX ux_venta_nro_comprobante ON public.venta (nro_comprobante);
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_venta_caja ON public.venta (caja_id);

-- ---------------------------------------------------------------------
-- 3. Cliente genérico "Cliente de mostrador" (precondición del CU09).
--    Solo se inserta si no existe. Si la tabla tiene alguna regla que lo
--    impida, se avisa y el resto del script continúa.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  tiene_nombre BOOLEAN;
  existe       BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'cliente' AND column_name = 'nombre')
    INTO tiene_nombre;

  IF tiene_nombre THEN
    EXECUTE $q$SELECT EXISTS (SELECT 1 FROM public.cliente
               WHERE nombre ILIKE 'Cliente de mostrador' OR razon_social ILIKE 'Cliente de mostrador'
                  OR documento_identidad = 'S/N-MOSTRADOR')$q$ INTO existe;
  ELSE
    SELECT EXISTS (SELECT 1 FROM public.cliente
                    WHERE razon_social ILIKE 'Cliente de mostrador' OR documento_identidad = 'S/N-MOSTRADOR')
      INTO existe;
  END IF;

  IF NOT existe THEN
    BEGIN
      IF tiene_nombre THEN
        EXECUTE $q$INSERT INTO public.cliente (nombre, tipo_cliente, razon_social, documento_identidad)
                   VALUES ('Cliente de mostrador', 'NATURAL', 'Cliente de mostrador', 'S/N-MOSTRADOR')$q$;
      ELSE
        EXECUTE $q$INSERT INTO public.cliente (tipo_cliente, razon_social, documento_identidad)
                   VALUES ('NATURAL', 'Cliente de mostrador', 'S/N-MOSTRADOR')$q$;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'No se pudo crear "Cliente de mostrador" (%). Regístrelo desde Clientes (CU07).', SQLERRM;
    END;
  END IF;
END $$;

-- =====================================================================
-- 4. fn_registrar_venta — paso 7 del CU09 en UNA transacción
--    Cabecera + detalle + descuento de stock + SALIDA en kárdex (CU16).
--    Cualquier RAISE revierte TODO (stock insuficiente, descuento, etc.).
--    p_items: [{"producto_id": 1, "cantidad": 2}, {"servicio_id": 3, "cantidad": 1.5}]
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_registrar_venta(
  p_usuario_id       INTEGER,
  p_cliente_id       INTEGER,
  p_tipo_pago        TEXT,
  p_tipo_comprobante TEXT,
  p_descuento        NUMERIC,
  p_items            JSONB
) RETURNS JSONB
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
  v_serv     RECORD;
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
    IF (v_item.producto_id IS NULL) = (v_item.servicio_id IS NULL) THEN
      RAISE EXCEPTION 'Cada línea debe ser un producto o un servicio';
    END IF;
    IF v_item.cantidad IS NULL OR v_item.cantidad <= 0 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
    END IF;

    IF v_item.producto_id IS NOT NULL THEN
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
      IF v_prod.stock_disponible < v_item.cantidad THEN
        RAISE EXCEPTION 'Stock insuficiente para "%": disponible %, solicitado %',
          v_prod.nombre, v_prod.stock_disponible, v_item.cantidad;
      END IF;
      v_precio := round(v_prod.precio_compra_actual * (1 + v_prod.margen / 100), 2);
      v_lineas := v_lineas || jsonb_build_object(
        'producto_id', v_prod.id, 'cantidad', v_item.cantidad, 'precio', v_precio,
        'stock_anterior', v_prod.stock_disponible);
    ELSE
      SELECT * INTO v_serv FROM public.servicio WHERE id = v_item.servicio_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El servicio % no existe', v_item.servicio_id;
      END IF;
      IF (to_jsonb(v_serv) ->> 'activo') = 'false' THEN
        RAISE EXCEPTION 'El servicio "%" no está activo', v_serv.nombre;
      END IF;
      v_precio := round((to_jsonb(v_serv) ->> 'precio_hora_base')::NUMERIC, 2);
      v_lineas := v_lineas || jsonb_build_object(
        'servicio_id', v_serv.id, 'cantidad', v_item.cantidad, 'precio', v_precio);
    END IF;

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
    INSERT INTO public.detalle_venta (venta_id, producto_id, servicio_id, cantidad, precio_unitario, subtotal)
    VALUES (v_venta_id,
            (v_linea ->> 'producto_id')::INTEGER,
            (v_linea ->> 'servicio_id')::INTEGER,
            (v_linea ->> 'cantidad')::NUMERIC,
            (v_linea ->> 'precio')::NUMERIC,
            round((v_linea ->> 'precio')::NUMERIC * (v_linea ->> 'cantidad')::NUMERIC, 2));

    IF v_linea ? 'producto_id' THEN
      UPDATE public.producto
         SET stock_disponible = stock_disponible - (v_linea ->> 'cantidad')::NUMERIC
       WHERE id = (v_linea ->> 'producto_id')::INTEGER;

      -- include CU16: cada producto vendido registra una SALIDA
      INSERT INTO public.movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad,
                                            stock_anterior, origen_movimiento, observacion)
      VALUES ((v_linea ->> 'producto_id')::INTEGER, p_usuario_id, 'SALIDA',
              (v_linea ->> 'cantidad')::NUMERIC, (v_linea ->> 'stock_anterior')::NUMERIC,
              'VENTA', 'Venta ' || v_nro);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('id', v_venta_id, 'nro_comprobante', v_nro,
                            'subtotal', v_subtotal, 'descuento', v_desc, 'total', v_total);
END;
$$;

-- =====================================================================
-- 5. fn_anular_venta — subflujo "Anular venta" en UNA transacción.
--    Solo turno ABIERTO y del mismo usuario; devuelve el stock de los
--    productos con una ENTRADA en el kárdex (los servicios no tienen stock).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_anular_venta(
  p_usuario_id INTEGER,
  p_venta_id   INTEGER
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_venta RECORD;
  v_det   RECORD;
  v_stock NUMERIC;
BEGIN
  SELECT v.id, v.nro_comprobante, v.estado, c.estado AS caja_estado, c.usuario_id AS caja_usuario
    INTO v_venta
    FROM public.venta v JOIN public.caja c ON c.id = v.caja_id
   WHERE v.id = p_venta_id
     FOR UPDATE OF v;
  IF NOT FOUND THEN RAISE EXCEPTION 'La venta no existe'; END IF;
  IF v_venta.estado = 'ANULADA' THEN RAISE EXCEPTION 'La venta ya está anulada'; END IF;
  IF v_venta.caja_estado <> 'ABIERTA' THEN
    RAISE EXCEPTION 'No se puede anular una venta de un turno cerrado';
  END IF;
  IF v_venta.caja_usuario <> p_usuario_id THEN
    RAISE EXCEPTION 'No tiene permiso para anular ventas del turno de otro usuario';
  END IF;

  FOR v_det IN SELECT producto_id, cantidad FROM public.detalle_venta
                WHERE venta_id = p_venta_id AND producto_id IS NOT NULL
                ORDER BY producto_id LOOP
    SELECT stock_disponible INTO v_stock FROM public.producto WHERE id = v_det.producto_id FOR UPDATE;
    UPDATE public.producto SET stock_disponible = stock_disponible + v_det.cantidad WHERE id = v_det.producto_id;
    INSERT INTO public.movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad,
                                          stock_anterior, origen_movimiento, observacion)
    VALUES (v_det.producto_id, p_usuario_id, 'ENTRADA', v_det.cantidad, v_stock,
            'ANULACION_VENTA', 'Anulación ' || v_venta.nro_comprobante);
  END LOOP;

  UPDATE public.venta SET estado = 'ANULADA' WHERE id = p_venta_id;
  RETURN jsonb_build_object('id', p_venta_id, 'nro_comprobante', v_venta.nro_comprobante);
END;
$$;

-- =====================================================================
-- 6. fn_cerrar_caja — pasos 9-10: arqueo y cierre en UNA transacción.
--    efectivo esperado = monto_inicial + Σ ventas EMITIDAS en EFECTIVO
--    diferencia        = efectivo contado − efectivo esperado
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_cerrar_caja(
  p_usuario_id  INTEGER,
  p_monto_real  NUMERIC,
  p_observacion TEXT DEFAULT NULL,
  p_caja_id     INTEGER DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_caja       RECORD;
  v_real       NUMERIC(12,2) := round(p_monto_real, 2);
  v_efectivo   NUMERIC(12,2);
  v_esperado   NUMERIC(12,2);
  v_diferencia NUMERIC(12,2);
  v_obs        TEXT := NULLIF(btrim(COALESCE(p_observacion, '')), '');
BEGIN
  IF v_real IS NULL OR v_real < 0 THEN
    RAISE EXCEPTION 'Ingrese el efectivo contado (monto mayor o igual a 0)';
  END IF;

  IF p_caja_id IS NOT NULL THEN
    SELECT * INTO v_caja FROM public.caja WHERE id = p_caja_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La caja no existe'; END IF;
    IF v_caja.usuario_id <> p_usuario_id THEN
      RAISE EXCEPTION 'No tiene permiso para cerrar la caja de otro usuario';
    END IF;
    IF v_caja.estado <> 'ABIERTA' THEN RAISE EXCEPTION 'La caja ya está cerrada'; END IF;
  ELSE
    SELECT * INTO v_caja FROM public.caja
     WHERE usuario_id = p_usuario_id AND estado = 'ABIERTA' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No tiene una caja abierta para cerrar'; END IF;
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_efectivo
    FROM public.venta
   WHERE caja_id = v_caja.id AND estado = 'EMITIDA' AND COALESCE(tipo_pago, 'EFECTIVO') = 'EFECTIVO';

  v_esperado   := v_caja.monto_inicial + v_efectivo;
  v_diferencia := v_real - v_esperado;

  IF v_diferencia <> 0 AND length(COALESCE(v_obs, '')) < 5 THEN
    RAISE EXCEPTION 'Hay diferencia en el arqueo: registre una observación que la justifique';
  END IF;

  UPDATE public.caja
     SET fecha_cierre        = CURRENT_TIMESTAMP,
         monto_final_sistema = v_esperado,
         monto_final_real    = v_real,
         monto_diferencia    = v_diferencia,
         observacion         = v_obs,
         estado              = 'CERRADA'
   WHERE id = v_caja.id;

  RETURN jsonb_build_object('caja_id', v_caja.id, 'efectivo_esperado', v_esperado,
                            'efectivo_contado', v_real, 'diferencia', v_diferencia);
END;
$$;

-- ---------------------------------------------------------------------
-- 7. Permisos SOLO de estas 3 funciones nuevas: las ejecuta el backend
--    (service_role), no el navegador.
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_anular_venta(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_cerrar_caja(INTEGER, NUMERIC, TEXT, INTEGER) FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) FROM anon, authenticated;
  REVOKE ALL ON FUNCTION public.fn_anular_venta(INTEGER, INTEGER) FROM anon, authenticated;
  REVOKE ALL ON FUNCTION public.fn_cerrar_caja(INTEGER, NUMERIC, TEXT, INTEGER) FROM anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) TO service_role;
  GRANT EXECUTE ON FUNCTION public.fn_anular_venta(INTEGER, INTEGER) TO service_role;
  GRANT EXECUTE ON FUNCTION public.fn_cerrar_caja(INTEGER, NUMERIC, TEXT, INTEGER) TO service_role;
EXCEPTION WHEN undefined_object THEN NULL;  -- fuera de Supabase no existen esos roles
END $$;

COMMIT;

-- Refresca la caché de Supabase para que vea las funciones y columnas nuevas
NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- SmartService · Diagnóstico del CU09 (solo lectura: no modifica nada)
-- La bitácora (columna ip) no se revisa aquí: la migra otro compañero.
-- Pégalo en Supabase → SQL Editor → Run. Cada fila dice OK o qué falta.
-- =====================================================================
WITH chequeos AS (
  -- 1. Funciones de la migración 20261012_cu09_ventas_caja.sql
  SELECT 1 AS orden, 'Función fn_registrar_venta' AS verificacion,
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'fn_registrar_venta') AS ok,
         'Ejecute 20261012_cu09_solo_lo_necesario.sql' AS si_falla
  UNION ALL
  SELECT 2, 'Función fn_anular_venta',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'fn_anular_venta'),
         'Ejecute 20261012_cu09_solo_lo_necesario.sql'
  UNION ALL
  SELECT 3, 'Función fn_cerrar_caja (cierre de caja)',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'fn_cerrar_caja'),
         'Ejecute 20261012_cu09_solo_lo_necesario.sql'
  UNION ALL
  -- 2. Columnas que agrega la migración
  SELECT 4, 'Columna venta.tipo_pago',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'venta' AND column_name = 'tipo_pago'),
         'Ejecute 20261012_cu09_solo_lo_necesario.sql'
  UNION ALL
  SELECT 5, 'Columna caja.monto_diferencia',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'caja' AND column_name = 'monto_diferencia'),
         'Ejecute 20261012_cu09_solo_lo_necesario.sql'
  UNION ALL
  -- 4. Datos necesarios para vender
  SELECT 7, 'Cliente genérico "Cliente de mostrador"',
         EXISTS (SELECT 1 FROM public.cliente WHERE razon_social ILIKE 'Cliente de mostrador'),
         'Ejecute 20261012_cu09_solo_lo_necesario.sql'
  UNION ALL
  SELECT 8, 'Hay productos (' || (SELECT count(*) FROM public.producto) || ')',
         (SELECT count(*) FROM public.producto) > 0, 'Registre productos (CU16)'
  UNION ALL
  SELECT 9, 'Hay clientes (' || (SELECT count(*) FROM public.cliente) || ')',
         (SELECT count(*) FROM public.cliente) > 0, 'Registre clientes (CU07)'
  UNION ALL
  SELECT 10, 'Hay servicios (' || (SELECT count(*) FROM public.servicio) || ')',
         (SELECT count(*) FROM public.servicio) > 0, 'Registre servicios (CU17)'
  UNION ALL
  -- 5. RLS: si está activo y el servidor NO usa la clave service_role,
  --    las consultas devuelven listas vacías sin dar error.
  SELECT 11, 'RLS en producto / cliente / servicio: ' ||
         COALESCE((SELECT string_agg(c.relname || '=' || CASE WHEN c.relrowsecurity THEN 'activo' ELSE 'no' END, ', ')
                     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relname IN ('producto', 'cliente', 'servicio')), '-'),
         NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                      WHERE n.nspname = 'public' AND c.relname IN ('producto', 'cliente', 'servicio')
                        AND c.relrowsecurity),
         'Con RLS activo, getSupabaseServiceClient() debe usar SUPABASE_SERVICE_ROLE_KEY (no la anon key)'
)
SELECT verificacion,
       CASE WHEN ok THEN 'OK' ELSE 'FALTA' END AS estado,
       CASE WHEN ok THEN '' ELSE si_falla END AS que_hacer
  FROM chequeos
 ORDER BY orden;

SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('caja','venta','detalle_venta','producto','servicio','cliente','movimiento_kardex')
ORDER BY table_name, ordinal_position;
  ALTER TABLE public.detalle_venta ALTER COLUMN producto_id DROP NOT NULL;
  SELECT conrelid::regclass AS tabla, conname AS regla, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE contype = 'c'
  AND conrelid::regclass::text IN ('caja','venta','detalle_venta','producto','movimiento_kardex','cliente')
ORDER BY 1, 2;
BEGIN;

SELECT public.fn_registrar_venta(
  (SELECT usuario_id FROM public.caja WHERE estado = 'ABIERTA' ORDER BY id DESC LIMIT 1),
  (SELECT id FROM public.cliente ORDER BY id LIMIT 1),
  'EFECTIVO',
  'NOTA_VENTA',
  0,
  jsonb_build_array(jsonb_build_object(
    'producto_id', (SELECT id FROM public.producto WHERE stock_disponible >= 1 ORDER BY id LIMIT 1),
    'cantidad', 1))
) AS resultado;

ROLLBACK;
-- =====================================================================
-- SmartService · CU09 — Arreglo de fn_registrar_venta
-- Reemplaza SOLO la función de venta. No cambia ninguna tabla.
-- Motivo: tu detalle_venta no tiene servicio_id; la versión anterior de la
-- función intentaba guardar esa columna y la venta fallaba (error 42703).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_registrar_venta(
  p_usuario_id       INTEGER,
  p_cliente_id       INTEGER,
  p_tipo_pago        TEXT,
  p_tipo_comprobante TEXT,
  p_descuento        NUMERIC,
  p_items            JSONB
) RETURNS JSONB
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
  v_serv     RECORD;
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
    IF (v_item.producto_id IS NULL) = (v_item.servicio_id IS NULL) THEN
      RAISE EXCEPTION 'Cada línea debe ser un producto o un servicio';
    END IF;
    IF v_item.cantidad IS NULL OR v_item.cantidad <= 0 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
    END IF;

    IF v_item.producto_id IS NOT NULL THEN
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
    ELSE
      -- detalle_venta debe poder guardar servicios (columna servicio_id y producto_id opcional)
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'detalle_venta' AND column_name = 'servicio_id')
         OR EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'detalle_venta'
                       AND column_name = 'producto_id' AND is_nullable = 'NO') THEN
        RAISE EXCEPTION 'La tabla detalle_venta todavía no admite servicios: solo se pueden vender productos';
      END IF;
      SELECT * INTO v_serv FROM public.servicio WHERE id = v_item.servicio_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El servicio % no existe', v_item.servicio_id;
      END IF;
      IF (to_jsonb(v_serv) ->> 'activo') = 'false' THEN
        RAISE EXCEPTION 'El servicio "%" no está activo', v_serv.nombre;
      END IF;
      v_precio := round((to_jsonb(v_serv) ->> 'precio_hora_base')::NUMERIC, 2);
      v_lineas := v_lineas || jsonb_build_object(
        'servicio_id', v_serv.id, 'cantidad', v_item.cantidad, 'precio', v_precio);
    END IF;

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
    IF v_linea ? 'producto_id' THEN
      -- Línea de producto: no usa servicio_id (funciona aunque esa columna no exista)
      INSERT INTO public.detalle_venta (venta_id, producto_id, cantidad, precio_unitario, subtotal)
      VALUES (v_venta_id,
              (v_linea ->> 'producto_id')::INTEGER,
              (v_linea ->> 'cantidad')::NUMERIC,
              (v_linea ->> 'precio')::NUMERIC,
              round((v_linea ->> 'precio')::NUMERIC * (v_linea ->> 'cantidad')::NUMERIC, 2));
    ELSE
      INSERT INTO public.detalle_venta (venta_id, servicio_id, cantidad, precio_unitario, subtotal)
      VALUES (v_venta_id,
              (v_linea ->> 'servicio_id')::INTEGER,
              (v_linea ->> 'cantidad')::NUMERIC,
              (v_linea ->> 'precio')::NUMERIC,
              round((v_linea ->> 'precio')::NUMERIC * (v_linea ->> 'cantidad')::NUMERIC, 2));
    END IF;

    IF v_linea ? 'producto_id' THEN
      UPDATE public.producto
         SET stock_disponible = stock_disponible - (v_linea ->> 'cantidad')::NUMERIC
       WHERE id = (v_linea ->> 'producto_id')::INTEGER;

      -- include CU16: cada producto vendido registra una SALIDA
      INSERT INTO public.movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad,
                                            stock_anterior, origen_movimiento, observacion)
      VALUES ((v_linea ->> 'producto_id')::INTEGER, p_usuario_id, 'SALIDA',
              (v_linea ->> 'cantidad')::NUMERIC, (v_linea ->> 'stock_anterior')::NUMERIC,
              'VENTA', 'Venta ' || v_nro);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('id', v_venta_id, 'nro_comprobante', v_nro,
                            'subtotal', v_subtotal, 'descuento', v_desc, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) FROM anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) TO service_role;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

-- Debe salir: funcion_actualizada = true
SELECT position('todavía no admite servicios' IN prosrc) > 0 AS funcion_actualizada
  FROM pg_proc WHERE proname = 'fn_registrar_venta';
  -- =====================================================================
-- SmartService · CU09 — Arreglo de fn_registrar_venta
-- Reemplaza SOLO la función de venta. No cambia ninguna tabla.
-- Motivo: tu detalle_venta no tiene servicio_id; la versión anterior de la
-- función intentaba guardar esa columna y la venta fallaba (error 42703).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_registrar_venta(
  p_usuario_id       INTEGER,
  p_cliente_id       INTEGER,
  p_tipo_pago        TEXT,
  p_tipo_comprobante TEXT,
  p_descuento        NUMERIC,
  p_items            JSONB
) RETURNS JSONB
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
  v_serv     RECORD;
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
    IF (v_item.producto_id IS NULL) = (v_item.servicio_id IS NULL) THEN
      RAISE EXCEPTION 'Cada línea debe ser un producto o un servicio';
    END IF;
    IF v_item.cantidad IS NULL OR v_item.cantidad <= 0 THEN
      RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
    END IF;

    IF v_item.producto_id IS NOT NULL THEN
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
    ELSE
      -- detalle_venta debe poder guardar servicios (columna servicio_id y producto_id opcional)
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'detalle_venta' AND column_name = 'servicio_id')
         OR EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'detalle_venta'
                       AND column_name = 'producto_id' AND is_nullable = 'NO') THEN
        RAISE EXCEPTION 'La tabla detalle_venta todavía no admite servicios: solo se pueden vender productos';
      END IF;
      SELECT * INTO v_serv FROM public.servicio WHERE id = v_item.servicio_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El servicio % no existe', v_item.servicio_id;
      END IF;
      IF (to_jsonb(v_serv) ->> 'activo') = 'false' THEN
        RAISE EXCEPTION 'El servicio "%" no está activo', v_serv.nombre;
      END IF;
      v_precio := round((to_jsonb(v_serv) ->> 'precio_hora_base')::NUMERIC, 2);
      v_lineas := v_lineas || jsonb_build_object(
        'servicio_id', v_serv.id, 'cantidad', v_item.cantidad, 'precio', v_precio);
    END IF;

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
    IF v_linea ? 'producto_id' THEN
      -- Línea de producto: no usa servicio_id (funciona aunque esa columna no exista)
      INSERT INTO public.detalle_venta (venta_id, producto_id, cantidad, precio_unitario, subtotal)
      VALUES (v_venta_id,
              (v_linea ->> 'producto_id')::INTEGER,
              (v_linea ->> 'cantidad')::NUMERIC,
              (v_linea ->> 'precio')::NUMERIC,
              round((v_linea ->> 'precio')::NUMERIC * (v_linea ->> 'cantidad')::NUMERIC, 2));
    ELSE
      INSERT INTO public.detalle_venta (venta_id, servicio_id, cantidad, precio_unitario, subtotal)
      VALUES (v_venta_id,
              (v_linea ->> 'servicio_id')::INTEGER,
              (v_linea ->> 'cantidad')::NUMERIC,
              (v_linea ->> 'precio')::NUMERIC,
              round((v_linea ->> 'precio')::NUMERIC * (v_linea ->> 'cantidad')::NUMERIC, 2));
    END IF;

    IF v_linea ? 'producto_id' THEN
      UPDATE public.producto
         SET stock_disponible = stock_disponible - (v_linea ->> 'cantidad')::NUMERIC
       WHERE id = (v_linea ->> 'producto_id')::INTEGER;

      -- include CU16: cada producto vendido registra una SALIDA
      INSERT INTO public.movimiento_kardex (producto_id, usuario_id, tipo_movimiento, cantidad,
                                            stock_anterior, origen_movimiento, observacion)
      VALUES ((v_linea ->> 'producto_id')::INTEGER, p_usuario_id, 'SALIDA',
              (v_linea ->> 'cantidad')::NUMERIC, (v_linea ->> 'stock_anterior')::NUMERIC,
              'VENTA', 'Venta ' || v_nro);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('id', v_venta_id, 'nro_comprobante', v_nro,
                            'subtotal', v_subtotal, 'descuento', v_desc, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) FROM anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.fn_registrar_venta(INTEGER, INTEGER, TEXT, TEXT, NUMERIC, JSONB) TO service_role;
EXCEPTION WHEN undefined_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

-- Debe salir: funcion_actualizada = true
SELECT position('todavía no admite servicios' IN prosrc) > 0 AS funcion_actualizada
  FROM pg_proc WHERE proname = 'fn_registrar_venta';
  -- 1) Columnas
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('proveedor','producto_proveedor','bitacora')
ORDER BY table_name, ordinal_position;
-- 2) Reglas e índices únicos
SELECT conrelid::regclass AS tabla, conname AS regla, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid::regclass::text IN ('proveedor','producto_proveedor')
UNION ALL
SELECT tablename::regclass, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename IN ('proveedor','producto_proveedor');
-- =====================================================================
-- SmartService · CU14 — Gestionar Proveedores y Catálogo de Mayoristas
-- Script MÍNIMO y seguro, hecho a partir de la estructura REAL de la base.
--
-- Agrega solo lo que el CU14 necesita y hoy falta:
--   · proveedor.direccion            (paso 2: "... correo y dirección")
--   · proveedor.estado               (subflujo "Desactivar proveedor")
--   · producto_proveedor.fecha_actualizacion
--                                    (paso 5: "cada vínculo con la fecha de actualización")
--   · código de ítem único por proveedor (excepción "Código de ítem repetido")
--
--  · NO toca la BITÁCORA (ya tiene la columna `ip`).
--  · NO cambia ni borra columnas, reglas ni datos existentes.
--  · Se puede ejecutar varias veces; si algo falla, no se aplica nada.
-- =====================================================================
BEGIN;

-- 0. Las tablas deben existir
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['proveedor','producto_proveedor','producto'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'Falta la tabla public.%: no se aplicó ningún cambio', t;
    END IF;
  END LOOP;
END $$;

-- 1. Columnas nuevas (las filas existentes quedan: direccion vacía,
--    estado = activo, fecha_actualizacion = ahora)
ALTER TABLE public.proveedor ADD COLUMN IF NOT EXISTS direccion VARCHAR(255);
ALTER TABLE public.proveedor ADD COLUMN IF NOT EXISTS estado BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.producto_proveedor ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- 2. Código de ítem único dentro de cada proveedor (sin distinguir mayúsculas).
--    Solo se crea si los datos actuales no tienen códigos repetidos; si los
--    tienen, se avisa y el código de la aplicación igual lo valida.
DO $$
BEGIN
  IF to_regclass('public.ux_prodprov_codigo') IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.producto_proveedor
                WHERE codigo_item_proveedor IS NOT NULL AND btrim(codigo_item_proveedor) <> ''
                GROUP BY proveedor_id, upper(btrim(codigo_item_proveedor)) HAVING count(*) > 1) THEN
      RAISE NOTICE 'Hay códigos de ítem repetidos en un mismo proveedor: no se creó ux_prodprov_codigo';
    ELSE
      CREATE UNIQUE INDEX ux_prodprov_codigo
        ON public.producto_proveedor (proveedor_id, upper(btrim(codigo_item_proveedor)))
        WHERE codigo_item_proveedor IS NOT NULL AND btrim(codigo_item_proveedor) <> '';
    END IF;
  END IF;
END $$;

COMMIT;

-- Refresca la caché de Supabase para que vea las columnas nuevas
NOTIFY pgrst, 'reload schema';

-- Comprobación: deben salir 3 filas
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND ((table_name = 'proveedor' AND column_name IN ('direccion', 'estado'))
     OR (table_name = 'producto_proveedor' AND column_name = 'fecha_actualizacion'))
 ORDER BY 1, 2;
