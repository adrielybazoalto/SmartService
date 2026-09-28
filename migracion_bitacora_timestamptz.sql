-- ============================================================
-- CORRECCIÓN DE ZONA HORARIA DE BITÁCORA
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
-- IDEMPOTENTE: al re-ejecutarse no hace nada si ya es timestamptz.
--
-- BITACORA.fecha_hora pasa de TIMESTAMP (sin zona) a TIMESTAMPTZ (con zona).
-- Los valores existentes se interpretaron como UTC (CURRENT_TIMESTAMP los
-- almacenaba así), por lo que se convierten con AT TIME ZONE 'UTC'.
-- Tras la migración PostgREST devuelve "...+00:00" y la vista en
-- America/La_Paz (UTC-4) queda correcta en cualquier navegador/servidor.
-- ============================================================

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'bitacora'
          AND column_name = 'fecha_hora'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE public.bitacora
            ALTER COLUMN fecha_hora TYPE timestamptz
            USING fecha_hora AT TIME ZONE 'UTC';

        RAISE NOTICE 'bitacora.fecha_hora convertida a timestamptz (instantes UTC preservados).';
    ELSE
        RAISE NOTICE 'bitacora.fecha_hora ya es timestamptz o no existe; nada que hacer.';
    END IF;
END $$;