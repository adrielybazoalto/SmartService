-- =====================================================================
--  Diagnóstico (SOLO LECTURA) · CU11 Cuadrillas de OT-2026-002 y OT-2026-003
--  Ejecutar en Supabase > SQL Editor. No modifica datos.
--
--  Situación (migracion_cu12_correccion_horas.sql, hora de Bolivia):
--    OT-2026-002  lunes 02/11/2026  09:00 - 12:00
--    OT-2026-003  lunes 02/11/2026  08:00 - 12:00
--  Las dos ventanas se cruzan de 09:00 a 12:00: un mismo técnico NO puede
--  estar en las dos cuadrillas (el CU11 lo rechaza: "Asignado a la orden ...").
--  Cada orden necesita su propia cuadrilla con un único líder (es_lider).
--  La asignación se hace desde la pantalla Asignar técnicos (CU11), que
--  valida jornada (CU10), bloqueos y cruces; este script solo muestra el estado.
-- =====================================================================

-- 1) Las dos órdenes, su ventana y su estado (deben estar PROGRAMADA para asignar)
SELECT id, codigo_orden, estado, tipo_trabajo,
       fecha_inicio_programada, fecha_fin_programada,
       to_char(fecha_inicio_programada, 'TMDay') AS dia
  FROM orden_trabajo
 WHERE codigo_orden IN ('OT-2026-002', 'OT-2026-003')
 ORDER BY codigo_orden;

-- 2) Cuadrilla actual de cada orden (líder primero)
SELECT ot.codigo_orden, u.id AS tecnico_id, u.nombre, ott.es_lider
  FROM orden_trabajo_tecnico ott
  JOIN orden_trabajo ot ON ot.id = ott.orden_trabajo_id
  JOIN usuario u        ON u.id = ott.usuario_id
 WHERE ot.codigo_orden IN ('OT-2026-002', 'OT-2026-003')
 ORDER BY ot.codigo_orden, ott.es_lider DESC, u.nombre;

-- 3) Reglas de la cuadrilla: exactamente 1 líder y al menos 1 técnico
SELECT ot.codigo_orden,
       count(ott.usuario_id)                       AS integrantes,
       count(*) FILTER (WHERE ott.es_lider)        AS lideres,
       CASE WHEN count(ott.usuario_id) = 0 THEN 'SIN CUADRILLA'
            WHEN count(*) FILTER (WHERE ott.es_lider) <> 1 THEN 'REVISAR: debe tener 1 líder'
            ELSE 'OK' END                          AS diagnostico
  FROM orden_trabajo ot
  LEFT JOIN orden_trabajo_tecnico ott ON ott.orden_trabajo_id = ot.id
 WHERE ot.codigo_orden IN ('OT-2026-002', 'OT-2026-003')
 GROUP BY ot.codigo_orden
 ORDER BY ot.codigo_orden;

-- 4) Técnicos repetidos en las dos órdenes (conflicto de horario)
SELECT u.id AS tecnico_id, u.nombre, 'Está en OT-2026-002 y OT-2026-003 (se cruzan 09:00-12:00)' AS conflicto
  FROM orden_trabajo_tecnico a
  JOIN orden_trabajo oa ON oa.id = a.orden_trabajo_id AND oa.codigo_orden = 'OT-2026-002'
  JOIN orden_trabajo_tecnico b ON b.usuario_id = a.usuario_id
  JOIN orden_trabajo ob ON ob.id = b.orden_trabajo_id AND ob.codigo_orden = 'OT-2026-003'
  JOIN usuario u ON u.id = a.usuario_id;

-- 5) Técnicos activos y si pueden tomar cada ventana
--    (bloqueos y otras órdenes activas que se cruzan; la jornada se muestra para revisarla)
WITH ventanas AS (
  SELECT id, codigo_orden, fecha_inicio_programada AS ini, fecha_fin_programada AS fin
    FROM orden_trabajo WHERE codigo_orden IN ('OT-2026-002', 'OT-2026-003')
), tecnicos AS (
  SELECT u.id, u.nombre FROM usuario u JOIN rol r ON r.id = u.rol_id
   WHERE r.nombre = 'TECNICO' AND u.estado = true
)
SELECT v.codigo_orden, t.id AS tecnico_id, t.nombre,
       (SELECT string_agg(c.dia_semana || ' ' || c.hora_inicio || '-' || c.hora_fin, '; ')
          FROM carga_horaria_tecnico c WHERE c.usuario_id = t.id AND c.activo) AS jornada,
       (SELECT string_agg(coalesce(b.tipo, 'bloqueo') || ' ' || b.fecha_inicio || ' a ' || b.fecha_fin, '; ')
          FROM bloqueo_tecnico b
         WHERE b.usuario_id = t.id AND b.fecha_inicio < v.fin AND b.fecha_fin > v.ini) AS bloqueos_que_cruzan,
       (SELECT string_agg(o.codigo_orden, ', ')
          FROM orden_trabajo_tecnico x JOIN orden_trabajo o ON o.id = x.orden_trabajo_id
         WHERE x.usuario_id = t.id AND o.id <> v.id
           AND upper(o.estado) NOT IN ('FINALIZADA', 'CANCELADA')
           AND o.fecha_inicio_programada < v.fin AND o.fecha_fin_programada > v.ini) AS otras_ordenes_que_cruzan
  FROM ventanas v CROSS JOIN tecnicos t
 ORDER BY v.codigo_orden, t.nombre;
