-- =====================================================================
--  SmartService - TODO LO QUE FALTA EJECUTAR EN SUPABASE
--
--  Une, en orden, estas cuatro migraciones:
--    1. migracion_rbac_matriz_completa.sql
--    2. migracion_cu12_crear_orden.sql
--    3. migracion_cu08_guardar_cotizacion.sql
--    4. migracion_fase9_ciclo1.sql
--
--  Cómo usarlo: Supabase > SQL Editor > New query > pegar TODO > Run.
--  Se puede ejecutar más de una vez sin dañar nada.
-- =====================================================================

-- =====================================================================
--  SmartService - Matriz completa de acciones y guardado atómico (Fase 5)
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente. Sin tablas nuevas.
--  Aplicar ANTES de usar exigirPermiso: el código valida cada acción y hoy la
--  mayoría de los roles solo tiene LEER.
--
--  Contiene:
--   1. Las acciones que cada rol necesita (solo agrega; no quita ninguna).
--   2. fn_guardar_permisos_rol -> guarda la matriz de un rol en UNA transacción.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Matriz de acciones
-- ---------------------------------------------------------------------
-- ADMINISTRADOR: todas las acciones en todos los módulos
INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
SELECT r.id, f.id, a.id, 'Acceso total'
  FROM public.rol r
 CROSS JOIN public.funcion f
 CROSS JOIN public.accion a
 WHERE r.nombre = 'ADMINISTRADOR'
   AND f.clave IS NOT NULL
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

