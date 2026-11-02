-- =====================================================================
--  SmartService - CU12 Corrección de datos: fechas guardadas en UTC
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Resta 4 horas a las fechas que la app guardó en UTC. Es idempotente: cada
--  fila solo cambia si aún tiene el valor exacto anterior a la corrección, así
--  que ejecutarlo dos veces no resta 8 horas ni toca órdenes modificadas después.
-- =====================================================================

BEGIN;

UPDATE public.orden_trabajo AS ot
   SET fecha_inicio_programada = v.inicio - INTERVAL '4 hours',
       fecha_fin_programada    = v.fin    - INTERVAL '4 hours'
  FROM (VALUES
    (5, 'OT-2026-001', TIMESTAMP '2026-11-01 12:00:00', TIMESTAMP '2026-11-01 16:00:00'),
    (6, 'OT-2026-002', TIMESTAMP '2026-11-02 13:00:00', TIMESTAMP '2026-11-02 16:00:00'),
    (7, 'OT-2026-003', TIMESTAMP '2026-11-02 12:00:00', TIMESTAMP '2026-11-02 16:00:00'),
    (8, 'OT-2026-004', TIMESTAMP '2026-11-01 19:01:00', TIMESTAMP '2026-11-01 19:03:00'),
    (9, 'OT-2026-005', TIMESTAMP '2026-11-01 19:10:00', TIMESTAMP '2026-11-01 19:15:00')
  ) AS v(id, codigo, inicio, fin)
 WHERE ot.id = v.id
   AND ot.codigo_orden = v.codigo
   AND ot.fecha_inicio_programada = v.inicio
   AND ot.fecha_fin_programada = v.fin;

UPDATE public.orden_trabajo
   SET fecha_inicio_real = fecha_inicio_real - INTERVAL '4 hours',
       fecha_fin_real    = fecha_fin_real    - INTERVAL '4 hours'
 WHERE id = 2
   AND codigo_orden = 'OT-PRUEBA-002'
   AND fecha_inicio_real = TIMESTAMP '2026-10-28 14:49:08.234'
   AND fecha_fin_real    = TIMESTAMP '2026-10-28 14:50:16.337';

-- OT-2026-006: inicio ya en hora de Bolivia, fin en UTC (función sin corregir)
UPDATE public.orden_trabajo
   SET fecha_fin_real = fecha_fin_real - INTERVAL '4 hours'
 WHERE id = 10
   AND codigo_orden = 'OT-2026-006'
   AND fecha_fin_real = TIMESTAMP '2026-11-01 19:30:29.427503';

COMMIT;

-- Verificación (ejecutar aparte): OT-2026-005 debe quedar de 15:10 a 15:15
-- SELECT id, codigo_orden, fecha_inicio_programada, fecha_fin_programada, fecha_inicio_real, fecha_fin_real
--   FROM public.orden_trabajo WHERE id IN (2, 5, 6, 7, 8, 9, 10) ORDER BY id;
