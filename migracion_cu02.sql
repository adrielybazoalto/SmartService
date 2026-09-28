-- ============================================================
-- MIGRACIÓN CU02 — Recuperar Contraseña
-- Ejecutar en el SQL Editor de Supabase (la BD en vivo ya existe;
-- schema.sql solo se usa para reiniciar el esquema desde cero).
-- ============================================================

-- 1) Invalida sesiones previas (GestorSesiones): cada JWT lleva la versión
--    con la que fue emitido; al incrementar aquí, las sesiones viejas dejan
--    de ser válidas en el servidor.
ALTER TABLE USUARIO
    ADD COLUMN IF NOT EXISTS version_sesion INTEGER NOT NULL DEFAULT 0;

-- 2) TOKEN_RECUPERACION pasa a guardar SOLO el hash sha256 del token
--    (columna hash_token). Idempotente: si ya se renombró, no hace nada.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'TOKEN_RECUPERACION'
          AND column_name = 'token'
    ) THEN
        ALTER TABLE TOKEN_RECUPERACION RENAME COLUMN token TO hash_token;
        ALTER TABLE TOKEN_RECUPERACION ALTER COLUMN hash_token TYPE TEXT;
        -- La recuperación nunca se desplegó: limpia cualquier token en
        -- texto plano que pudiera quedar almacenado del desarrollo previo.
        TRUNCATE TABLE TOKEN_RECUPERACION;
    END IF;
END $$;