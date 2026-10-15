-- ============================================================
-- MIGRACIÓN CU15 — Registrar Compras de Equipos e Insumos
--
-- ORDEN DE EJECUCIÓN:
--   0) diagnostico_cu15_cu16.sql          (solo lectura)
--   1) migracion_cu16_inventario.sql      (núcleo del kárdex, permisos, private)
--   2) migracion_cu15_compras.sql         (ESTE ARCHIVO)
--
-- Ejecutar en el SQL Editor de un proyecto Supabase de DESARROLLO primero.
-- Todo el script corre en UNA transacción. IDEMPOTENTE. NO DESTRUCTIVA.
--
-- Qué agrega:
--   PROVEEDOR          + estado               (solo si no existe; definición acordada con CU14)
--   PRODUCTO_PROVEEDOR + fecha_actualizacion  (solo si no existe; definición acordada con CU14)
--   COMPRA, DETALLE_COMPRA (solo inserción; escritura únicamente vía función)
--   MOVIMIENTO_KARDEX  + FK compra_id → COMPRA
--   RPC pública        fn_registrar_compra (transacción atómica)
--   Permisos           FUNCION 'Compras' + ROL_FUNCION + PERMISO /compras
--
-- Decisiones aplicadas: D1 (documento único por proveedor+tipo+número),
-- D2 (último costo solo si la compra es la de fecha más reciente),
-- D3 (costo > 0). D6 NO aplicada: sin límite de antigüedad de la fecha.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. VERIFICACIONES PREVIAS
-- ------------------------------------------------------------
DO $$
DECLARE
    v_faltan text;
BEGIN
    -- Requiere migracion_cu16_inventario.sql
    IF to_regprocedure('private.fn_kardex_aplicar(integer, integer, text, text, numeric, text, text, integer, text)') IS NULL
       OR to_regprocedure('private.fn_verificar_permiso(integer, text, text)') IS NULL
       OR to_regprocedure('private.fn_registrar_bitacora(integer, text, text, text)') IS NULL
       OR to_regprocedure('private.fn_bloquear_modificacion()') IS NULL
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = 'movimiento_kardex'
                         AND column_name = 'compra_id') THEN
        RAISE EXCEPTION 'CU15: ejecute primero migracion_cu16_inventario.sql';
    END IF;

    IF to_regclass('public.proveedor') IS NULL OR to_regclass('public.producto_proveedor') IS NULL THEN
        RAISE EXCEPTION 'CU15: faltan las tablas proveedor / producto_proveedor';
    END IF;

    -- El precio pactado se escribe con UPDATE + INSERT (no depende de un índice
    -- único, que pertenece a CU14). Si el índice falta solo se advierte: la
    -- unicidad por (producto, proveedor) dentro de fn_registrar_compra la
    -- garantiza el bloqueo FOR UPDATE del producto.
    IF NOT EXISTS (
        SELECT 1
          FROM pg_index i
         WHERE i.indrelid = 'public.producto_proveedor'::regclass
           AND i.indisunique
           AND i.indpred IS NULL
           AND i.indnkeyatts = 2
           AND (SELECT array_agg(a.attname::text ORDER BY a.attname::text)
                  FROM pg_attribute a
                 WHERE a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey))
               = ARRAY['producto_id','proveedor_id']
    ) THEN
        RAISE WARNING 'CU15: producto_proveedor no tiene índice único (producto_id, proveedor_id); coordinar con CU14';
    END IF;

    -- Columnas NOT NULL sin DEFAULT no previstas (p. ej. stock_disponible de CU14)
    SELECT string_agg(column_name, ', ') INTO v_faltan
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'producto_proveedor'
       AND is_nullable = 'NO' AND column_default IS NULL AND is_generated = 'NEVER'
       AND column_name NOT IN ('producto_id','proveedor_id','precio_compra');
    IF v_faltan IS NOT NULL THEN
        RAISE EXCEPTION 'CU15: producto_proveedor tiene columnas NOT NULL sin DEFAULT no previstas: % (coordinar con CU14)', v_faltan;
    END IF;

    -- Si CU14 ya creó las columnas, deben tener el tipo esperado
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'proveedor'
                  AND column_name = 'estado' AND data_type <> 'boolean') THEN
        RAISE EXCEPTION 'CU15: proveedor.estado existe y no es boolean (coordinar con CU14)';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'producto_proveedor'
                  AND column_name = 'fecha_actualizacion'
                  AND data_type NOT IN ('timestamp with time zone','timestamp without time zone')) THEN
        RAISE EXCEPTION 'CU15: producto_proveedor.fecha_actualizacion existe con un tipo inesperado';
    END IF;

    -- Si COMPRA ya existe (re-ejecución), debe ser la de este diseño
    IF to_regclass('public.compra') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'compra'
           AND column_name = 'nro_documento_normalizado') THEN
        RAISE EXCEPTION 'CU15: ya existe una tabla compra con otra estructura';
    END IF;
