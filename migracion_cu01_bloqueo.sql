-- ============================================================
-- MIGRACIÓN CU01 — Bloqueo temporal por intentos fallidos
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
-- IDEMPOTENTE: puede re-ejecutarse sin errores.
--
-- Añade a USUARIO:
--   intentos_fallidos INTEGER NOT NULL DEFAULT 0  (contador de fallos)
--   bloqueado_hasta  TIMESTAMPTZ NULL             (fin de la penalización)
-- ============================================================

ALTER TABLE public.usuario
    ADD COLUMN IF NOT EXISTS intentos_fallidos INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.usuario
    ADD COLUMN IF NOT EXISTS bloqueado_hasta TIMESTAMPTZ;

COMMENT ON COLUMN public.usuario.intentos_fallidos IS
    'Intentos de contraseña incorrectos consecutivos (CU01). Se reinicia al lograr acceso o al expirar el bloqueo.';
COMMENT ON COLUMN public.usuario.bloqueado_hasta IS
    'Instante UTC hasta el cual la cuenta queda bloqueada por superar el límite de intentos (CU01). NULL = sin bloqueo.';