-- =====================================================================
--  SmartService - Cierre del acceso público a la base de datos (Fase 1)
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es seguro ejecutarlo más de una vez.
--
--  La app solo usa SUPABASE_SERVICE_ROLE_KEY (service_role ignora RLS), así
--  que cerrar anon y authenticated no la afecta. No se crean políticas: con
--  RLS activo y sin políticas, esos roles no ven ninguna fila.
--
--  Ejecutar como postgres (el SQL Editor lo hace): ALTER DEFAULT PRIVILEGES
--  aplica a los objetos que cree el rol que lo ejecuta.
-- =====================================================================

BEGIN;

-- 1) RLS en todas las tablas de public (service_role lo ignora)
DO $$ DECLARE t text; BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- 2) Quitar todo acceso de los roles públicos de Supabase
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
-- Hay que revocar también a PUBLIC: las funciones con proacl = NULL heredan
-- el EXECUTE de PUBLIC aunque se le revoque a anon.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 3) Que las tablas y funciones futuras nazcan cerradas
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
-- El EXECUTE de PUBLIC es un privilegio por defecto global: con IN SCHEMA no
-- se puede quitar (PostgreSQL lo ignora sin dar error), va sin IN SCHEMA.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- Sin el EXECUTE de PUBLIC, service_role necesita el suyo en las funciones nuevas.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;

COMMIT;

-- Verificación (ejecutar aparte; las cuatro deben devolver 0 filas):
-- SELECT table_name, privilege_type FROM information_schema.role_table_grants
--  WHERE grantee IN ('anon','authenticated') AND table_schema = 'public';
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
-- SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND c.relkind = 'S' AND has_sequence_privilege('anon', c.oid, 'USAGE');
-- SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
