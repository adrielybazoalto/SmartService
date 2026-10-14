-- ============================================================
-- MIGRACIÓN: AUTENTICACIÓN PROPIA DE LA APLICACIÓN (bcryptjs)
-- Supabase queda como SOLO base de datos (Postgres).
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- NOTA: esta migración reemplaza el rol de `auth_bridge.sql`.
-- ============================================================

-- 1) La credencial la gestiona la APLICACIÓN: la contraseña se guarda
--    como hash bcrypt (bcryptjs) en `usuario.contrasena`.
--    La columna vuelve a ser obligatoria (siempre hay un hash).
ALTER TABLE usuario ALTER COLUMN contrasena SET NOT NULL;

-- 2) Ya no se usa Supabase Auth: se elimina el vínculo con auth.users.
ALTER TABLE usuario DROP COLUMN IF EXISTS auth_uid;

-- 3) RLS: SE MANTIENE HABILITADO como defensa en profundidad (el anon key
--    del navegador no lee nada), PERO la autorización real vive en la capa
--    de la aplicación: sesión JWT propia (cookie firmada con AUTH_SECRET)
--    + requireUser(). Todas las consultas de datos usan el cliente
--    SERVICE ROLE (server-only), que omite RLS.