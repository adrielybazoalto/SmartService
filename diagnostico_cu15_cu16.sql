-- ============================================================
-- DIAGNÓSTICO PREVIO CU15 / CU16 — SOLO LECTURA
-- Ejecutar en el SQL Editor ANTES de las migraciones y compartir los
-- resultados. Todas las sentencias son SELECT: no modifica nada.
-- Ejecutar cada bloque por separado si el editor muestra solo el último
-- resultado.
-- ============================================================

-- D0. Versión de PostgreSQL y objetos ya existentes de CU15/CU16
SELECT version();
SELECT to_regclass('public.compra') AS compra,
       to_regclass('public.detalle_compra') AS detalle_compra,
       to_regnamespace('private') AS esquema_private;

-- D1. Columnas reales de las tablas involucradas (incluye las de otros CU)
SELECT table_name, ordinal_position, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name IN ('producto','categoria_producto','proveedor','producto_proveedor',
                      'movimiento_kardex','usuario','bitacora','venta','detalle_venta',
                      'rol_permiso','permiso','funcion','rol_funcion')
 ORDER BY table_name, ordinal_position;

-- D2. Restricciones (PK, FK, UNIQUE, CHECK) de esas tablas
SELECT conrelid::regclass AS tabla, conname, contype, convalidated,
       pg_get_constraintdef(oid) AS definicion
  FROM pg_constraint
 WHERE connamespace = 'public'::regnamespace
   AND conrelid::regclass::text IN ('producto','proveedor','producto_proveedor',
                                    'movimiento_kardex','bitacora','venta','detalle_venta')
 ORDER BY 1, 2;

-- D3. Índices únicos de producto_proveedor (el upsert de CU15 necesita uno
--     exactamente sobre producto_id, proveedor_id)
SELECT indexrelid::regclass AS indice, pg_get_indexdef(indexrelid) AS definicion
  FROM pg_index
 WHERE indrelid = 'public.producto_proveedor'::regclass AND indisunique;

-- D4. Funciones existentes en public y private (¿fn_registrar_venta aplicada?)
SELECT n.nspname AS esquema, p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname IN ('public','private')
 ORDER BY 1, 2;

-- D5. Triggers existentes (no internos)
SELECT tgrelid::regclass AS tabla, tgname, tgenabled
  FROM pg_trigger
 WHERE NOT tgisinternal
 ORDER BY 1, 2;

-- D6. RLS por tabla
SELECT relname, relrowsecurity, relforcerowsecurity
  FROM pg_class
 WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
 ORDER BY relname;

-- D7. Privilegios de anon / authenticated / service_role sobre las tablas clave
SELECT table_name, grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
  FROM information_schema.role_table_grants
 WHERE table_schema = 'public'
   AND grantee IN ('anon','authenticated','service_role')
   AND table_name IN ('producto','movimiento_kardex','proveedor','producto_proveedor','bitacora')
 GROUP BY table_name, grantee
 ORDER BY 1, 2;

-- D8. Privilegios EXECUTE sobre funciones de public
SELECT routine_name, grantee, privilege_type
  FROM information_schema.role_routine_grants
 WHERE routine_schema = 'public'
   AND grantee IN ('PUBLIC','anon','authenticated','service_role')
 ORDER BY 1, 2;

-- D9. RBAC: roles, módulos, funciones, acciones y matriz actual
SELECT id, nombre FROM public.rol ORDER BY id;
SELECT id, nombre FROM public.modulo ORDER BY id;
SELECT id, modulo_id, nombre FROM public.funcion ORDER BY id;
SELECT id, nombre FROM public.accion ORDER BY id;
SELECT r.nombre AS rol, f.nombre AS funcion, a.nombre AS accion
  FROM public.rol_funcion rf
  JOIN public.rol r ON r.id = rf.rol_id
  JOIN public.funcion f ON f.id = rf.funcion_id
  JOIN public.accion a ON a.id = rf.accion_id
 ORDER BY 1, 2, 3;
SELECT r.nombre AS rol, p.nombre AS permiso, p.ruta
  FROM public.rol_permiso rp
  JOIN public.rol r ON r.id = rp.rol_id
  JOIN public.permiso p ON p.id = rp.permiso_id
 ORDER BY 1, 2;

-- D10. Volumen de datos
SELECT (SELECT count(*) FROM public.producto)           AS productos,
       (SELECT count(*) FROM public.proveedor)          AS proveedores,
       (SELECT count(*) FROM public.producto_proveedor) AS vinculos,
       (SELECT count(*) FROM public.movimiento_kardex)  AS movimientos;

-- A1. Composición del histórico del kárdex por tipo y origen
SELECT tipo_movimiento,
       upper(split_part(coalesce(origen_movimiento, ''), ':', 1)) AS origen,
       count(*)
  FROM public.movimiento_kardex
 GROUP BY 1, 2
 ORDER BY 1, 2;

-- A2. Cadenas rotas (stock_anterior ≠ resultado del movimiento previo) y
--     resultados negativos. AJUSTE se interpreta con la semántica antigua
--     (la cantidad era el stock final).
WITH k AS (
    SELECT id, producto_id, fecha_movimiento, tipo_movimiento, cantidad, stock_anterior,
           CASE tipo_movimiento
               WHEN 'ENTRADA' THEN stock_anterior + cantidad
               WHEN 'SALIDA'  THEN stock_anterior - cantidad
               ELSE cantidad
           END AS resultante_estimado
      FROM public.movimiento_kardex
), c AS (
    SELECT k.*,
           lag(resultante_estimado) OVER (PARTITION BY producto_id
                                          ORDER BY fecha_movimiento, id) AS resultante_previo
      FROM k
)
SELECT *
  FROM c
 WHERE (resultante_previo IS NOT NULL AND stock_anterior <> resultante_previo)
    OR resultante_estimado < 0
 ORDER BY producto_id, fecha_movimiento, id;

-- A3. Stock del producto frente al último movimiento del kárdex
SELECT p.id, p.nombre, p.stock_disponible, u.resultante_estimado
  FROM public.producto p
  LEFT JOIN LATERAL (
      SELECT CASE m.tipo_movimiento
                 WHEN 'ENTRADA' THEN m.stock_anterior + m.cantidad
                 WHEN 'SALIDA'  THEN m.stock_anterior - m.cantidad
                 ELSE m.cantidad
             END AS resultante_estimado
        FROM public.movimiento_kardex m
       WHERE m.producto_id = p.id
       ORDER BY m.fecha_movimiento DESC, m.id DESC
       LIMIT 1
  ) u ON true
 WHERE u.resultante_estimado IS DISTINCT FROM p.stock_disponible
   AND NOT (u.resultante_estimado IS NULL AND p.stock_disponible = 0);

-- A4. Productos con stock pero sin ningún movimiento (candidatos a
--     inventario inicial / conciliación)
SELECT p.id, p.nombre, p.stock_disponible
  FROM public.producto p
 WHERE p.stock_disponible <> 0
   AND NOT EXISTS (SELECT 1 FROM public.movimiento_kardex m WHERE m.producto_id = p.id);

-- A5. Proveedores sin NIT o con NIT duplicado (relevante para CU14)
SELECT nit, count(*) FROM public.proveedor GROUP BY nit HAVING nit IS NULL OR count(*) > 1;
