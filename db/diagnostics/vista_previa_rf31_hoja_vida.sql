-- =====================================================================
--  RF31 - Vista previa de la carga de datos existentes (SOLO LECTURA)
--  Muestra qué sistemas instalados crearía la sección 3 de
--  migracion_rf31_hoja_vida.sql. No escribe nada.
-- =====================================================================
SELECT ns.numero_nota,
       ot.codigo_orden,
       c.nombre                                             AS cliente,
       e.nombre_establecimiento                             AS establecimiento,
       ot.tipo_trabajo || ' - ' || co.numero_cotizacion     AS nombre_sistema,
       COALESCE(ot.fecha_fin_real::DATE,
                (ns.fecha_pago AT TIME ZONE 'America/La_Paz')::DATE,
                ns.fecha_emision)                           AS fecha_instalacion,
       (COALESCE(ot.fecha_fin_real::DATE,
                 (ns.fecha_pago AT TIME ZONE 'America/La_Paz')::DATE,
                 ns.fecha_emision) + INTERVAL '6 months')::DATE AS fecha_proximo_mantenimiento,
       CASE
           WHEN co.establecimiento_id IS NULL THEN 'OMITIDA: cotización sin establecimiento'
           WHEN EXISTS (SELECT 1 FROM sistema_instalado si WHERE si.orden_trabajo_id = ot.id)
                THEN 'OMITIDA: ya tiene sistema'
           ELSE 'SE CREA'
       END                                                  AS resultado
  FROM nota_servicio ns
  JOIN orden_trabajo ot  ON ot.id = ns.orden_trabajo_id
  JOIN cotizacion co     ON co.id = ot.cotizacion_id
  LEFT JOIN establecimiento e ON e.id = co.establecimiento_id
  LEFT JOIN cliente c    ON c.id = e.cliente_id
 WHERE ns.estado = 'PAGADA'
   AND ot.mantenimiento_ticket_id IS NULL
 ORDER BY ns.id;
