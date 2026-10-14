-- ============================================================
-- MIGRACIÓN CU16 — Gestionar Inventario y Movimientos de Kárdex
-- ETAPA 1 (compatible con CU09/CU14 en curso)
--
-- ORDEN DE EJECUCIÓN:
--   0) diagnostico_cu15_cu16.sql          (solo lectura, revisar resultados)
--   1) migracion_cu16_inventario.sql      (ESTE ARCHIVO)
--   2) migracion_cu15_compras.sql         (requiere este archivo)
--
-- Ejecutar en el SQL Editor de un proyecto Supabase de DESARROLLO primero.
-- Todo el script corre en UNA transacción: si algo falla no queda nada a medias.
-- IDEMPOTENTE: puede re-ejecutarse sin errores.
--
-- NO DESTRUCTIVA: solo agrega columnas, restricciones, índices, funciones,
-- triggers y filas de permisos. No modifica ni borra filas existentes.
--
-- Qué agrega:
--   PRODUCTO          + codigo (UNIQUE, opcional por ahora — D5) + estado
--   MOVIMIENTO_KARDEX + motivo, stock_resultante, documento, compra_id
--                     + restricciones de coherencia (solo filas nuevas)
--                     + trigger que completa motivo/stock_resultante en
--                       inserciones directas (compatibilidad CU09/CU12)
--                     + trigger que impide UPDATE y TRUNCATE
--   Esquema private   núcleo del kárdex y verificación de permisos
--   RPC públicas      fn_registrar_ajuste, fn_registrar_inventario_inicial
--   Permisos          ROL_FUNCION (Catálogo e Inventario) + PERMISO /inventario
--
-- Qué NO hace (ver sección PENDIENTE al final, comentada):
--   · Bloquear DELETE del kárdex (rompería la compensación de CU09 — D11).
--   · Rellenar el histórico ni volver NOT NULL motivo/stock_resultante (D10).
--   · Cambiar fecha_movimiento a TIMESTAMPTZ (D8).
--   · Columna de IP en bitácora (D9): la IP se anexa a la descripción.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0. VERIFICACIONES PREVIAS (abortan si la BD no es la esperada)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_faltan text;
BEGIN
    -- Tablas requeridas
    SELECT string_agg(t, ', ') INTO v_faltan
      FROM unnest(ARRAY['producto','movimiento_kardex','usuario','bitacora','rol',
                        'modulo','funcion','accion','rol_funcion','permiso','rol_permiso']) AS t
     WHERE to_regclass('public.' || t) IS NULL;
    IF v_faltan IS NOT NULL THEN
        RAISE EXCEPTION 'CU16: faltan tablas requeridas: %', v_faltan;
    END IF;

    -- Columnas requeridas de USUARIO (CU01/CU02)
    SELECT string_agg(c, ', ') INTO v_faltan
      FROM unnest(ARRAY['estado','bloqueado_hasta','rol_id']) AS c
     WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'public' AND table_name = 'usuario' AND column_name = c);
    IF v_faltan IS NOT NULL THEN
        RAISE EXCEPTION 'CU16: faltan columnas en usuario: % (ejecutar migracion_cu01_bloqueo.sql)', v_faltan;
    END IF;

    -- Columnas NOT NULL sin DEFAULT desconocidas harían fallar los INSERT de las funciones
    SELECT string_agg(table_name || '.' || column_name, ', ') INTO v_faltan
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND is_nullable = 'NO' AND column_default IS NULL AND is_generated = 'NEVER'
       AND ((table_name = 'bitacora' AND column_name NOT IN ('usuario_id','accion'))
         OR (table_name = 'movimiento_kardex'
             -- motivo / stock_resultante son de CU16: pasan a NOT NULL tras P2 y
             -- siempre los completan fn_kardex_aplicar o trg_kardex_completar.
             AND column_name NOT IN ('producto_id','usuario_id','tipo_movimiento','cantidad',
                                     'stock_anterior','motivo','stock_resultante')));
    IF v_faltan IS NOT NULL THEN
        RAISE EXCEPTION 'CU16: columnas NOT NULL sin DEFAULT no previstas: % (coordinar antes de migrar)', v_faltan;
    END IF;

    -- Si ya existen columnas con el mismo nombre (p. ej. creadas por otra
    -- migración), deben tener el tipo esperado; ADD COLUMN IF NOT EXISTS las
    -- omitiría y las restricciones/funciones fallarían más adelante.
    SELECT string_agg(c.table_name || '.' || c.column_name || ' (' || c.data_type || ')', ', ')
      INTO v_faltan
      FROM information_schema.columns c
      JOIN (VALUES ('producto',          'codigo',           'character varying'),
                   ('producto',          'estado',           'boolean'),
                   ('movimiento_kardex', 'motivo',           'character varying'),
                   ('movimiento_kardex', 'stock_resultante', 'numeric'),
                   ('movimiento_kardex', 'documento',        'character varying'),
                   ('movimiento_kardex', 'compra_id',        'integer'))
           AS e(tabla, columna, tipo)
        ON e.tabla = c.table_name AND e.columna = c.column_name
     WHERE c.table_schema = 'public'
       AND c.data_type <> e.tipo;
    IF v_faltan IS NOT NULL THEN
        RAISE EXCEPTION 'CU16: columnas existentes con tipo inesperado: % (coordinar antes de migrar)', v_faltan;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 1. PRODUCTO: código y estado
