-- ============================================================
-- EXTRACCIÓN — Recuperar al repositorio las funciones que NO están versionadas.
--
-- Hueco documentado: la migración de CU09 (ventas/caja/kárdex) no está en el
-- repositorio (ver pruebas/bd/README.md, sección de limitaciones), aunque sus
-- tablas sí están en schema.sql. Esto rompe la reproducibilidad en una BD nueva.
--
-- Ejecutar en: Supabase Dashboard → SQL Editor.  Es SOLO LECTURA.
--
-- Salida: una fila por función con su definición completa (CREATE OR REPLACE
-- FUNCTION ...). Copie el contenido de la columna `definicion` en un archivo
-- nuevo (p. ej. migracion_cu09_ventas.sql), en el MISMO orden de dependencias,
-- y commitéelo para cerrar el hueco.
-- ============================================================

SELECT
  n.nspname                                  AS esquema,
  p.proname                                  AS funcion,
  pg_get_function_identity_arguments(p.oid)  AS argumentos,
  pg_get_functiondef(p.oid)                  AS definicion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'private')
  AND p.prokind = 'f'
  AND (
        p.proname ILIKE '%venta%'
     OR p.proname ILIKE '%caja%'
     OR p.proname ILIKE '%kardex%'
     OR p.proname ILIKE '%arqueo%'
  )
ORDER BY n.nspname, p.proname;

-- Anexo: inventario completo de funciones actuales (para detectar cualquier
-- otra que falte versionar). Descomente si lo necesita.
--
-- SELECT n.nspname AS esquema, p.proname AS funcion,
--        pg_get_function_identity_arguments(p.oid) AS argumentos
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname IN ('public', 'private') AND p.prokind = 'f'
-- ORDER BY n.nspname, p.proname;
