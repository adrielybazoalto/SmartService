-- =====================================================================
--  SmartService - CU19 Gestionar Alertas y Notificaciones Preventivas
--  Capa de datos (PostgreSQL / Supabase)
--
--  PROPUESTA: ejecutar en Supabase SOLO con autorización
--  (SQL Editor > New query > pegar > Run). Es idempotente y no borra datos.
--
--  Contiene:
--   1. RBAC: FUNCION ALERTAS_PREVENTIVAS (/alertas) para ADMINISTRADOR y
--      ENCARGADO (LEER y ACTUALIZAR).
--   2. Índice de apoyo para la clave lógica de idempotencia.
--   3. fn_generar_alertas_preventivas: evaluación diaria atómica.
--
--  Sin tablas ni columnas nuevas. Va junto con src/lib/navigation.ts
--  (ítem "Alertas Preventivas (CU19)" en P4).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. RBAC
-- ---------------------------------------------------------------------
SELECT setval(
    pg_get_serial_sequence('public.funcion', 'id'),
    (SELECT COALESCE(MAX(id), 1) FROM public.funcion)
);

-- FUNCION del módulo (módulo 8: "Mantenimiento y Alertas" del seed).
INSERT INTO public.funcion (modulo_id, nombre, descripcion, clave, ruta)
SELECT m.id,
       'Alertas Preventivas',
       'Alertas de mantenimiento preventivo próximo a vencer o vencido (CU19)',
       'ALERTAS_PREVENTIVAS',
       '/alertas'
  FROM public.modulo m
 WHERE m.nombre = 'Mantenimiento y Alertas'
   AND NOT EXISTS (SELECT 1 FROM public.funcion f WHERE f.clave = 'ALERTAS_PREVENTIVAS');

-- ADMINISTRADOR y ENCARGADO: entrar al panel y marcar alertas como leídas.
INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
SELECT r.id, f.id, a.id, 'Alertas preventivas (CU19)'
  FROM public.rol r, public.funcion f, public.accion a
 WHERE r.nombre IN ('ADMINISTRADOR', 'ENCARGADO')
   AND f.clave = 'ALERTAS_PREVENTIVAS'
   AND a.nombre IN ('LEER', 'ACTUALIZAR')
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Índice de la clave lógica (sistema + mensaje del ciclo)
--    La tabla no tiene UNIQUE; este índice acelera el NOT EXISTS.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_alerta_sistema_mensaje
    ON public.alerta_notificacion (sistema_instalado_id, mensaje);

-- ---------------------------------------------------------------------
-- 3. Evaluación diaria
-- ---------------------------------------------------------------------
--    - pg_advisory_xact_lock: si dos ejecuciones coinciden, la segunda
--      espera y ve las filas de la primera (no duplica).
--    - Clave lógica: sistema_instalado_id + mensaje, donde el mensaje
--      depende SOLO de la fecha de próximo mantenimiento (ciclo). Así
--      sobrevive a renombres del sistema y respeta las alertas históricas
--      (una alerta ya leída no se vuelve a crear).
--    - "Hoy" se calcula en hora de Bolivia, igual que ahoraBolivia().
--    - El texto debe coincidir con PLANTILLA_MENSAJE_ALERTA de
--      src/backend/alertas/constantes.ts (la prueba cu19-rpc lo verifica).
CREATE OR REPLACE FUNCTION public.fn_generar_alertas_preventivas(
    p_umbral_dias INTEGER DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_hoy      DATE;
    v_evaluadas INTEGER := 0;
    v_creadas   INTEGER := 0;
BEGIN
    IF p_umbral_dias IS NULL OR p_umbral_dias < 0 THEN
        RAISE EXCEPTION 'El umbral de días debe ser un entero no negativo';
    END IF;

    -- Una sola evaluación a la vez (se libera al terminar la transacción).
    PERFORM pg_advisory_xact_lock(hashtext('smartservice:alertas_preventivas'));

    v_hoy := (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz')::date;

    SELECT count(*)
      INTO v_evaluadas
      FROM public.sistema_instalado s
     WHERE s.fecha_proximo_mantenimiento IS NOT NULL
       AND s.fecha_proximo_mantenimiento <= v_hoy + p_umbral_dias;

    WITH dentro_del_umbral AS (
        SELECT s.id AS sistema_instalado_id,
               'Mantenimiento preventivo programado para el ' ||
               to_char(s.fecha_proximo_mantenimiento, 'YYYY-MM-DD') || '.' AS mensaje
          FROM public.sistema_instalado s
         WHERE s.fecha_proximo_mantenimiento IS NOT NULL
           AND s.fecha_proximo_mantenimiento <= v_hoy + p_umbral_dias
    )
    INSERT INTO public.alerta_notificacion (sistema_instalado_id, mensaje, fecha_alerta, leido)
    SELECT d.sistema_instalado_id,
           d.mensaje,
           (CURRENT_TIMESTAMP AT TIME ZONE 'America/La_Paz'),
           FALSE
      FROM dentro_del_umbral d
     WHERE NOT EXISTS (
         SELECT 1
           FROM public.alerta_notificacion a
          WHERE a.sistema_instalado_id = d.sistema_instalado_id
            AND a.mensaje = d.mensaje
     );

    GET DIAGNOSTICS v_creadas = ROW_COUNT;

    RETURN jsonb_build_object(
        'evaluadas', v_evaluadas,
        'creadas', v_creadas,
        'umbral_dias', p_umbral_dias,
        'fecha_evaluacion', v_hoy
    );
END;
$$;

-- Solo el servidor (service_role) puede ejecutar la función, no el navegador.
REVOKE ALL ON FUNCTION public.fn_generar_alertas_preventivas(INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_generar_alertas_preventivas(INTEGER) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_generar_alertas_preventivas(INTEGER) TO service_role;
    END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verificación (ejecutar aparte):
-- SELECT clave, ruta FROM funcion WHERE clave = 'ALERTAS_PREVENTIVAS';
-- SELECT r.nombre, string_agg(a.nombre, ',' ORDER BY a.nombre)
--   FROM rol_funcion rf
--   JOIN rol r ON r.id = rf.rol_id
--   JOIN accion a ON a.id = rf.accion_id
--   JOIN funcion f ON f.id = rf.funcion_id
--  WHERE f.clave = 'ALERTAS_PREVENTIVAS' GROUP BY r.nombre;  -- ADMINISTRADOR/ENCARGADO: ACTUALIZAR,LEER
-- SELECT public.fn_generar_alertas_preventivas(30);          -- {evaluadas, creadas, ...}
-- SELECT has_function_privilege('anon', 'public.fn_generar_alertas_preventivas(integer)', 'EXECUTE'); -- false