-- ------------------------------------------------------------
ALTER TABLE public.producto ADD COLUMN IF NOT EXISTS codigo VARCHAR(50);
ALTER TABLE public.producto ADD COLUMN IF NOT EXISTS estado BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.producto DROP CONSTRAINT IF EXISTS uq_producto_codigo;
ALTER TABLE public.producto ADD CONSTRAINT uq_producto_codigo UNIQUE (codigo);

-- Código normalizado: mayúsculas, sin espacios externos, 2–50 caracteres.
-- NULL permitido mientras se asignan códigos a los productos existentes (D5).
ALTER TABLE public.producto DROP CONSTRAINT IF EXISTS chk_producto_codigo;
ALTER TABLE public.producto ADD CONSTRAINT chk_producto_codigo CHECK (
    codigo IS NULL
    OR (codigo = upper(btrim(codigo)) AND char_length(codigo) BETWEEN 2 AND 50)
);

COMMENT ON COLUMN public.producto.codigo IS
    'Código interno único del producto (CU16). Mayúsculas. NULL solo para productos anteriores a CU16.';
COMMENT ON COLUMN public.producto.estado IS
    'TRUE = activo. Los productos no se borran: se desactivan (CU16).';
COMMENT ON COLUMN public.producto.precio_compra_actual IS
    'Último costo de compra (CU15 lo actualiza con la compra de fecha más reciente).';

-- ------------------------------------------------------------
-- 2. MOVIMIENTO_KARDEX: columnas nuevas (todas admiten NULL para no
--    tocar el histórico; las filas nuevas siempre las traen completas)
-- ------------------------------------------------------------
ALTER TABLE public.movimiento_kardex ADD COLUMN IF NOT EXISTS motivo VARCHAR(30);
ALTER TABLE public.movimiento_kardex ADD COLUMN IF NOT EXISTS stock_resultante NUMERIC(12,2);
ALTER TABLE public.movimiento_kardex ADD COLUMN IF NOT EXISTS documento VARCHAR(100);
-- La FK hacia COMPRA la agrega migracion_cu15_compras.sql (la tabla aún no existe).
ALTER TABLE public.movimiento_kardex ADD COLUMN IF NOT EXISTS compra_id INTEGER;

COMMENT ON COLUMN public.movimiento_kardex.motivo IS
    'COMPRA | INVENTARIO_INICIAL | ANULACION_VENTA | ENTRADA_OTRA | VENTA | CONSUMO_OT | SALIDA_OTRA | AJUSTE_POSITIVO | AJUSTE_NEGATIVO | HISTORICO (reservado a la migración del histórico).';
COMMENT ON COLUMN public.movimiento_kardex.stock_resultante IS
    'Stock del producto después de aplicar el movimiento. NULL solo en filas anteriores a CU16.';
COMMENT ON COLUMN public.movimiento_kardex.documento IS
    'Documento de respaldo legible (p. ej. FACTURA 001-2345, CONTEO FISICO).';

-- 2.1 Coherencia tipo ↔ motivo ↔ aritmética del stock.
--     Las filas antiguas (motivo NULL) evalúan a NULL y no la violan.
--     ENTRADA_OTRA / SALIDA_OTRA existen solo para inserciones directas con
--     un origen no reconocido (compatibilidad); HISTORICO, para el histórico.
ALTER TABLE public.movimiento_kardex DROP CONSTRAINT IF EXISTS chk_kardex_coherencia;
ALTER TABLE public.movimiento_kardex ADD CONSTRAINT chk_kardex_coherencia CHECK (
       motivo = 'HISTORICO'
    OR (tipo_movimiento = 'ENTRADA'
        AND motivo IN ('COMPRA','INVENTARIO_INICIAL','ANULACION_VENTA','ENTRADA_OTRA')
        AND stock_resultante = stock_anterior + cantidad)
    OR (tipo_movimiento = 'SALIDA'
        AND motivo IN ('VENTA','CONSUMO_OT','SALIDA_OTRA')
        AND stock_resultante = stock_anterior - cantidad)
    OR (tipo_movimiento = 'AJUSTE' AND motivo = 'AJUSTE_POSITIVO'
        AND stock_resultante = stock_anterior + cantidad)
    OR (tipo_movimiento = 'AJUSTE' AND motivo = 'AJUSTE_NEGATIVO'
        AND stock_resultante = stock_anterior - cantidad)
);

ALTER TABLE public.movimiento_kardex DROP CONSTRAINT IF EXISTS chk_kardex_resultante;
ALTER TABLE public.movimiento_kardex ADD CONSTRAINT chk_kardex_resultante CHECK (
    stock_resultante >= 0 OR motivo = 'HISTORICO'
);

