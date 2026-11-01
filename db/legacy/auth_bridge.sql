-- ============================================================
-- MIGRACIÓN DE VINCULACIÓN: SUPABASE AUTH + ROW LEVEL SECURITY
-- Sistema de Gestión de Servicios de Seguridad
-- Ejecutar en: Supabase Dashboard → SQL Editor (DESPUÉS de schema.sql)
-- ============================================================

-- 1) Vínculo entre USUARIO (negocio) y auth.users (Supabase Auth).
--    Cada fila de USUARIO apunta al usuario autenticado correspondiente.
ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS auth_uid uuid
    REFERENCES auth.users (id)
    ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_auth_uid ON usuario (auth_uid);

-- 2) Las credenciales las gestiona Supabase Auth (email/password, magic link,
--    OAuth...). La columna legacy `contrasena` deja de ser obligatoria.
ALTER TABLE usuario ALTER COLUMN contrasena DROP NOT NULL;

-- 3) ROW LEVEL SECURITY.
--    Modelo de seguridad adoptado: aplicación de UNA sola organización.
--    Cualquier usuario autenticado opera sobre los datos de negocio;
--    los permisos finos (módulos, funciones, acciones) se controlan en la
--    capa de aplicación mediante ROL_FUNCION + ROL.
--    USUARIO es la excepción: UPDATE/DELETE solo sobre el propio perfil.
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'rol','modulo','accion','funcion','cliente','categoria_producto',
        'producto','proveedor','servicio','rol_funcion','establecimiento',
        'producto_proveedor','sistema_instalado','bitacora','token_recuperacion',
        'movimiento_kardex','cotizacion','detalle_cotizacion_producto',
        'detalle_cotizacion_servicio','orden_trabajo','orden_trabajo_tecnico',
        'carga_horaria_tecnico','bloqueo_tecnico','detalle_consumo_material',
        'nota_servicio','mantenimiento_ticket','alerta_notificacion','caja',
        'venta','detalle_venta','imagen_producto'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'rls_' || t || '_select', t);
        EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
                       'rls_' || t || '_select', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'rls_' || t || '_insert', t);
        EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (true)',
                       'rls_' || t || '_insert', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'rls_' || t || '_update', t);
        EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (true)',
                       'rls_' || t || '_update', t);

        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'rls_' || t || '_delete', t);
        EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (true)',
                       'rls_' || t || '_delete', t);
    END LOOP;

    -- USUARIO: políticas específicas (propias del perfil)
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', 'usuario');

    EXECUTE 'DROP POLICY IF EXISTS rls_usuario_select ON usuario';
    EXECUTE 'CREATE POLICY rls_usuario_select ON usuario FOR SELECT TO authenticated USING (true)';

    EXECUTE 'DROP POLICY IF EXISTS rls_usuario_update_own ON usuario';
    EXECUTE 'CREATE POLICY rls_usuario_update_own ON usuario FOR UPDATE TO authenticated USING (auth_uid = auth.uid()) WITH CHECK (auth_uid = auth.uid())';
END $$;

-- 4) Tareas administrativas (crear/eliminar usuarios, tareas internas)
--    se ejecutan con el cliente SERVICE ROLE, que omite RLS.
--    No se definen políticas INSERT/DELETE sobre `usuario` para
--    el rol authenticated: solo el service role / admin las realiza.