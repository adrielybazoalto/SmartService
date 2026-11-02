-- =====================================================================
--  CU13 · Mano de obra según lo pactado en la cotización
--  NO crea ni modifica tablas ni columnas: solo reemplaza la función
--  fn_calcular_liquidacion (misma firma y mismo resultado).
--
--  Antes: mano de obra = horas reales (fin real - inicio real) × tarifa.
--         Si la labor duró minutos (o el fin se marcó enseguida), la mano
--         de obra salía casi 0 aunque la cotización tuviera servicios.
--  Ahora (orden con cotización):
--         horas cobradas = MAYOR(horas reales, horas estimadas cotizadas)
--         mano de obra   = horas cobradas × tarifa pactada
--         => se cobra al menos lo pactado; si el trabajo tomó más horas que
--            las cotizadas, se cobran las horas reales a la tarifa pactada.
--  Orden correctiva (sin cotización): horas reales × tarifa del servicio
--  elegido (sin cambios).
--  Materiales: lo registrado en el reporte de campo (CU12), sin cambios.
--
--  Ejecutar en Supabase > SQL Editor. Idempotente.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_calcular_liquidacion(
    p_orden_id    INTEGER,
    p_servicio_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
    costo_materiales  NUMERIC,
    horas_trabajadas  NUMERIC,   -- horas COBRADAS (ver arriba)
    tarifa_hora       NUMERIC,
    costo_mano_obra   NUMERIC,
    total_liquidacion NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_cotizacion_id INTEGER;
    v_inicio        TIMESTAMP;
    v_fin           TIMESTAMP;
    v_horas_reales  NUMERIC;
    v_horas_cot     NUMERIC := 0;
    v_horas         NUMERIC;
    v_materiales    NUMERIC;
    v_tarifa        NUMERIC;
BEGIN
    SELECT ot.cotizacion_id, ot.fecha_inicio_real, ot.fecha_fin_real
      INTO v_cotizacion_id, v_inicio, v_fin
      FROM orden_trabajo ot
     WHERE ot.id = p_orden_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'La orden de trabajo % no existe', p_orden_id;
    END IF;

    -- Horas reales registradas por el técnico en el CU12
    v_horas_reales := CASE
        WHEN v_inicio IS NOT NULL AND v_fin IS NOT NULL AND v_fin > v_inicio
        THEN ROUND(EXTRACT(EPOCH FROM (v_fin - v_inicio)) / 3600.0, 2)
        ELSE 0 END;

    -- Materiales consumidos en campo (reporte del CU12) a precio de venta
    SELECT COALESCE(SUM(dcm.cantidad_utilizada * p.precio_compra_actual
                        * (1 + COALESCE(p.margen_ganancia, 0) / 100)), 0)
      INTO v_materiales
      FROM detalle_consumo_material dcm
      JOIN producto p ON p.id = dcm.producto_id
     WHERE dcm.orden_trabajo_id = p_orden_id;

    IF p_servicio_id IS NOT NULL THEN
        SELECT s.precio_hora_base INTO v_tarifa FROM servicio s WHERE s.id = p_servicio_id;
    ELSIF v_cotizacion_id IS NOT NULL THEN
        -- Tarifa pactada: promedio ponderado de los servicios cotizados
        SELECT CASE WHEN SUM(d.horas_estimadas) > 0
                    THEN SUM(d.precio_hora * d.horas_estimadas) / SUM(d.horas_estimadas) END,
               COALESCE(SUM(d.horas_estimadas), 0)
          INTO v_tarifa, v_horas_cot
          FROM detalle_cotizacion_servicio d
         WHERE d.cotizacion_id = v_cotizacion_id;
    END IF;

    -- Con cotización se cobra al menos lo pactado
    v_horas := CASE WHEN v_cotizacion_id IS NOT NULL AND p_servicio_id IS NULL
                    THEN GREATEST(v_horas_reales, v_horas_cot)
                    ELSE v_horas_reales END;

    v_materiales := ROUND(v_materiales, 2);
    v_tarifa     := ROUND(COALESCE(v_tarifa, 0), 2);

    RETURN QUERY
    SELECT v_materiales, v_horas, v_tarifa, ROUND(v_horas * v_tarifa, 2),
           v_materiales + ROUND(v_horas * v_tarifa, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_calcular_liquidacion(INTEGER, INTEGER) FROM PUBLIC;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON FUNCTION public.fn_calcular_liquidacion(INTEGER, INTEGER) FROM anon, authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        GRANT EXECUTE ON FUNCTION public.fn_calcular_liquidacion(INTEGER, INTEGER) TO service_role;
    END IF;
END $$;

COMMIT;