-- Un movimiento por compra siempre referencia su compra, y viceversa.
ALTER TABLE public.movimiento_kardex DROP CONSTRAINT IF EXISTS chk_kardex_compra;
ALTER TABLE public.movimiento_kardex ADD CONSTRAINT chk_kardex_compra CHECK (
    (motivo = 'COMPRA') = (compra_id IS NOT NULL)
);

-- Todo ajuste nuevo exige justificación (mínimo 10 caracteres).
ALTER TABLE public.movimiento_kardex DROP CONSTRAINT IF EXISTS chk_kardex_ajuste_justificado;
ALTER TABLE public.movimiento_kardex ADD CONSTRAINT chk_kardex_ajuste_justificado CHECK (
    tipo_movimiento <> 'AJUSTE'
    OR motivo = 'HISTORICO'
    OR char_length(btrim(coalesce(observacion, ''))) >= 10
);

-- 2.2 Filas nuevas completas. NOT VALID: no se comprueba sobre el histórico
--     (se validará tras el relleno pendiente — D10).
--     Solo se crea si no existe: re-ejecutar no debe degradar a NOT VALID una
--     restricción ya validada por el relleno (P2).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.movimiento_kardex'::regclass
                      AND conname = 'chk_kardex_completo') THEN
        ALTER TABLE public.movimiento_kardex ADD CONSTRAINT chk_kardex_completo CHECK (
            motivo IS NOT NULL AND stock_resultante IS NOT NULL
        ) NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_kardex_producto_fecha
    ON public.movimiento_kardex (producto_id, fecha_movimiento, id);
CREATE INDEX IF NOT EXISTS idx_kardex_compra
    ON public.movimiento_kardex (compra_id);

-- ------------------------------------------------------------
-- 3. ESQUEMA PRIVADO (no expuesto por PostgREST)
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
DO $$
DECLARE
    r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON SCHEMA private FROM %I', r);
        END IF;
    END LOOP;
END $$;

-- ------------------------------------------------------------
-- 4. FUNCIONES DE SOPORTE (private)
-- ------------------------------------------------------------

-- 4.1 Solo se aceptan llamadas del servidor: vía PostgREST, el JWT debe ser
--     de service_role. Sin claims = conexión directa a la BD (SQL Editor).
CREATE OR REPLACE FUNCTION private.fn_exigir_llamada_servidor()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
    v_claims text := current_setting('request.jwt.claims', true);
BEGIN
    IF v_claims IS NULL OR v_claims = '' THEN
        RETURN;
    END IF;
    IF (v_claims::jsonb ->> 'role') IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'No autorizado: la operación solo puede invocarse desde el servidor'
            USING ERRCODE = '42501';
    END IF;
END;
$$;

-- 4.2 RBAC en la BD (defensa en profundidad): usuario activo, sin bloqueo
--     vigente y con la acción concedida en ROL_FUNCION. La identidad
--     (p_usuario_id) la aporta el servidor desde la sesión validada.
CREATE OR REPLACE FUNCTION private.fn_verificar_permiso(
    p_usuario_id integer,
    p_funcion    text,
    p_accion     text
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
    v_estado    boolean;
    v_bloqueado timestamptz;
BEGIN
    SELECT u.estado, u.bloqueado_hasta
      INTO v_estado, v_bloqueado
      FROM public.usuario u
     WHERE u.id = p_usuario_id;

    IF NOT FOUND OR v_estado IS NOT TRUE THEN
        RAISE EXCEPTION 'No autorizado: usuario inexistente o inactivo'
            USING ERRCODE = '42501';
    END IF;

    IF v_bloqueado IS NOT NULL AND v_bloqueado > now() THEN
        RAISE EXCEPTION 'No autorizado: la cuenta está bloqueada temporalmente'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.usuario u
          JOIN public.rol_funcion rf ON rf.rol_id = u.rol_id
          JOIN public.funcion f      ON f.id = rf.funcion_id
          JOIN public.accion a       ON a.id = rf.accion_id
         WHERE u.id = p_usuario_id
           AND f.nombre = p_funcion
           AND a.nombre = p_accion
    ) THEN
        RAISE EXCEPTION 'No autorizado: su rol no tiene el permiso % sobre %', p_accion, p_funcion
            USING ERRCODE = '42501';
    END IF;
END;
$$;

