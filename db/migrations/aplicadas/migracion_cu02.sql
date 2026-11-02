-- ============================================================
-- CORRECCIÓN DEFINITIVA CU02 — columna hash_token
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
-- IDEMPOTENTE: puede re-ejecutarse sin romper nada.
--
-- NOTA: los identificadores en information_schema están en
-- minúsculas (token_recuperacion, usuario) aunque el CREATE
-- original usara mayúsculas. Comparar con 'TOKEN_RECUPERACION'
-- NO matcheaba y el bloque se saltaba silenciosamente.
-- ============================================================

-- 1) Asegurar version_sesion en USUARIO (por si no se aplicó antes)
ALTER TABLE public.usuario
    ADD COLUMN IF NOT EXISTS version_sesion INTEGER NOT NULL DEFAULT 0;

-- 2) Asegurar que TOKEN_RECUPERACION tenga la columna hash_token
DO $$
BEGIN
    -- 2a) Si existe la columna antigua 'token' (tokens en texto plano):
    --     crear hash_token, migrar los valores a su hash sha256 y eliminar 'token'.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'token_recuperacion'
          AND column_name = 'token'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'token_recuperacion'
              AND column_name = 'hash_token'
        ) THEN
            ALTER TABLE public.token_recuperacion ADD COLUMN hash_token TEXT;
        END IF;

        -- Convierte los tokens existentes a su hash sha256 (hex), igual que
        -- hace el servicio (hashToken()). Los registros sin token se ignoran.
        UPDATE public.token_recuperacion
           SET hash_token = encode(sha256(token::bytea), 'hex')
         WHERE token IS NOT NULL AND token <> '';

        ALTER TABLE public.token_recuperacion DROP COLUMN token;
    END IF;

    -- 2b) Caso extremo: nunca existió 'token' y aún no está 'hash_token'.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'token_recuperacion'
          AND column_name = 'hash_token'
    ) THEN
        ALTER TABLE public.token_recuperacion ADD COLUMN hash_token TEXT;
    END IF;

    -- 2c) La columna queda obligatoria.
    ALTER TABLE public.token_recuperacion ALTER COLUMN hash_token SET NOT NULL;
END $$;

-- 3) UNIQUE sobre hash_token (la restricción de 'token' se elimina junto con
--    la columna al hacer DROP COLUMN en 2a).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'token_recuperacion_hash_token_key'
    ) THEN
        ALTER TABLE public.token_recuperacion
            ADD CONSTRAINT token_recuperacion_hash_token_key UNIQUE (hash_token);
    END IF;
END $$;