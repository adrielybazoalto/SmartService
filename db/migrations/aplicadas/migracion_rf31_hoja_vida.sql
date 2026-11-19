-- =====================================================================
--  SmartService - RF31 Hoja de vida automática al pagar la nota
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente. Sin tablas ni columnas nuevas.
--  NO modifica ninguna función del CU12 ni del CU13.
--
--  Contiene:
--   1. private.fn_hoja_vida_nota: aplica las reglas de la hoja de vida a
--      UNA nota PAGADA (ticket PREVENTIVO/CORRECTIVO o trabajo con
--      cotización). Idempotente.
--   2. Trigger trg_nota_hoja_vida en NOTA_SERVICIO (AFTER INSERT OR UPDATE
--      OF estado), solo cuando la nota queda PAGADA. Cubre la nota emitida
--      ya PAGADA (sp_emitir_nota_servicio) y la PENDIENTE que se liquida
--      (sp_registrar_pago_manual_nota / sp_registrar_pago_nota).
--   3. Datos existentes: regla 2 sobre las notas que YA están PAGADA.
--
--  Decisiones:
--   - El trigger es un CONSTRAINT TRIGGER DIFERIDO (se ejecuta al confirmar
--     la transacción del cobro). Motivo: BITACORA.usuario_id es NOT NULL con
--     FK a USUARIO, y el usuario que cobró solo se conoce por la fila
--     EMITIR_NOTA_SERVICIO / PAGO_NOTA_SERVICIO que el CU13 escribe DESPUÉS
--     del INSERT/UPDATE de la nota. Al diferir, esa fila ya existe y la
--     hoja de vida queda a nombre de quien cobró. Si no se encuentra (p. ej.
--     un UPDATE manual en el SQL Editor), se usa el primer ADMINISTRADOR
--     activo y la descripción lo indica.
--   - Un fallo de la hoja de vida NO revierte el cobro: se captura, se
--     emite un WARNING y el pago queda confirmado (Stripe ya cobró).
--   - fecha_base se toma en hora de Bolivia (America/La_Paz), como el resto
--     de fechas del sistema: un pago a las 22:00 no cae en el día siguiente.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Reglas de la hoja de vida para una nota
-- ---------------------------------------------------------------------
--    Devuelve lo que hizo: 'GENERAR_HOJA_VIDA', 'ACTUALIZAR_HOJA_VIDA' o
--    NULL (nada que hacer: nota no pagada, OT sin ticket ni cotización,
--    sistema ya generado o cotización sin establecimiento).
CREATE OR REPLACE FUNCTION private.fn_hoja_vida_nota(p_nota_id INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_nota       public.nota_servicio%ROWTYPE;
    v_orden      public.orden_trabajo%ROWTYPE;
    v_ticket     public.mantenimiento_ticket%ROWTYPE;
    v_sistema    public.sistema_instalado%ROWTYPE;
    v_cot        public.cotizacion%ROWTYPE;
    v_base       DATE;
    v_instal     DATE;
    v_usuario    INTEGER;
    v_emision_id INTEGER;
    v_sin_sesion BOOLEAN := FALSE;
    v_tk         TEXT;
    v_accion     TEXT;
    v_desc       TEXT;
BEGIN
    SELECT * INTO v_nota FROM public.nota_servicio WHERE id = p_nota_id;
    IF NOT FOUND OR v_nota.estado <> 'PAGADA' THEN
        RETURN NULL;
    END IF;

    -- Bloquea la OT: dos ejecuciones simultáneas no crean dos sistemas
    SELECT * INTO v_orden FROM public.orden_trabajo WHERE id = v_nota.orden_trabajo_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    v_base := COALESCE(
        (v_nota.fecha_pago AT TIME ZONE 'America/La_Paz')::DATE,
        v_nota.fecha_emision,
        (now() AT TIME ZONE 'America/La_Paz')::DATE
    );

    IF v_orden.mantenimiento_ticket_id IS NOT NULL THEN
        -- Regla 1: OT derivada de un ticket del CU18
        SELECT * INTO v_ticket FROM public.mantenimiento_ticket
         WHERE id = v_orden.mantenimiento_ticket_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN NULL;
        END IF;
        SELECT * INTO v_sistema FROM public.sistema_instalado
         WHERE id = v_ticket.sistema_instalado_id FOR UPDATE;

        v_tk := 'TK-' || to_char(v_ticket.fecha_reporte, 'YYYY') || '-' || lpad(v_ticket.id::TEXT, 3, '0');

        IF v_ticket.tipo_mantenimiento = 'PREVENTIVO' THEN
            UPDATE public.sistema_instalado
               SET fecha_ultimo_mantenimiento  = v_base,
                   fecha_proximo_mantenimiento = (v_base + make_interval(months => periodicidad_meses))::DATE
             WHERE id = v_ticket.sistema_instalado_id
            RETURNING * INTO v_sistema;
        END IF;

        UPDATE public.mantenimiento_ticket
           SET estado = 'RESUELTO'
         WHERE id = v_ticket.id AND estado IN ('ABIERTO', 'EN_PROCESO');

        v_accion := 'ACTUALIZAR_HOJA_VIDA';
        v_desc := 'Hoja de vida del sistema "' || COALESCE(v_sistema.nombre_sistema, '?')
               || '" por la nota ' || v_nota.numero_nota || ' (orden ' || v_orden.codigo_orden
               || ', ticket ' || v_tk || ' ' || v_ticket.tipo_mantenimiento || ')'
               || CASE WHEN v_ticket.tipo_mantenimiento = 'PREVENTIVO'
                       THEN ' | último mantenimiento: ' || v_sistema.fecha_ultimo_mantenimiento
                         || ' | próximo: ' || v_sistema.fecha_proximo_mantenimiento
                       ELSE ' | correctivo: fechas preventivas sin cambio' END
               || CASE WHEN v_ticket.estado IN ('ABIERTO', 'EN_PROCESO')
                       THEN ' | ticket RESUELTO' ELSE '' END;

    ELSIF v_orden.cotizacion_id IS NOT NULL THEN
        -- Regla 2: trabajo nuevo con cotización (idempotente por orden_trabajo_id)
        IF EXISTS (SELECT 1 FROM public.sistema_instalado WHERE orden_trabajo_id = v_orden.id) THEN
            RETURN NULL;
        END IF;

        SELECT * INTO v_cot FROM public.cotizacion WHERE id = v_orden.cotizacion_id;
        IF NOT FOUND OR v_cot.establecimiento_id IS NULL THEN
            RAISE WARNING 'Hoja de vida: la cotización de la orden % no tiene establecimiento; no se generó el sistema instalado',
                v_orden.codigo_orden;
            RETURN NULL;
        END IF;

        v_instal := COALESCE(v_orden.fecha_fin_real::DATE, v_base);

        INSERT INTO public.sistema_instalado (
            establecimiento_id, orden_trabajo_id, nombre_sistema, fecha_instalacion,
            periodicidad_meses, fecha_proximo_mantenimiento)
        VALUES (
            v_cot.establecimiento_id, v_orden.id,
            left(v_orden.tipo_trabajo || ' - ' || v_cot.numero_cotizacion, 150),
            v_instal, 6, (v_instal + INTERVAL '6 months')::DATE)
        RETURNING * INTO v_sistema;

        v_accion := 'GENERAR_HOJA_VIDA';
        v_desc := 'Se generó el sistema instalado "' || v_sistema.nombre_sistema
               || '" (id ' || v_sistema.id || ') por la nota ' || v_nota.numero_nota
               || ' (orden ' || v_orden.codigo_orden || ', cotización ' || v_cot.numero_cotizacion || ')'
               || ' | instalación: ' || v_sistema.fecha_instalacion
               || ' | próximo mantenimiento: ' || v_sistema.fecha_proximo_mantenimiento;
    ELSE
        -- Regla 3: orden correctiva directa, sin ticket ni cotización
        RETURN NULL;
    END IF;

    -- Regla 4: bitácora a nombre de quien emitió/cobró la nota (CU13).
    --   numero_nota se ha reutilizado tras borrar notas de prueba, por eso la
    --   emisión se busca por número Y orden, y el pago, después de esa emisión.
    SELECT b.id, b.usuario_id INTO v_emision_id, v_usuario
      FROM public.bitacora b
     WHERE b.accion = 'EMITIR_NOTA_SERVICIO'
       AND b.descripcion LIKE 'Nota ' || v_nota.numero_nota || ' de la orden ' || v_orden.codigo_orden || ' %'
     ORDER BY b.id DESC LIMIT 1;

    SELECT COALESCE(
        (SELECT b.usuario_id FROM public.bitacora b
          WHERE b.accion = 'PAGO_NOTA_SERVICIO'
            AND b.descripcion LIKE 'Nota ' || v_nota.numero_nota || ' %'
            AND b.id > COALESCE(v_emision_id, 0)
          ORDER BY b.id DESC LIMIT 1),
        v_usuario) INTO v_usuario;

    IF v_usuario IS NULL THEN
        v_sin_sesion := TRUE;
        SELECT u.id INTO v_usuario
          FROM public.usuario u JOIN public.rol r ON r.id = u.rol_id
         WHERE r.nombre = 'ADMINISTRADOR' AND u.estado
         ORDER BY u.id LIMIT 1;
    END IF;

    IF v_usuario IS NOT NULL THEN
        INSERT INTO public.bitacora (usuario_id, accion, descripcion)
        VALUES (v_usuario, v_accion,
                v_desc || CASE WHEN v_sin_sesion THEN ' | registrado automáticamente (sin sesión)' ELSE '' END);
    END IF;

    RETURN v_accion;
END;
$$;


-- ---------------------------------------------------------------------
-- 2. Trigger en NOTA_SERVICIO
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.fn_tg_hoja_vida_nota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.estado <> 'PAGADA'
       OR (TG_OP = 'UPDATE' AND OLD.estado = 'PAGADA') THEN
        RETURN NULL;
    END IF;

    -- El cobro ya está hecho: un error aquí no debe revertirlo
    BEGIN
        PERFORM private.fn_hoja_vida_nota(NEW.id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Hoja de vida: no se pudo procesar la nota % (%): %',
            NEW.numero_nota, SQLSTATE, SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_nota_hoja_vida ON public.nota_servicio;
CREATE CONSTRAINT TRIGGER trg_nota_hoja_vida
    AFTER INSERT OR UPDATE OF estado ON public.nota_servicio
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION private.fn_tg_hoja_vida_nota();

-- Nadie las llama directamente: solo el trigger (y la carga del punto 3)
REVOKE ALL ON FUNCTION private.fn_hoja_vida_nota(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.fn_tg_hoja_vida_nota() FROM PUBLIC;
DO $$
DECLARE r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('REVOKE ALL ON FUNCTION private.fn_hoja_vida_nota(INTEGER) FROM %I', r);
            EXECUTE format('REVOKE ALL ON FUNCTION private.fn_tg_hoja_vida_nota() FROM %I', r);
        END IF;
    END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 3. Datos existentes: regla 2 sobre las notas ya PAGADA
-- ---------------------------------------------------------------------
--    Solo OT sin ticket y con cotización. Vista previa (sin escribir nada):
--    db/diagnostics/vista_previa_rf31_hoja_vida.sql
SELECT ns.numero_nota, private.fn_hoja_vida_nota(ns.id) AS resultado
  FROM public.nota_servicio ns
  JOIN public.orden_trabajo ot ON ot.id = ns.orden_trabajo_id
 WHERE ns.estado = 'PAGADA'
   AND ot.mantenimiento_ticket_id IS NULL
   AND ot.cotizacion_id IS NOT NULL
 ORDER BY ns.id;

COMMIT;

-- Verificación (ejecutar aparte):
-- SELECT tgname, tgdeferrable, tginitdeferred FROM pg_trigger WHERE tgname = 'trg_nota_hoja_vida';  -- t, t
-- SELECT si.id, c.nombre, e.nombre_establecimiento, si.nombre_sistema, si.orden_trabajo_id,
--        si.fecha_instalacion, si.fecha_proximo_mantenimiento
--   FROM sistema_instalado si JOIN establecimiento e ON e.id = si.establecimiento_id
--   JOIN cliente c ON c.id = e.cliente_id ORDER BY si.id;     -- 6 filas
-- SELECT usuario_id, accion, descripcion FROM bitacora WHERE accion LIKE '%HOJA_VIDA' ORDER BY id;
-- SELECT has_function_privilege('service_role', 'private.fn_hoja_vida_nota(integer)', 'EXECUTE');  -- false