-- 4.3 Registro en bitácora desde las funciones (misma transacción).
--     D9 pendiente: mientras no exista una columna de IP acordada, la IP se
--     anexa a la descripción.
CREATE OR REPLACE FUNCTION private.fn_registrar_bitacora(
    p_usuario_id  integer,
    p_accion      text,
    p_descripcion text,
    p_ip          text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.bitacora (usuario_id, accion, descripcion)
    VALUES (
        p_usuario_id,
        p_accion,
        p_descripcion
            || CASE WHEN nullif(btrim(coalesce(p_ip, '')), '') IS NULL THEN ''
                    ELSE ' · IP ' || left(btrim(p_ip), 45) END
    );
END;
$$;

-- 4.4 NÚCLEO ÚNICO DEL KÁRDEX. Toda modificación de stock hecha por las
--     funciones de CU15/CU16 (y, tras coordinarlo, CU09) pasa por aquí:
--     bloquea el producto, calcula stock anterior y resultante, impide stock
--     negativo, actualiza PRODUCTO e inserta el movimiento.
CREATE OR REPLACE FUNCTION private.fn_kardex_aplicar(
    p_producto_id integer,
    p_usuario_id  integer,
    p_tipo        text,
    p_motivo      text,
    p_cantidad    numeric,
    p_documento   text    DEFAULT NULL,
    p_origen      text    DEFAULT NULL,
    p_compra_id   integer DEFAULT NULL,
    p_observacion text    DEFAULT NULL
)
RETURNS public.movimiento_kardex
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_signo      integer;
    v_nombre     text;
    v_stock      numeric(12,2);
    v_estado     boolean;
    v_resultante numeric(12,2);
    v_mov        public.movimiento_kardex;
BEGIN
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RAISE EXCEPTION 'La cantidad debe ser mayor a 0' USING ERRCODE = '22023';
    END IF;
    IF p_cantidad <> round(p_cantidad, 2) THEN
        RAISE EXCEPTION 'La cantidad admite como máximo 2 decimales' USING ERRCODE = '22023';
    END IF;

    v_signo := CASE
        WHEN p_tipo = 'ENTRADA' AND p_motivo IN ('COMPRA','INVENTARIO_INICIAL','ANULACION_VENTA') THEN 1
        WHEN p_tipo = 'SALIDA'  AND p_motivo IN ('VENTA','CONSUMO_OT')                           THEN -1
        WHEN p_tipo = 'AJUSTE'  AND p_motivo = 'AJUSTE_POSITIVO'                                 THEN 1
        WHEN p_tipo = 'AJUSTE'  AND p_motivo = 'AJUSTE_NEGATIVO'                                 THEN -1
    END;
    IF v_signo IS NULL THEN
        RAISE EXCEPTION 'Combinación de tipo y motivo no válida: % / %', p_tipo, p_motivo
            USING ERRCODE = '22023';
    END IF;

    SELECT p.nombre, p.stock_disponible, p.estado
      INTO v_nombre, v_stock, v_estado
      FROM public.producto p
     WHERE p.id = p_producto_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El producto % no existe', p_producto_id USING ERRCODE = 'P0002';
    END IF;

    IF v_estado IS NOT TRUE AND p_motivo IN ('COMPRA','VENTA','CONSUMO_OT','INVENTARIO_INICIAL') THEN
        RAISE EXCEPTION 'El producto «%» está inactivo', v_nombre USING ERRCODE = '22023';
    END IF;

    v_resultante := v_stock + v_signo * p_cantidad;
    IF v_resultante < 0 THEN
        RAISE EXCEPTION 'Stock insuficiente para «%»: disponible %, solicitado %',
            v_nombre, v_stock, p_cantidad USING ERRCODE = '23514';
    END IF;

    -- Marca transaccional: autoriza el cambio de stock cuando se active el
    -- guardián de la etapa 2 (ver PENDIENTE). Hoy no tiene efecto.
    PERFORM set_config('smartservice.kardex', '1', true);
    UPDATE public.producto SET stock_disponible = v_resultante WHERE id = p_producto_id;
    PERFORM set_config('smartservice.kardex', '', true);

    INSERT INTO public.movimiento_kardex (
        producto_id, usuario_id, compra_id, tipo_movimiento, motivo,
        cantidad, stock_anterior, stock_resultante, documento,
        origen_movimiento, observacion
    ) VALUES (
        p_producto_id, p_usuario_id, p_compra_id, p_tipo, p_motivo,
        p_cantidad, v_stock, v_resultante, p_documento,
        p_origen, p_observacion
    )
    RETURNING * INTO v_mov;

    RETURN v_mov;
END;
$$;

-- ------------------------------------------------------------
-- 5. TRIGGERS DEL KÁRDEX
-- ------------------------------------------------------------

-- 5.1 Compatibilidad: completa motivo y stock_resultante cuando el código
--     existente (CU09 de dev-erika, ventas/ordenes de main) inserta
--     directamente sin esas columnas.
CREATE OR REPLACE FUNCTION private.fn_kardex_completar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_origen text := upper(btrim(coalesce(NEW.origen_movimiento, '')));
BEGIN
    IF NEW.motivo = 'HISTORICO' THEN
        RAISE EXCEPTION 'El motivo HISTORICO está reservado a la migración del histórico'
            USING ERRCODE = '23514';
    END IF;

    IF NEW.motivo IS NULL THEN
        IF NEW.tipo_movimiento = 'AJUSTE' THEN
            RAISE EXCEPTION 'Los ajustes de inventario se registran con fn_registrar_ajuste'
                USING ERRCODE = '23514';
        ELSIF NEW.tipo_movimiento = 'ENTRADA' THEN
            NEW.motivo := CASE
                WHEN starts_with(v_origen, 'ANULACION_VENTA') THEN 'ANULACION_VENTA'
                ELSE 'ENTRADA_OTRA'
            END;
        ELSIF NEW.tipo_movimiento = 'SALIDA' THEN
            NEW.motivo := CASE
                WHEN starts_with(v_origen, 'VENTA')         THEN 'VENTA'
                WHEN starts_with(v_origen, 'ORDEN_TRABAJO') THEN 'CONSUMO_OT'
                ELSE 'SALIDA_OTRA'
            END;
        END IF;
    END IF;

    IF NEW.stock_resultante IS NULL AND NEW.motivo IS NOT NULL THEN
        NEW.stock_resultante := NEW.stock_anterior + CASE
            WHEN NEW.motivo IN ('COMPRA','INVENTARIO_INICIAL','ANULACION_VENTA',
                                'ENTRADA_OTRA','AJUSTE_POSITIVO') THEN NEW.cantidad
            ELSE -NEW.cantidad
        END;
    END IF;

    RETURN NEW;
END;
$$;

-- 5.2 Bloqueo de modificaciones (genérico: kárdex, compra, detalle_compra).
CREATE OR REPLACE FUNCTION private.fn_bloquear_modificacion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_TABLE_NAME = 'movimiento_kardex' THEN
        RAISE EXCEPTION 'El kárdex es de solo inserción' USING ERRCODE = '55000';
    END IF;
    RAISE EXCEPTION 'La tabla % es de solo inserción (operación % no permitida)', TG_TABLE_NAME, TG_OP
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_kardex_completar ON public.movimiento_kardex;
CREATE TRIGGER trg_kardex_completar
    BEFORE INSERT ON public.movimiento_kardex
    FOR EACH ROW EXECUTE FUNCTION private.fn_kardex_completar();

DROP TRIGGER IF EXISTS trg_kardex_sin_update ON public.movimiento_kardex;
CREATE TRIGGER trg_kardex_sin_update
    BEFORE UPDATE ON public.movimiento_kardex
    FOR EACH ROW EXECUTE FUNCTION private.fn_bloquear_modificacion();

DROP TRIGGER IF EXISTS trg_kardex_sin_truncate ON public.movimiento_kardex;
CREATE TRIGGER trg_kardex_sin_truncate
    BEFORE TRUNCATE ON public.movimiento_kardex
    FOR EACH STATEMENT EXECUTE FUNCTION private.fn_bloquear_modificacion();

-- DELETE NO se bloquea todavía: la compensación de CU09 (dev-erika,
-- ventas/service.ts) borra movimientos. Ver PENDIENTE P1 (D11).

-- ------------------------------------------------------------
-- 6. RPC PÚBLICAS DE CU16 (SECURITY DEFINER, solo service_role)
-- ------------------------------------------------------------

-- 6.1 Ajuste por conteo físico (D4): el usuario indica el stock contado y
--     el sistema deriva AJUSTE_POSITIVO / AJUSTE_NEGATIVO y la cantidad.
CREATE OR REPLACE FUNCTION public.fn_registrar_ajuste(
    p_usuario_id    integer,
    p_producto_id   integer,
    p_stock_contado numeric,
    p_justificacion text,
    p_ip            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_just       text := btrim(coalesce(p_justificacion, ''));
    v_nombre     text;
    v_stock      numeric(12,2);
    v_diferencia numeric(12,2);
    v_motivo     text;
    v_mov        public.movimiento_kardex;
BEGIN
    PERFORM private.fn_exigir_llamada_servidor();
    PERFORM private.fn_verificar_permiso(p_usuario_id, 'Catálogo e Inventario', 'PROCESAR');

    IF char_length(v_just) < 10 THEN
        RAISE EXCEPTION 'La justificación del ajuste es obligatoria (mínimo 10 caracteres)'
            USING ERRCODE = '22023';
    END IF;
    IF char_length(v_just) > 1000 THEN
        RAISE EXCEPTION 'La justificación no puede superar 1000 caracteres' USING ERRCODE = '22023';
    END IF;
    IF p_stock_contado IS NULL OR p_stock_contado < 0 THEN
        RAISE EXCEPTION 'El stock contado no puede ser negativo' USING ERRCODE = '22023';
    END IF;
    IF p_stock_contado <> round(p_stock_contado, 2) THEN
        RAISE EXCEPTION 'El stock contado admite como máximo 2 decimales' USING ERRCODE = '22023';
    END IF;

    SELECT p.nombre, p.stock_disponible
      INTO v_nombre, v_stock
      FROM public.producto p
     WHERE p.id = p_producto_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El producto % no existe', p_producto_id USING ERRCODE = 'P0002';
    END IF;

    v_diferencia := p_stock_contado - v_stock;
    IF v_diferencia = 0 THEN
        RAISE EXCEPTION 'No hay diferencia que ajustar: el stock de «%» ya es %', v_nombre, v_stock
            USING ERRCODE = '22023';
    END IF;
    v_motivo := CASE WHEN v_diferencia > 0 THEN 'AJUSTE_POSITIVO' ELSE 'AJUSTE_NEGATIVO' END;

    v_mov := private.fn_kardex_aplicar(
        p_producto_id, p_usuario_id, 'AJUSTE', v_motivo, abs(v_diferencia),
        'CONTEO FISICO', 'ajuste:conteo_fisico', NULL, v_just
    );

    PERFORM private.fn_registrar_bitacora(
        p_usuario_id,
        'AJUSTE_INVENTARIO',
        format('%s de %s en «%s» (ID %s): stock %s → %s. Justificación: %s',
               v_motivo, v_mov.cantidad, v_nombre, p_producto_id,
               v_mov.stock_anterior, v_mov.stock_resultante, v_just),
        p_ip
    );

    RETURN jsonb_build_object(
        'movimiento_id',    v_mov.id,
        'producto_id',      p_producto_id,
        'producto',         v_nombre,
        'motivo',           v_motivo,
        'cantidad',         v_mov.cantidad,
        'stock_anterior',   v_mov.stock_anterior,
        'stock_resultante', v_mov.stock_resultante
    );
END;
$$;

-- 6.2 Inventario inicial: solo para productos sin movimientos y con stock 0.
CREATE OR REPLACE FUNCTION public.fn_registrar_inventario_inicial(
    p_usuario_id  integer,
    p_producto_id integer,
    p_cantidad    numeric,
    p_observacion text DEFAULT NULL,
    p_ip          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_obs    text := nullif(btrim(coalesce(p_observacion, '')), '');
    v_nombre text;
    v_stock  numeric(12,2);
    v_mov    public.movimiento_kardex;
BEGIN
    PERFORM private.fn_exigir_llamada_servidor();
    PERFORM private.fn_verificar_permiso(p_usuario_id, 'Catálogo e Inventario', 'PROCESAR');

    IF v_obs IS NOT NULL AND char_length(v_obs) > 1000 THEN
        RAISE EXCEPTION 'La observación no puede superar 1000 caracteres' USING ERRCODE = '22023';
    END IF;

    -- Bloquea el producto antes de comprobar: dos cargas simultáneas se serializan.
    SELECT p.nombre, p.stock_disponible
      INTO v_nombre, v_stock
      FROM public.producto p
     WHERE p.id = p_producto_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El producto % no existe', p_producto_id USING ERRCODE = 'P0002';
    END IF;

    IF EXISTS (SELECT 1 FROM public.movimiento_kardex m WHERE m.producto_id = p_producto_id) THEN
        RAISE EXCEPTION 'El producto «%» ya tiene movimientos; use un ajuste por conteo físico', v_nombre
            USING ERRCODE = '22023';
    END IF;
    IF v_stock <> 0 THEN
        RAISE EXCEPTION 'El producto «%» tiene stock % sin movimientos; regularícelo con un ajuste', v_nombre, v_stock
            USING ERRCODE = '22023';
    END IF;

    v_mov := private.fn_kardex_aplicar(
        p_producto_id, p_usuario_id, 'ENTRADA', 'INVENTARIO_INICIAL', p_cantidad,
        'INVENTARIO INICIAL', 'inventario_inicial', NULL, v_obs
    );

    PERFORM private.fn_registrar_bitacora(
        p_usuario_id,
        'INVENTARIO_INICIAL',
        format('Inventario inicial de «%s» (ID %s): %s unidades', v_nombre, p_producto_id, v_mov.cantidad),
        p_ip
    );

    RETURN jsonb_build_object(
        'movimiento_id',    v_mov.id,
        'producto_id',      p_producto_id,
        'producto',         v_nombre,
        'cantidad',         v_mov.cantidad,
        'stock_anterior',   v_mov.stock_anterior,
        'stock_resultante', v_mov.stock_resultante
    );
END;
$$;

-- ------------------------------------------------------------
-- 7. PRIVILEGIOS DE EJECUCIÓN
--    Supabase concede EXECUTE por defecto a anon/authenticated sobre las
--    funciones nuevas de public: se revoca explícitamente.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION private.fn_exigir_llamada_servidor() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.fn_verificar_permiso(integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.fn_registrar_bitacora(integer, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.fn_kardex_aplicar(integer, integer, text, text, numeric, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.fn_kardex_completar() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.fn_bloquear_modificacion() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_registrar_ajuste(integer, integer, numeric, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_registrar_inventario_inicial(integer, integer, numeric, text, text) FROM PUBLIC;

DO $$
DECLARE
    r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM %I', r);
        END IF;
    END LOOP;
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON FUNCTION public.fn_registrar_ajuste(integer, integer, numeric, text, text) FROM %I', r);
            EXECUTE format('REVOKE ALL ON FUNCTION public.fn_registrar_inventario_inicial(integer, integer, numeric, text, text) FROM %I', r);
        END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_registrar_ajuste(integer, integer, numeric, text, text) TO service_role;
        GRANT EXECUTE ON FUNCTION public.fn_registrar_inventario_inicial(integer, integer, numeric, text, text) TO service_role;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 8. PERMISOS RBAC (por nombre; sin ids fijos; sin tocar filas existentes)
--    ROL_FUNCION 'Catálogo e Inventario':
--      ADMINISTRADOR → CREAR, LEER, ACTUALIZAR, ELIMINAR, PROCESAR
--      ENCARGADO     → LEER (solo consulta, según CU16)
--    PERMISO INVENTARIO (/inventario) → ADMINISTRADOR, ENCARGADO
-- ------------------------------------------------------------
DO $$
DECLARE
    v_admin  integer;
    v_enc    integer;
    v_modulo integer;
    v_func   integer;
    v_perm   integer;
    v_tabla  text;
    v_seq    text;
    v_max    bigint;
    v_ultimo bigint;
BEGIN
    SELECT id INTO v_admin FROM public.rol WHERE nombre = 'ADMINISTRADOR';
    SELECT id INTO v_enc   FROM public.rol WHERE nombre = 'ENCARGADO';
    IF v_admin IS NULL OR v_enc IS NULL THEN
        RAISE EXCEPTION 'CU16: no existen los roles ADMINISTRADOR y ENCARGADO';
    END IF;
    IF (SELECT count(*) FROM public.accion
         WHERE nombre IN ('CREAR','LEER','ACTUALIZAR','ELIMINAR','PROCESAR')) <> 5 THEN
        RAISE EXCEPTION 'CU16: faltan acciones base en ACCION (CREAR, LEER, ACTUALIZAR, ELIMINAR, PROCESAR)';
    END IF;

    -- Secuencias al día (evita colisiones de id si se insertaron filas con id
    -- fijo sin setval). Solo AVANZA la secuencia: nunca la hace retroceder.
    FOREACH v_tabla IN ARRAY ARRAY['modulo','funcion','rol_funcion','permiso','rol_permiso'] LOOP
        v_seq := pg_get_serial_sequence('public.' || v_tabla, 'id');
        IF v_seq IS NOT NULL THEN
            EXECUTE format('SELECT coalesce(max(id), 0) FROM public.%I', v_tabla) INTO v_max;
            EXECUTE format('SELECT last_value FROM %s', v_seq) INTO v_ultimo;
            IF v_max >= v_ultimo THEN   -- '=' cubre una secuencia con is_called = false
                PERFORM setval(v_seq, v_max);
            END IF;
        END IF;
    END LOOP;

    -- MODULO / FUNCION 'Catálogo e Inventario' (existen en seed.sql; se crean si faltan)
    SELECT id INTO v_modulo FROM public.modulo WHERE nombre = 'Catálogo e Inventario';
    IF v_modulo IS NULL THEN
        INSERT INTO public.modulo (nombre) VALUES ('Catálogo e Inventario') RETURNING id INTO v_modulo;
    END IF;

    SELECT id INTO v_func FROM public.funcion
     WHERE nombre = 'Catálogo e Inventario' ORDER BY id LIMIT 1;
    IF v_func IS NULL THEN
        INSERT INTO public.funcion (modulo_id, nombre, descripcion)
        VALUES (v_modulo, 'Catálogo e Inventario', 'Gestión de productos, stock y kárdex')
        RETURNING id INTO v_func;
    END IF;

    INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
    SELECT v_admin, v_func, a.id, 'Acceso total'
      FROM public.accion a
     WHERE a.nombre IN ('CREAR','LEER','ACTUALIZAR','ELIMINAR','PROCESAR')
       AND NOT EXISTS (SELECT 1 FROM public.rol_funcion rf
                        WHERE rf.rol_id = v_admin AND rf.funcion_id = v_func AND rf.accion_id = a.id);

    INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
    SELECT v_enc, v_func, a.id, 'Consulta de inventario y kárdex'
      FROM public.accion a
     WHERE a.nombre = 'LEER'
       AND NOT EXISTS (SELECT 1 FROM public.rol_funcion rf
                        WHERE rf.rol_id = v_enc AND rf.funcion_id = v_func AND rf.accion_id = a.id);

    -- PERMISO de ruta /inventario (columnas comunes a schema.sql y migracion_rbac.sql)
    SELECT id INTO v_perm FROM public.permiso WHERE nombre = 'INVENTARIO' OR ruta = '/inventario' LIMIT 1;
    IF v_perm IS NULL THEN
        INSERT INTO public.permiso (nombre, ruta, descripcion)
        VALUES ('INVENTARIO', '/inventario', 'Inventario y kárdex (CU16)')
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

-- Recarga el caché de esquema de PostgREST para exponer las nuevas RPC.
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- PENDIENTE DE COORDINACIÓN — NO EJECUTAR (todo está comentado)
-- Cada bloque requiere autorización explícita y, cuando se indica,
-- acuerdo con el responsable de CU09 (dev-erika).
-- ============================================================

-- P1 (D11) Bloquear DELETE del kárdex. Requiere que CU09 elimine su
--     compensación con DELETE (dev-erika ventas/service.ts) y use
--     fn_registrar_venta basada en private.fn_kardex_aplicar.
--
-- DROP TRIGGER IF EXISTS trg_kardex_sin_delete ON public.movimiento_kardex;
-- CREATE TRIGGER trg_kardex_sin_delete
--     BEFORE DELETE ON public.movimiento_kardex
--     FOR EACH ROW EXECUTE FUNCTION private.fn_bloquear_modificacion();

-- P2 (D10) Relleno del histórico. Ejecutar SOLO tras revisar
--     diagnostico_cu15_cu16.sql. No altera valores existentes: completa
--     columnas nuevas. Requiere desactivar temporalmente el trigger de UPDATE.
--
-- BEGIN;
-- ALTER TABLE public.movimiento_kardex DISABLE TRIGGER trg_kardex_sin_update;
-- UPDATE public.movimiento_kardex
--    SET motivo = CASE
--          WHEN tipo_movimiento = 'SALIDA'  AND stock_anterior - cantidad < 0                                     THEN 'HISTORICO'
--          WHEN tipo_movimiento = 'SALIDA'  AND starts_with(upper(coalesce(origen_movimiento,'')), 'VENTA')         THEN 'VENTA'
--          WHEN tipo_movimiento = 'SALIDA'  AND starts_with(upper(coalesce(origen_movimiento,'')), 'ORDEN_TRABAJO') THEN 'CONSUMO_OT'
--          WHEN tipo_movimiento = 'ENTRADA' AND starts_with(upper(coalesce(origen_movimiento,'')), 'ANULACION_VENTA') THEN 'ANULACION_VENTA'
--          ELSE 'HISTORICO' END,
--        stock_resultante = CASE tipo_movimiento
--          WHEN 'ENTRADA' THEN stock_anterior + cantidad
--          WHEN 'SALIDA'  THEN stock_anterior - cantidad
--          ELSE cantidad END                      -- AJUSTE antiguo: "fijaba" el valor
--  WHERE motivo IS NULL;
-- -- (Salidas con resultado negativo, AJUSTE antiguos y orígenes no
-- --  reconocidos quedan como HISTORICO: exentos de coherencia, nunca editados.)
-- ALTER TABLE public.movimiento_kardex ENABLE TRIGGER trg_kardex_sin_update;
-- ALTER TABLE public.movimiento_kardex VALIDATE CONSTRAINT chk_kardex_completo;
-- ALTER TABLE public.movimiento_kardex ALTER COLUMN motivo SET NOT NULL;
-- ALTER TABLE public.movimiento_kardex ALTER COLUMN stock_resultante SET NOT NULL;
-- COMMIT;

-- P3 (D10) Conciliación stock ↔ kárdex: por cada diferencia de la consulta A3
--     del diagnóstico, registrar un ajuste (nunca editar el histórico):
--     SELECT public.fn_registrar_ajuste(<id_admin>, <id_producto>, <stock_real>,
--            'Conciliación inicial CU16 tras migración');

-- P4 (D8) fecha_movimiento a TIMESTAMPTZ (valores existentes interpretados como UTC).
--     (ALTER COLUMN TYPE reescribe la tabla sin disparar triggers de fila.)
--
-- ALTER TABLE public.movimiento_kardex
--     ALTER COLUMN fecha_movimiento TYPE timestamptz USING fecha_movimiento AT TIME ZONE 'UTC';

-- P5 Etapa 2 (tras migrar CU09): stock modificable solo a través del núcleo
--     del kárdex y productos nuevos siempre con stock 0.
--
-- CREATE OR REPLACE FUNCTION private.fn_guardian_stock() RETURNS trigger
-- LANGUAGE plpgsql SET search_path = '' AS $$
-- BEGIN
--     IF TG_OP = 'INSERT' AND NEW.stock_disponible <> 0 THEN
--         RAISE EXCEPTION 'Un producto nuevo se registra con stock 0; use inventario inicial';
--     END IF;
--     IF TG_OP = 'UPDATE' AND NEW.stock_disponible IS DISTINCT FROM OLD.stock_disponible
--        AND coalesce(current_setting('smartservice.kardex', true), '') <> '1' THEN
--         RAISE EXCEPTION 'El stock solo se modifica mediante movimientos de kárdex';
--     END IF;
--     RETURN NEW;
-- END $$;
-- CREATE TRIGGER trg_producto_guardian_stock
--     BEFORE INSERT OR UPDATE OF stock_disponible ON public.producto
--     FOR EACH ROW EXECUTE FUNCTION private.fn_guardian_stock();
-- REVOKE INSERT, UPDATE, DELETE ON public.movimiento_kardex FROM service_role;