END $$;

-- ------------------------------------------------------------
-- 1. COLUMNAS COMPARTIDAS CON CU14 (solo si no existen)
-- ------------------------------------------------------------
ALTER TABLE public.proveedor
    ADD COLUMN IF NOT EXISTS estado BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.producto_proveedor
    ADD COLUMN IF NOT EXISTS fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ------------------------------------------------------------
-- 2. COMPRA (cabecera)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compra (
    id SERIAL PRIMARY KEY,
    proveedor_id   INTEGER NOT NULL,
    usuario_id     INTEGER NOT NULL,
    tipo_documento VARCHAR(20) NOT NULL,
    nro_documento  VARCHAR(50) NOT NULL,
    -- Clave de unicidad: mayúsculas, sin espacios, puntos, barras ni guiones.
    -- Conserva ceros a la izquierda (12345 ≠ 0012345).
    nro_documento_normalizado VARCHAR(50)
        GENERATED ALWAYS AS (upper(regexp_replace(nro_documento, '[\s./-]', '', 'g'))) STORED,
    fecha_compra   DATE NOT NULL,
    total          NUMERIC(12,2) NOT NULL,
    observacion    TEXT,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_compra_proveedor
        FOREIGN KEY (proveedor_id) REFERENCES public.proveedor(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT fk_compra_usuario
        FOREIGN KEY (usuario_id) REFERENCES public.usuario(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT chk_compra_tipo_documento
        CHECK (tipo_documento IN ('FACTURA','NOTA')),

    CONSTRAINT chk_compra_nro_documento
        CHECK (nro_documento ~ '^[A-Za-z0-9][A-Za-z0-9 ./-]*$'),

    CONSTRAINT chk_compra_total
        CHECK (total > 0),

    -- D1: un mismo documento no puede registrarse dos veces para el mismo proveedor
    CONSTRAINT uq_compra_documento
        UNIQUE (proveedor_id, tipo_documento, nro_documento_normalizado)
);

COMMENT ON TABLE public.compra IS
    'CU15: cabecera de compra. Solo inserción; se registra únicamente con fn_registrar_compra.';

-- ------------------------------------------------------------
-- 3. DETALLE_COMPRA (líneas; costo histórico inmutable)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.detalle_compra (
    id SERIAL PRIMARY KEY,
    compra_id      INTEGER NOT NULL,
    producto_id    INTEGER NOT NULL,
    cantidad       NUMERIC(12,2) NOT NULL,
    costo_unitario NUMERIC(12,2) NOT NULL,
    subtotal       NUMERIC(12,2) NOT NULL,

    CONSTRAINT fk_detalle_compra_compra
        FOREIGN KEY (compra_id) REFERENCES public.compra(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT fk_detalle_compra_producto
        FOREIGN KEY (producto_id) REFERENCES public.producto(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,

    CONSTRAINT chk_detalle_compra_cantidad
        CHECK (cantidad > 0),

    CONSTRAINT chk_detalle_compra_costo
        CHECK (costo_unitario > 0),

    CONSTRAINT chk_detalle_compra_subtotal
        CHECK (subtotal > 0 AND subtotal = round(cantidad * costo_unitario, 2)),

    CONSTRAINT uq_detalle_compra_producto
        UNIQUE (compra_id, producto_id)
);

COMMENT ON TABLE public.detalle_compra IS
    'CU15: líneas de compra. costo_unitario es el costo histórico de esa compra (inmutable).';

CREATE INDEX IF NOT EXISTS idx_compra_proveedor ON public.compra (proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compra_usuario ON public.compra (usuario_id);
CREATE INDEX IF NOT EXISTS idx_compra_fecha ON public.compra (fecha_compra);
CREATE INDEX IF NOT EXISTS idx_detalle_compra_producto ON public.detalle_compra (producto_id);
-- uq_detalle_compra_producto ya indexa compra_id como primera columna.

-- ------------------------------------------------------------
-- 4. KÁRDEX → COMPRA
-- ------------------------------------------------------------
ALTER TABLE public.movimiento_kardex DROP CONSTRAINT IF EXISTS fk_kardex_compra;
ALTER TABLE public.movimiento_kardex ADD CONSTRAINT fk_kardex_compra
    FOREIGN KEY (compra_id) REFERENCES public.compra(id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------
-- 5. SOLO INSERCIÓN + ACCESO (tablas nuevas: no afecta a nadie)
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_compra_solo_insercion ON public.compra;
CREATE TRIGGER trg_compra_solo_insercion
    BEFORE UPDATE OR DELETE ON public.compra
    FOR EACH ROW EXECUTE FUNCTION private.fn_bloquear_modificacion();

DROP TRIGGER IF EXISTS trg_compra_sin_truncate ON public.compra;
CREATE TRIGGER trg_compra_sin_truncate
    BEFORE TRUNCATE ON public.compra
    FOR EACH STATEMENT EXECUTE FUNCTION private.fn_bloquear_modificacion();

DROP TRIGGER IF EXISTS trg_detalle_compra_solo_insercion ON public.detalle_compra;
CREATE TRIGGER trg_detalle_compra_solo_insercion
    BEFORE UPDATE OR DELETE ON public.detalle_compra
    FOR EACH ROW EXECUTE FUNCTION private.fn_bloquear_modificacion();

DROP TRIGGER IF EXISTS trg_detalle_compra_sin_truncate ON public.detalle_compra;
CREATE TRIGGER trg_detalle_compra_sin_truncate
    BEFORE TRUNCATE ON public.detalle_compra
    FOR EACH STATEMENT EXECUTE FUNCTION private.fn_bloquear_modificacion();

-- RLS habilitado sin políticas: anon/authenticated no leen nada; la app lee
-- con service_role (que omite RLS). La escritura solo es posible vía función.
ALTER TABLE public.compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_compra ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.compra, public.detalle_compra FROM PUBLIC;
DO $$
DECLARE
    r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON public.compra, public.detalle_compra FROM %I', r);
            EXECUTE format('REVOKE ALL ON SEQUENCE public.compra_id_seq, public.detalle_compra_id_seq FROM %I', r);
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        REVOKE ALL ON public.compra, public.detalle_compra FROM service_role;
        REVOKE ALL ON SEQUENCE public.compra_id_seq, public.detalle_compra_id_seq FROM service_role;
        GRANT SELECT ON public.compra, public.detalle_compra TO service_role;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 6. RPC: fn_registrar_compra — UNA transacción
--    1) valida  2) cabecera  3) por línea (ordenadas por producto_id):
--    detalle → kárdex ENTRADA/COMPRA (núcleo CU16) → último costo →
--    precio pactado  4) bitácora NUEVA_COMPRA  5) devuelve el comprobante.
--    Cualquier error revierte todo.
--
--    p_items: [{"producto_id": 1, "cantidad": 10, "costo_unitario": 25.50}, ...]
--    p_usuario_id: SIEMPRE el usuario de la sesión validada en el servidor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_registrar_compra(
    p_usuario_id     integer,
    p_proveedor_id   integer,
    p_tipo_documento text,
    p_nro_documento  text,
    p_fecha_compra   date,
    p_items          jsonb,
    p_observacion    text DEFAULT NULL,
    p_ip             text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_tipo        text := upper(btrim(coalesce(p_tipo_documento, '')));
    v_nro         text := regexp_replace(btrim(coalesce(p_nro_documento, '')), '\s+', ' ', 'g');
    v_nro_norm    text;
    v_obs         text := nullif(btrim(coalesce(p_observacion, '')), '');
    v_hoy         date := (now() AT TIME ZONE 'America/La_Paz')::date;
    v_documento   text;
    v_prov_nombre text;
    v_prov_estado boolean;
    v_item        jsonb;
    v_n_items     integer;
    v_n_distintos integer;
    v_n_existen   integer;
    v_linea       record;
    v_subtotal    numeric(12,2);
    v_total       numeric(12,2) := 0;
    v_compra      public.compra;
    v_mov         public.movimiento_kardex;
    v_lineas      jsonb := '[]'::jsonb;
BEGIN
    PERFORM private.fn_exigir_llamada_servidor();
    PERFORM private.fn_verificar_permiso(p_usuario_id, 'Compras', 'CREAR');

    -- ---------- Cabecera ----------
    IF v_tipo NOT IN ('FACTURA','NOTA') THEN
        RAISE EXCEPTION 'Tipo de documento no válido: use FACTURA o NOTA' USING ERRCODE = '22023';
    END IF;
    IF v_nro = '' THEN
        RAISE EXCEPTION 'El número de factura o nota es obligatorio' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_nro) > 50 OR v_nro !~ '^[A-Za-z0-9][A-Za-z0-9 ./-]*$' THEN
        RAISE EXCEPTION 'Número de documento no válido: use letras, dígitos, espacio, punto, barra o guion (máx. 50)'
            USING ERRCODE = '22023';
    END IF;
    v_nro_norm := upper(regexp_replace(v_nro, '[\s./-]', '', 'g'));
    IF p_fecha_compra IS NULL THEN
        RAISE EXCEPTION 'La fecha de compra es obligatoria' USING ERRCODE = '22023';
    END IF;
    IF p_fecha_compra > v_hoy THEN
        RAISE EXCEPTION 'La fecha de compra no puede ser futura' USING ERRCODE = '22023';
    END IF;
    -- D6 (límite de antigüedad) pendiente de autorización: no se aplica.
    IF v_obs IS NOT NULL AND char_length(v_obs) > 1000 THEN
        RAISE EXCEPTION 'La observación no puede superar 1000 caracteres' USING ERRCODE = '22023';
    END IF;

    -- ---------- Líneas: forma ----------
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La compra debe tener al menos un producto' USING ERRCODE = '22023';
    END IF;
    v_n_items := jsonb_array_length(p_items);
    IF v_n_items > 100 THEN
        RAISE EXCEPTION 'Una compra admite como máximo 100 líneas' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT e.value FROM jsonb_array_elements(p_items) AS e LOOP
        IF jsonb_typeof(v_item) <> 'object'
           OR coalesce(v_item ->> 'producto_id', '') !~ '^[1-9][0-9]{0,8}$'
           OR jsonb_typeof(v_item -> 'cantidad') IS DISTINCT FROM 'number'
           OR jsonb_typeof(v_item -> 'costo_unitario') IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'Línea de compra con formato inválido: %', v_item USING ERRCODE = '22023';
        END IF;
    END LOOP;

    SELECT count(DISTINCT (e.value ->> 'producto_id')::integer)
      INTO v_n_distintos
      FROM jsonb_array_elements(p_items) AS e;
    IF v_n_distintos <> v_n_items THEN
        RAISE EXCEPTION 'Hay productos repetidos en la compra: agrupe las cantidades en una sola línea'
            USING ERRCODE = '22023';
    END IF;

    SELECT count(*)
      INTO v_n_existen
      FROM public.producto p
     WHERE p.id IN (SELECT (e.value ->> 'producto_id')::integer FROM jsonb_array_elements(p_items) AS e);
    IF v_n_existen <> v_n_items THEN
        RAISE EXCEPTION 'La compra incluye productos que no existen en el catálogo' USING ERRCODE = '22023';
    END IF;

    -- ---------- Líneas: valores ----------
    FOR v_linea IN
        SELECT x.producto_id, x.cantidad, x.costo_unitario
          FROM jsonb_to_recordset(p_items) AS x(producto_id integer, cantidad numeric, costo_unitario numeric)
    LOOP
        IF v_linea.cantidad <= 0 THEN
            RAISE EXCEPTION 'Cantidad cero o negativa en el producto %', v_linea.producto_id
                USING ERRCODE = '22023';
        END IF;
        IF v_linea.cantidad <> round(v_linea.cantidad, 2) THEN
            RAISE EXCEPTION 'La cantidad del producto % admite como máximo 2 decimales', v_linea.producto_id
                USING ERRCODE = '22023';
        END IF;
        IF v_linea.costo_unitario <= 0 THEN
            RAISE EXCEPTION 'El costo unitario del producto % debe ser mayor a 0', v_linea.producto_id
                USING ERRCODE = '22023';
        END IF;
        IF v_linea.costo_unitario <> round(v_linea.costo_unitario, 2) THEN
            RAISE EXCEPTION 'El costo unitario del producto % admite como máximo 2 decimales', v_linea.producto_id
                USING ERRCODE = '22023';
        END IF;
        -- Límite de NUMERIC(12,2): 9 999 999 999.99 (por línea y en el total)
        IF round(v_linea.cantidad * v_linea.costo_unitario, 2) > 9999999999.99
           OR v_total + round(v_linea.cantidad * v_linea.costo_unitario, 2) > 9999999999.99 THEN
            RAISE EXCEPTION 'El importe de la compra excede el máximo permitido' USING ERRCODE = '22003';
        END IF;
        v_subtotal := round(v_linea.cantidad * v_linea.costo_unitario, 2);
        IF v_subtotal <= 0 THEN
            RAISE EXCEPTION 'El subtotal del producto % resulta 0; revise cantidad y costo', v_linea.producto_id
                USING ERRCODE = '22023';
        END IF;
        v_total := v_total + v_subtotal;
    END LOOP;

    -- ---------- Proveedor ----------
    SELECT pr.razon_social, pr.estado
      INTO v_prov_nombre, v_prov_estado
      FROM public.proveedor pr
     WHERE pr.id = p_proveedor_id
       FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El proveedor % no existe', p_proveedor_id USING ERRCODE = 'P0002';
    END IF;
    IF v_prov_estado IS NOT TRUE THEN
        RAISE EXCEPTION 'El proveedor «%» está inactivo', v_prov_nombre USING ERRCODE = '22023';
    END IF;

    -- ---------- Documento duplicado (mensaje claro; el índice UNIQUE es la garantía) ----------
    IF EXISTS (SELECT 1 FROM public.compra c
                WHERE c.proveedor_id = p_proveedor_id
                  AND c.tipo_documento = v_tipo
                  AND c.nro_documento_normalizado = v_nro_norm) THEN
        RAISE EXCEPTION 'Documento ya registrado: % % del proveedor «%»', v_tipo, v_nro, v_prov_nombre
            USING ERRCODE = '23505';
    END IF;

    -- ---------- Cabecera ----------
    BEGIN
        INSERT INTO public.compra (proveedor_id, usuario_id, tipo_documento, nro_documento,
                                   fecha_compra, total, observacion)
        VALUES (p_proveedor_id, p_usuario_id, v_tipo, v_nro, p_fecha_compra, v_total, v_obs)
        RETURNING * INTO v_compra;
    EXCEPTION WHEN unique_violation THEN
        -- Otra transacción registró el mismo documento al mismo tiempo
        RAISE EXCEPTION 'Documento ya registrado: % % del proveedor «%»', v_tipo, v_nro, v_prov_nombre
            USING ERRCODE = '23505';
    END;

    v_documento := v_tipo || ' ' || v_nro;

    -- ---------- Líneas (ordenadas por producto para evitar interbloqueos) ----------
    FOR v_linea IN
        SELECT x.producto_id, x.cantidad, x.costo_unitario
          FROM jsonb_to_recordset(p_items) AS x(producto_id integer, cantidad numeric, costo_unitario numeric)
         ORDER BY x.producto_id
    LOOP
        v_subtotal := round(v_linea.cantidad * v_linea.costo_unitario, 2);

        INSERT INTO public.detalle_compra (compra_id, producto_id, cantidad, costo_unitario, subtotal)
        VALUES (v_compra.id, v_linea.producto_id, v_linea.cantidad, v_linea.costo_unitario, v_subtotal);

        -- «include» CU16: entrada en el kárdex e incremento del stock
        v_mov := private.fn_kardex_aplicar(
            v_linea.producto_id, p_usuario_id, 'ENTRADA', 'COMPRA', v_linea.cantidad,
            v_documento, 'compra:' || v_compra.id, v_compra.id, NULL
        );

        -- Último costo (D2): no lo pisa una compra con fecha anterior a otra ya registrada
        UPDATE public.producto p
           SET precio_compra_actual = v_linea.costo_unitario
         WHERE p.id = v_linea.producto_id
           AND NOT EXISTS (
                SELECT 1
                  FROM public.detalle_compra d
                  JOIN public.compra c ON c.id = d.compra_id
                 WHERE d.producto_id = v_linea.producto_id
                   AND c.id <> v_compra.id
                   AND c.fecha_compra > p_fecha_compra);

        -- Validación estricta CU14 / CU15: El producto debe pertenecer previamente al catálogo del proveedor.
        -- No se insertan automáticamente nuevos productos en producto_proveedor para no alterar las métricas
        -- ni el catálogo registrado de forma no autorizada.
        IF NOT EXISTS (SELECT 1 FROM public.producto_proveedor pp
                        WHERE pp.producto_id = v_linea.producto_id
                          AND pp.proveedor_id = p_proveedor_id) THEN
            RAISE EXCEPTION 'El producto % no pertenece al catálogo del proveedor seleccionado', v_linea.producto_id
                USING ERRCODE = '22023';
        END IF;

        v_lineas := v_lineas || jsonb_build_object(
            'producto_id',      v_linea.producto_id,
            'producto',         (SELECT p.nombre FROM public.producto p WHERE p.id = v_linea.producto_id),
            'cantidad',         v_linea.cantidad,
            'costo_unitario',   v_linea.costo_unitario,
            'subtotal',         v_subtotal,
            'stock_anterior',   v_mov.stock_anterior,
            'stock_resultante', v_mov.stock_resultante,
            'movimiento_id',    v_mov.id
        );
    END LOOP;

    -- ---------- Bitácora (misma transacción) ----------
    PERFORM private.fn_registrar_bitacora(
        p_usuario_id,
        'NUEVA_COMPRA',
        format('Compra #%s · %s · Proveedor «%s» (ID %s) · %s línea(s) · Total Bs %s',
               v_compra.id, v_documento, v_prov_nombre, p_proveedor_id, v_n_items,
               to_char(v_compra.total, 'FM999999999990.00')),
        p_ip
    );

    -- ---------- Comprobante de ingreso a almacén ----------
    RETURN jsonb_build_object(
        'compra_id',      v_compra.id,
        'proveedor_id',   p_proveedor_id,
        'proveedor',      v_prov_nombre,
        'tipo_documento', v_compra.tipo_documento,
        'nro_documento',  v_compra.nro_documento,
        'fecha_compra',   v_compra.fecha_compra,
        'fecha_registro', v_compra.fecha_registro,
        'usuario_id',     p_usuario_id,
        'total',          v_compra.total,
        'lineas',         v_lineas
    );
END;
$$;

REVOKE ALL ON FUNCTION public.fn_registrar_compra(integer, integer, text, text, date, jsonb, text, text) FROM PUBLIC;
DO $$
DECLARE
    r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON FUNCTION public.fn_registrar_compra(integer, integer, text, text, date, jsonb, text, text) FROM %I', r);
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_registrar_compra(integer, integer, text, text, date, jsonb, text, text) TO service_role;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 7. PERMISOS RBAC
--    FUNCION 'Compras' (módulo Catálogo e Inventario):
--      ADMINISTRADOR → CREAR, LEER, ACTUALIZAR, ELIMINAR, PROCESAR
--      ENCARGADO     → CREAR, LEER (actor iniciador de CU15)
--    PERMISO COMPRAS (/compras) → ADMINISTRADOR, ENCARGADO
-- ------------------------------------------------------------
DO $$
DECLARE
    v_admin  integer;
    v_enc    integer;
    v_modulo integer;
    v_func   integer;
    v_perm   integer;
BEGIN
    SELECT id INTO v_admin FROM public.rol WHERE nombre = 'ADMINISTRADOR';
    SELECT id INTO v_enc   FROM public.rol WHERE nombre = 'ENCARGADO';
    SELECT id INTO v_modulo FROM public.modulo WHERE nombre = 'Catálogo e Inventario';
    IF v_admin IS NULL OR v_enc IS NULL OR v_modulo IS NULL THEN
        RAISE EXCEPTION 'CU15: faltan roles base o el módulo Catálogo e Inventario (ejecute la migración CU16)';
    END IF;

    SELECT id INTO v_func FROM public.funcion
     WHERE nombre = 'Compras' AND modulo_id = v_modulo ORDER BY id LIMIT 1;
    IF v_func IS NULL THEN
        INSERT INTO public.funcion (modulo_id, nombre, descripcion)
        VALUES (v_modulo, 'Compras', 'Registro de compras de equipos e insumos (CU15)')
        RETURNING id INTO v_func;
    END IF;

    INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
    SELECT v_admin, v_func, a.id, 'Acceso total'
      FROM public.accion a
     WHERE a.nombre IN ('CREAR','LEER','ACTUALIZAR','ELIMINAR','PROCESAR')
       AND NOT EXISTS (SELECT 1 FROM public.rol_funcion rf
                        WHERE rf.rol_id = v_admin AND rf.funcion_id = v_func AND rf.accion_id = a.id);

    INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
    SELECT v_enc, v_func, a.id,
           CASE a.nombre WHEN 'CREAR' THEN 'Registrar compras' ELSE 'Consultar compras' END
      FROM public.accion a
     WHERE a.nombre IN ('CREAR','LEER')
       AND NOT EXISTS (SELECT 1 FROM public.rol_funcion rf
                        WHERE rf.rol_id = v_enc AND rf.funcion_id = v_func AND rf.accion_id = a.id);

    SELECT id INTO v_perm FROM public.permiso WHERE nombre = 'COMPRAS' OR ruta = '/compras' LIMIT 1;
    IF v_perm IS NULL THEN
        INSERT INTO public.permiso (nombre, ruta, descripcion)
        VALUES ('COMPRAS', '/compras', 'Registro de compras (CU15)')
        RETURNING id INTO v_perm;
    END IF;

    INSERT INTO public.rol_permiso (rol_id, permiso_id)
    SELECT r.id, v_perm
      FROM public.rol r
     WHERE r.id IN (v_admin, v_enc)
       AND NOT EXISTS (SELECT 1 FROM public.rol_permiso rp
                        WHERE rp.rol_id = r.id AND rp.permiso_id = v_perm);
END $$;

COMMIT;

-- Recarga el caché de esquema de PostgREST para exponer la nueva RPC.
NOTIFY pgrst, 'reload schema';