-- ENCARGADO: lo que ya hacía con el permiso de módulo y exige una acción propia.
-- No recibe ELIMINAR en cotizaciones: la Fase 8 quita esa operación.
INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
SELECT r.id, f.id, a.id, v.descripcion
  FROM (VALUES
    ('COTIZACIONES',     'ACTUALIZAR', 'Editar cotizaciones (CU08)'),
    ('PROVEEDORES',      'CREAR',      'Registrar proveedores (CU14)'),
    ('PROVEEDORES',      'ACTUALIZAR', 'Actualizar proveedores y catálogo (CU14)'),
    ('ASIGNAR_TECNICOS', 'ACTUALIZAR', 'Asignar y modificar cuadrillas (CU11)'),
    ('NOTAS_SERVICIO',   'CREAR',      'Emitir notas de servicio (CU13)'),
    ('NOTAS_SERVICIO',   'PROCESAR',   'Cobrar el saldo de la nota (CU13)')
  ) AS v(clave, accion, descripcion)
  JOIN public.rol r     ON r.nombre = 'ENCARGADO'
  JOIN public.funcion f ON f.clave = v.clave
  JOIN public.accion a  ON a.nombre = v.accion
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2. Guardar la matriz de un rol
-- ---------------------------------------------------------------------
--    Reemplaza las filas del rol en los módulos con clave; las funciones sin
--    clave (p. ej. Mantenimiento y Tickets) no se tocan. Cualquier error
--    revierte todo: el rol nunca queda con la matriz a medias.
--    Tener una acción implica LEER: sin LEER no se entra al módulo.
CREATE OR REPLACE FUNCTION public.fn_guardar_permisos_rol(
    p_usuario_id INTEGER,
    p_rol_id     INTEGER,
    p_permisos   JSONB,
    p_ip         TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_rol   public.rol%ROWTYPE;
    v_leer  INTEGER;
    v_total INTEGER;
BEGIN
    SELECT * INTO v_rol FROM public.rol WHERE id = p_rol_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'El rol seleccionado no es válido';
    END IF;

    IF p_permisos IS NULL OR jsonb_typeof(p_permisos) <> 'array' THEN
        RAISE EXCEPTION 'La lista de permisos no es válida';
    END IF;

    SELECT id INTO v_leer FROM public.accion WHERE nombre = 'LEER';

    CREATE TEMP TABLE tmp_permisos (funcion_id INTEGER, accion_id INTEGER) ON COMMIT DROP;
    INSERT INTO tmp_permisos
    SELECT DISTINCT x.funcion_id, x.accion_id
      FROM jsonb_to_recordset(p_permisos) AS x(funcion_id INTEGER, accion_id INTEGER);

    IF EXISTS (
        SELECT 1 FROM tmp_permisos t
          LEFT JOIN public.funcion f ON f.id = t.funcion_id AND f.clave IS NOT NULL
          LEFT JOIN public.accion a  ON a.id = t.accion_id
         WHERE f.id IS NULL OR a.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Uno o más permisos seleccionados no existen en el sistema';
    END IF;

    INSERT INTO tmp_permisos
    SELECT DISTINCT t.funcion_id, v_leer FROM tmp_permisos t
    EXCEPT SELECT funcion_id, accion_id FROM tmp_permisos;

    -- El Administrador no puede perder Roles ni Usuarios: se quedaría sin poder corregirlo
    IF v_rol.nombre = 'ADMINISTRADOR' AND (
        SELECT count(*) FROM tmp_permisos t
          JOIN public.funcion f ON f.id = t.funcion_id
          JOIN public.accion a  ON a.id = t.accion_id
         WHERE f.clave IN ('ROLES', 'USUARIOS') AND a.nombre IN ('LEER', 'ACTUALIZAR')
    ) < 4 THEN
        RAISE EXCEPTION 'El rol Administrador Principal no puede perder permisos del sistema';
    END IF;

    DELETE FROM public.rol_funcion rf
     USING public.funcion f
     WHERE rf.funcion_id = f.id
       AND rf.rol_id = p_rol_id
       AND f.clave IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM tmp_permisos t
                        WHERE t.funcion_id = rf.funcion_id AND t.accion_id = rf.accion_id);

    INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
    SELECT p_rol_id, t.funcion_id, t.accion_id, 'Asignado desde /roles (Consola RBAC)'
      FROM tmp_permisos t
    ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

    SELECT count(*) INTO v_total FROM tmp_permisos;

    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        'CONFIGURAR_ROLES_PERMISOS',
        'Se guardaron ' || v_total || ' permiso(s) para el rol ' || v_rol.nombre,
        p_ip
    );

    RETURN v_total;
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.fn_guardar_permisos_rol(INTEGER, INTEGER, JSONB, TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_guardar_permisos_rol(INTEGER, INTEGER, JSONB, TEXT) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_guardar_permisos_rol(INTEGER, INTEGER, JSONB, TEXT) TO service_role;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


-- =====================================================================
--  SmartService - CU12 Crear orden de trabajo con correlativo en SQL (Fase 7)
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente (CREATE OR REPLACE FUNCTION). Sin tablas nuevas.
--
--  fn_crear_orden_trabajo crea las dos clases de orden en UNA transacción:
--   - con p_cotizacion_id: convierte una cotización APROBADA;
--   - sin él: orden correctiva (subflujo del CU12).
--  El código OT-AAAA-NNN se genera con un bloqueo: dos usuarios a la vez no
--  pueden obtener el mismo. La ventana llega en hora de Bolivia, sin zona.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_crear_orden_trabajo(
    p_usuario_id    INTEGER,
    p_cotizacion_id INTEGER,
    p_tipo_trabajo  TEXT,
    p_inicio        TIMESTAMP,
    p_fin           TIMESTAMP,
    p_ip            TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_estado  TEXT;
    v_tipo    TEXT := nullif(btrim(coalesce(p_tipo_trabajo, '')), '');
    v_anio    TEXT := to_char(now() AT TIME ZONE 'America/La_Paz', 'YYYY');
    v_prefijo TEXT := 'OT-' || v_anio || '-';
    v_seq     INTEGER;
    v_codigo  TEXT;
    v_orden   public.orden_trabajo%ROWTYPE;
BEGIN
    IF p_inicio IS NULL OR p_fin IS NULL THEN
        RAISE EXCEPTION 'La ventana horaria es obligatoria para crear la orden de trabajo';
    END IF;
    IF p_fin <= p_inicio THEN
        RAISE EXCEPTION 'La hora de fin programada debe ser posterior a la hora de inicio';
    END IF;

    IF p_cotizacion_id IS NOT NULL THEN
        -- Bloquea la cotización: dos conversiones simultáneas no crean dos órdenes
        SELECT estado INTO v_estado FROM public.cotizacion WHERE id = p_cotizacion_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'No se encontró la cotización';
        END IF;
        IF v_estado <> 'APROBADA' THEN
            RAISE EXCEPTION 'Solo se pueden convertir cotizaciones en estado APROBADA';
        END IF;

        SELECT codigo_orden INTO v_codigo FROM public.orden_trabajo WHERE cotizacion_id = p_cotizacion_id LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'Ya existe una Orden de Trabajo para esta cotización: %', v_codigo;
        END IF;
        v_tipo := coalesce(v_tipo, 'SERVICIO');
    ELSIF v_tipo IS NULL THEN
        RAISE EXCEPTION 'El tipo de trabajo es obligatorio';
    END IF;

    -- Correlativo OT-AAAA-NNN (bloqueo para que no se repita)
    PERFORM pg_advisory_xact_lock(hashtext('orden_trabajo_correlativo_' || v_anio));
    SELECT coalesce(max(split_part(codigo_orden, '-', 3)::INTEGER), 0) + 1 INTO v_seq
      FROM public.orden_trabajo
     WHERE codigo_orden ~ ('^' || v_prefijo || '[0-9]+$');
    v_codigo := v_prefijo || lpad(v_seq::TEXT, 3, '0');

    INSERT INTO public.orden_trabajo (
        cotizacion_id, codigo_orden, tipo_trabajo, estado, fecha_inicio_programada, fecha_fin_programada
    ) VALUES (
        p_cotizacion_id, v_codigo, v_tipo, 'PROGRAMADA', p_inicio, p_fin
    )
    RETURNING * INTO v_orden;

    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (
        p_usuario_id,
        'CREAR_ORDEN_TRABAJO',
        'Se creó la Orden de Trabajo ' || v_codigo
            || CASE WHEN p_cotizacion_id IS NULL THEN ' correctiva'
                    ELSE ' a partir de la cotización #' || p_cotizacion_id END
            || ' (Ventana: ' || to_char(p_inicio, 'YYYY-MM-DD HH24:MI')
            || ' a ' || to_char(p_fin, 'YYYY-MM-DD HH24:MI') || ')',
        p_ip
    );

    RETURN to_jsonb(v_orden);
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador
REVOKE ALL ON FUNCTION public.fn_crear_orden_trabajo(INTEGER, INTEGER, TEXT, TIMESTAMP, TIMESTAMP, TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_crear_orden_trabajo(INTEGER, INTEGER, TEXT, TIMESTAMP, TIMESTAMP, TEXT) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_crear_orden_trabajo(INTEGER, INTEGER, TEXT, TIMESTAMP, TIMESTAMP, TEXT) TO service_role;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';


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


-- =====================================================================
--  SmartService - Ciclo 1 y bitácora (Fase 9)
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente. Sin tablas nuevas.
--
--  Contiene:
--   1. CU07: estado en CLIENTE y ESTABLECIMIENTO.
--   2. CU06: la bitácora es de solo inserción.
--   3. CU02: pedir y usar el enlace de recuperación, en UNA transacción cada uno.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. CU07: desactivar en lugar de borrar
-- ---------------------------------------------------------------------
ALTER TABLE public.cliente         ADD COLUMN IF NOT EXISTS estado BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.establecimiento ADD COLUMN IF NOT EXISTS estado BOOLEAN NOT NULL DEFAULT TRUE;


-- ---------------------------------------------------------------------
-- 2. CU06: bitácora de solo inserción
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_bitacora_sin_update ON public.bitacora;
CREATE TRIGGER trg_bitacora_sin_update BEFORE UPDATE OR DELETE ON public.bitacora
    FOR EACH ROW EXECUTE FUNCTION private.fn_bloquear_modificacion();

DROP TRIGGER IF EXISTS trg_bitacora_sin_truncate ON public.bitacora;
CREATE TRIGGER trg_bitacora_sin_truncate BEFORE TRUNCATE ON public.bitacora
    FOR EACH STATEMENT EXECUTE FUNCTION private.fn_bloquear_modificacion();


-- ---------------------------------------------------------------------
-- 3. CU02: recuperar contraseña
-- ---------------------------------------------------------------------
--    Pedir un enlace: una solicitud cada 60 s por usuario e invalida los anteriores.
--    Las fechas del token se guardan en UTC, como las escribe CURRENT_TIMESTAMP.
CREATE OR REPLACE FUNCTION public.fn_registrar_token_recuperacion(
    p_usuario_id INTEGER,
    p_hash_token TEXT,
    p_minutos    INTEGER,
    p_correo     TEXT,
    p_ip         TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_ahora TIMESTAMP := now() AT TIME ZONE 'UTC';
BEGIN
    -- Bloquea al usuario: dos solicitudes simultáneas no pasan el límite
    PERFORM 1 FROM public.usuario WHERE id = p_usuario_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe una cuenta asociada a este correo';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.token_recuperacion
         WHERE usuario_id = p_usuario_id
           AND fecha_creacion > v_ahora - INTERVAL '60 seconds'
    ) THEN
        RAISE EXCEPTION 'Ya se envió un enlace. Espere un minuto para solicitar otro';
    END IF;

    UPDATE public.token_recuperacion SET usado = TRUE
     WHERE usuario_id = p_usuario_id AND usado = FALSE;

    INSERT INTO public.token_recuperacion (usuario_id, hash_token, fecha_creacion, fecha_expiracion)
    VALUES (p_usuario_id, p_hash_token, v_ahora, v_ahora + make_interval(mins => p_minutos));

    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (p_usuario_id, 'SOLICITAR_RECUPERACION', 'Solicitud de recuperación de contraseña para ' || p_correo, p_ip);
END;
$$;

--    Usar el enlace: contraseña, sesiones, token y bitácora, todo o nada.
CREATE OR REPLACE FUNCTION public.fn_restablecer_contrasena(
    p_hash_token TEXT,
    p_contrasena TEXT,
    p_ip         TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_token public.token_recuperacion%ROWTYPE;
BEGIN
    SELECT * INTO v_token FROM public.token_recuperacion WHERE hash_token = p_hash_token FOR UPDATE;

    IF NOT FOUND OR v_token.usado OR v_token.fecha_expiracion <= (now() AT TIME ZONE 'UTC') THEN
        RAISE EXCEPTION 'Enlace expirado, reinicie el proceso';
    END IF;

    -- version_sesion invalida las sesiones abiertas antes del cambio
    UPDATE public.usuario
       SET contrasena = p_contrasena, version_sesion = version_sesion + 1
     WHERE id = v_token.usuario_id;

    UPDATE public.token_recuperacion SET usado = TRUE
     WHERE usuario_id = v_token.usuario_id AND usado = FALSE;

    INSERT INTO public.bitacora (usuario_id, accion, descripcion, ip)
    VALUES (v_token.usuario_id, 'RECUPERAR_CONTRASENA', 'Contraseña restablecida mediante enlace de recuperación (CU02)', p_ip);
END;
$$;

-- Solo el servidor (service_role) puede ejecutar las funciones, no el navegador
REVOKE ALL ON FUNCTION public.fn_registrar_token_recuperacion(INTEGER, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_restablecer_contrasena(TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_registrar_token_recuperacion(INTEGER, TEXT, INTEGER, TEXT, TEXT) FROM anon, authenticated;
        REVOKE ALL ON FUNCTION public.fn_restablecer_contrasena(TEXT, TEXT, TEXT) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_registrar_token_recuperacion(INTEGER, TEXT, INTEGER, TEXT, TEXT) TO service_role;
        GRANT EXECUTE ON FUNCTION public.fn_restablecer_contrasena(TEXT, TEXT, TEXT) TO service_role;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
