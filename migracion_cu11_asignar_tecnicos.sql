-- ============================================================
-- CU11 - Programar y Asignar Personal Técnico
-- Permiso ASIGNAR_TECNICOS (/asignar-tecnicos) para ADMINISTRADOR y ENCARGADO.
-- Idempotente: se puede ejecutar más de una vez. No crea tablas ni columnas.
-- ============================================================
BEGIN;

-- 1) Permiso (id = MAX+1, sin depender de un número fijo)
INSERT INTO permiso (id, nombre, ruta, descripcion)
SELECT (SELECT COALESCE(MAX(id), 0) + 1 FROM permiso),
       'ASIGNAR_TECNICOS',
       '/asignar-tecnicos',
       'Programación y asignación de cuadrillas técnicas (CU11)'
WHERE NOT EXISTS (SELECT 1 FROM permiso WHERE nombre = 'ASIGNAR_TECNICOS');

-- 2) Asignación a los roles ADMINISTRADOR y ENCARGADO (busca por NOMBRE)
INSERT INTO rol_permiso (id, rol_id, permiso_id, descripcion)
SELECT (SELECT COALESCE(MAX(id), 0) FROM rol_permiso) + ROW_NUMBER() OVER (ORDER BY r.id),
       r.id, p.id, 'Asignación de técnicos (CU11)'
FROM rol r
CROSS JOIN permiso p
WHERE r.nombre IN ('ADMINISTRADOR', 'ENCARGADO')
  AND p.nombre = 'ASIGNAR_TECNICOS'
  AND NOT EXISTS (
    SELECT 1 FROM rol_permiso rp WHERE rp.rol_id = r.id AND rp.permiso_id = p.id
  );

-- 3) Alinear las secuencias (si las tablas usan SERIAL/IDENTITY; si no, no hace nada)
SELECT setval(pg_get_serial_sequence('permiso', 'id'), (SELECT MAX(id) FROM permiso));
SELECT setval(pg_get_serial_sequence('rol_permiso', 'id'), (SELECT MAX(id) FROM rol_permiso));

COMMIT;

-- Verificación (ejecutar aparte): deben salir 2 filas (ADMINISTRADOR y ENCARGADO)
-- SELECT r.nombre AS rol, p.id AS permiso_id, p.nombre, p.ruta
-- FROM rol_permiso rp JOIN rol r ON r.id = rp.rol_id JOIN permiso p ON p.id = rp.permiso_id
-- WHERE p.nombre = 'ASIGNAR_TECNICOS';
