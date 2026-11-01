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

-- Verificación (ejecutar aparte): 2 columnas, 2 triggers y 2 funciones
-- SELECT table_name, column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name IN ('cliente', 'establecimiento') AND column_name = 'estado';
-- SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.bitacora'::regclass AND NOT tgisinternal;
-- SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon
--   FROM pg_proc WHERE proname IN ('fn_registrar_token_recuperacion', 'fn_restablecer_contrasena');
