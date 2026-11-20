-- =====================================================================
--  SmartService - CU20 Generar Reportes de Gestión, Ventas y
--  Rendimiento Técnico. Capa de datos (PostgreSQL / Supabase)
--
--  PROPUESTA: ejecutar en Supabase SOLO con autorización del grupo
--  (SQL Editor > New query > pegar > Run). Es idempotente, no crea
--  tablas ni columnas y no modifica datos existentes.
--
--  Contiene:
--   1. RBAC: MODULO "Reportes Gerenciales" y FUNCION REPORTES (/reportes)
--      solo para ADMINISTRADOR (LEER = generar, PROCESAR = exportar).
--   2. fn_reporte_ingresos_detalle: cada ingreso cobrado con su fecha,
--      origen y método (base común de S1 y S2).
--   3. Una función por reporte (S1..S7). Todas devuelven jsonb.
--      S4 = Rotación de inventario (antes "Materiales más utilizados").
--      S7 = Proveedores y rentabilidad (margen estimado).
--
--  Reglas (detalle del CU20):
--   RN1  Solo comprobantes EMITIDA. Compras por fecha_compra.
--   RN3  Hasta 31 días se agrupa por día; más, por mes.
--   RN4  Balance operativo = ingresos - compras.
--   RN5  Fechas en hora de Bolivia (UTC-4).
--   RN6  Nada se guarda: se calcula en cada consulta.
--
--  Origen de los ingresos (para no perder ni duplicar un cobro):
--   VENTA_DIRECTA        venta de productos (NOTA_VENTA / FACTURA) en caja
--   COBRO_ORDEN          recibos RECIBO_ABONO y RECIBO_SALDO en caja (CU09/CU13)
--   ANTICIPO_COTIZACION  recibo RECIBO_ANTICIPO en caja (CU08,
--                        migracion_cu08_anticipo_caja.sql) o, si el anticipo
--                        no tiene recibo (anterior a esa migración o tarjeta
--                        sin caja abierta), cotizacion.anticipo_monto
--   COBRO_ORDEN (tarjeta sin caja)  nota PAGADA con TARJETA sin recibo
--   ANTICIPO_ORDEN       anticipo manual de una orden correctiva (CU13)
--
--  venta.fecha_emision se guarda en UTC (CURRENT_TIMESTAMP en Supabase):
--  se convierte a hora de Bolivia antes de tomar la fecha (RN5).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. RBAC
-- ---------------------------------------------------------------------
SELECT setval(pg_get_serial_sequence('public.modulo', 'id'),
              (SELECT COALESCE(MAX(id), 1) FROM public.modulo));
SELECT setval(pg_get_serial_sequence('public.funcion', 'id'),
              (SELECT COALESCE(MAX(id), 1) FROM public.funcion));

INSERT INTO public.modulo (nombre)
SELECT 'Reportes Gerenciales'
 WHERE NOT EXISTS (SELECT 1 FROM public.modulo WHERE nombre = 'Reportes Gerenciales');

INSERT INTO public.funcion (modulo_id, nombre, descripcion, clave, ruta)
SELECT m.id,
       'Reportes',
       'Reportes de gestión, ventas y rendimiento técnico (CU20)',
       'REPORTES',
       '/reportes'
  FROM public.modulo m
 WHERE m.nombre = 'Reportes Gerenciales'
   AND NOT EXISTS (SELECT 1 FROM public.funcion f WHERE f.clave = 'REPORTES');

-- Solo el Administrador genera (LEER) y exporta (PROCESAR) reportes.
INSERT INTO public.rol_funcion (rol_id, funcion_id, accion_id, descripcion)
SELECT r.id, f.id, a.id, 'Reportes gerenciales (CU20)'
  FROM public.rol r, public.funcion f, public.accion a
 WHERE r.nombre = 'ADMINISTRADOR'
   AND f.clave = 'REPORTES'
   AND a.nombre IN ('LEER', 'PROCESAR')
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Base común: ingresos cobrados en el período
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_ingresos_detalle(
    p_desde DATE,
    p_hasta DATE
)
RETURNS TABLE (fecha DATE, origen TEXT, metodo TEXT, monto NUMERIC)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    -- Caja: ventas directas, recibos de órdenes y recibos de anticipo.
    -- fecha_emision está en UTC: se pasa a hora de Bolivia (RN5)
    SELECT x.fecha,
           CASE WHEN v.tipo_comprobante IN ('RECIBO_ABONO', 'RECIBO_SALDO') THEN 'COBRO_ORDEN'
                WHEN v.tipo_comprobante = 'RECIBO_ANTICIPO'                 THEN 'ANTICIPO_COTIZACION'
                ELSE 'VENTA_DIRECTA' END,
           COALESCE(v.tipo_pago, 'EFECTIVO'),
           v.total
      FROM public.venta v
      CROSS JOIN LATERAL (
            SELECT ((v.fecha_emision AT TIME ZONE 'UTC') AT TIME ZONE 'America/La_Paz')::date AS fecha
      ) x
     WHERE v.estado = 'EMITIDA'
       AND x.fecha BETWEEN p_desde AND p_hasta

    UNION ALL
    -- Anticipo de cotización (CU08) SIN recibo en caja: anticipos anteriores
    -- a migracion_cu08_anticipo_caja.sql o tarjeta sin turno abierto.
    -- anticipo_fecha ya está en hora de Bolivia.
    SELECT c.anticipo_fecha::date, 'ANTICIPO_COTIZACION', c.anticipo_metodo, c.anticipo_monto
      FROM public.cotizacion c
     WHERE c.anticipo_monto > 0
       AND c.anticipo_fecha::date BETWEEN p_desde AND p_hasta
       AND NOT EXISTS (SELECT 1 FROM public.venta r
                        WHERE r.cotizacion_id = c.id
                          AND r.tipo_comprobante = 'RECIBO_ANTICIPO'
                          AND r.estado = 'EMITIDA')

    UNION ALL
    -- Saldo cobrado con tarjeta sin caja abierta: no dejó recibo
    SELECT (n.fecha_pago AT TIME ZONE 'America/La_Paz')::date, 'COBRO_ORDEN', 'TARJETA',
           n.monto_total - n.anticipo_pagado
      FROM public.nota_servicio n
     WHERE n.estado = 'PAGADA'
       AND n.metodo_pago = 'TARJETA'
       AND n.fecha_pago IS NOT NULL
       AND n.monto_total > n.anticipo_pagado
       AND (n.fecha_pago AT TIME ZONE 'America/La_Paz')::date BETWEEN p_desde AND p_hasta
       AND NOT EXISTS (SELECT 1 FROM public.venta r
                        WHERE r.orden_trabajo_id = n.orden_trabajo_id
                          AND r.tipo_comprobante = 'RECIBO_SALDO'
                          AND r.estado = 'EMITIDA')

    UNION ALL
    -- Anticipo manual de una orden correctiva (sin cotización), al emitir la nota:
    -- anticipo_pagado = anticipo manual + abonos de caja, por eso se restan los abonos
    SELECT n.fecha_emision, 'ANTICIPO_ORDEN', 'NO REGISTRADO', x.anticipo_manual
      FROM public.nota_servicio n
      JOIN public.orden_trabajo ot ON ot.id = n.orden_trabajo_id AND ot.cotizacion_id IS NULL
      CROSS JOIN LATERAL (
            SELECT n.anticipo_pagado - COALESCE((
                     SELECT SUM(r.total) FROM public.venta r
                      WHERE r.orden_trabajo_id = n.orden_trabajo_id
                        AND r.tipo_comprobante = 'RECIBO_ABONO'
                        AND r.estado = 'EMITIDA'), 0) AS anticipo_manual
      ) x
     WHERE x.anticipo_manual > 0
       AND n.fecha_emision BETWEEN p_desde AND p_hasta;
$$;

-- Agrupación del CU20 (RN3): 'DIA' si el período tiene hasta 31 días, si no 'MES'
CREATE OR REPLACE FUNCTION public.fn_reporte_agrupacion(p_desde DATE, p_hasta DATE)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE WHEN p_hasta - p_desde + 1 <= 31 THEN 'DIA' ELSE 'MES' END;
$$;

-- Etiqueta del período de una fecha: 'YYYY-MM-DD' o 'YYYY-MM'
CREATE OR REPLACE FUNCTION public.fn_reporte_periodo(p_fecha DATE, p_agrupacion TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE WHEN p_agrupacion = 'DIA' THEN to_char(p_fecha, 'YYYY-MM-DD')
                ELSE to_char(p_fecha, 'YYYY-MM') END;
$$;

-- ---------------------------------------------------------------------
-- 3. S2 · Ingresos por período
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_ingresos(p_desde DATE, p_hasta DATE)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH i AS (SELECT * FROM public.fn_reporte_ingresos_detalle(p_desde, p_hasta)),
         g AS (SELECT public.fn_reporte_agrupacion(p_desde, p_hasta) AS agrupacion)
    SELECT jsonb_build_object(
        'agrupacion', g.agrupacion,
        'total',      COALESCE((SELECT ROUND(SUM(monto), 2) FROM i), 0),
        'cantidad',   (SELECT COUNT(*) FROM i),
        'por_metodo', COALESCE((SELECT jsonb_agg(jsonb_build_object('metodo', metodo, 'monto', monto, 'cantidad', cantidad) ORDER BY monto DESC)
                                  FROM (SELECT metodo, ROUND(SUM(monto), 2) AS monto, COUNT(*) AS cantidad
                                          FROM i GROUP BY metodo) m), '[]'::jsonb),
        'por_origen', COALESCE((SELECT jsonb_agg(jsonb_build_object('origen', origen, 'monto', monto, 'cantidad', cantidad) ORDER BY monto DESC)
                                  FROM (SELECT origen, ROUND(SUM(monto), 2) AS monto, COUNT(*) AS cantidad
                                          FROM i GROUP BY origen) o), '[]'::jsonb),
        'serie',      COALESCE((SELECT jsonb_agg(jsonb_build_object('periodo', periodo, 'monto', monto, 'cantidad', cantidad) ORDER BY periodo)
                                  FROM (SELECT public.fn_reporte_periodo(fecha, g.agrupacion) AS periodo,
                                               ROUND(SUM(monto), 2) AS monto, COUNT(*) AS cantidad
                                          FROM i GROUP BY 1) s), '[]'::jsonb)
    )
    FROM g;
$$;

-- ---------------------------------------------------------------------
-- 4. S3 · Servicios más solicitados (cotizaciones APROBADAS del período)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_servicios(p_desde DATE, p_hasta DATE)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'servicio_id', servicio_id, 'servicio', servicio,
               'veces', veces, 'horas_estimadas', horas, 'monto', monto)
               ORDER BY veces DESC, monto DESC), '[]'::jsonb)
      FROM (SELECT s.id AS servicio_id, s.nombre AS servicio,
                   COUNT(DISTINCT d.cotizacion_id) AS veces,
                   ROUND(SUM(d.horas_estimadas), 2) AS horas,
                   ROUND(SUM(d.subtotal), 2) AS monto
              FROM public.detalle_cotizacion_servicio d
              JOIN public.cotizacion c ON c.id = d.cotizacion_id
              JOIN public.servicio s   ON s.id = d.servicio_id
             WHERE c.estado = 'APROBADA'
               AND c.fecha_emision BETWEEN p_desde AND p_hasta
             GROUP BY s.id, s.nombre) t;
$$;

-- ---------------------------------------------------------------------
-- 5. S4 · Rotación de inventario (reemplaza a "Materiales más utilizados")
--    TODOS los productos activos: salidas del período (órdenes + ventas
--    directas), stock, valor en bodega y última salida. La clasificación
--    ALTA / BAJA / SIN_MOVIMIENTO la hace el backend (clasificarRotacion).
--    Fechas de consumo y de venta: UTC -> hora de Bolivia (RN5).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_reporte_materiales(DATE, DATE, INTEGER);

-- Salidas de cada producto con su fecha en hora de Bolivia (base de S4 y S7)
CREATE OR REPLACE FUNCTION public.fn_reporte_salidas(p_hasta DATE)
RETURNS TABLE (producto_id INTEGER, fecha DATE, en_ordenes NUMERIC, en_ventas NUMERIC, ingreso_venta NUMERIC)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT d.producto_id,
           ((d.fecha_registro AT TIME ZONE 'UTC') AT TIME ZONE 'America/La_Paz')::date,
           d.cantidad_utilizada, 0::numeric, 0::numeric
      FROM public.detalle_consumo_material d
     WHERE ((d.fecha_registro AT TIME ZONE 'UTC') AT TIME ZONE 'America/La_Paz')::date <= p_hasta
    UNION ALL
    -- Ingreso de la línea con el descuento de la venta repartido en proporción
    SELECT dv.producto_id,
           ((v.fecha_emision AT TIME ZONE 'UTC') AT TIME ZONE 'America/La_Paz')::date,
           0::numeric, dv.cantidad,
           ROUND(dv.subtotal * CASE WHEN v.subtotal > 0 THEN v.total / v.subtotal ELSE 1 END, 2)
      FROM public.detalle_venta dv
      JOIN public.venta v ON v.id = dv.venta_id
     WHERE v.estado = 'EMITIDA'
       AND dv.producto_id IS NOT NULL
       AND ((v.fecha_emision AT TIME ZONE 'UTC') AT TIME ZONE 'America/La_Paz')::date <= p_hasta;
$$;

CREATE OR REPLACE FUNCTION public.fn_reporte_rotacion(
    p_desde        DATE,
    p_hasta        DATE,
    p_categoria_id INTEGER DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH s AS (SELECT * FROM public.fn_reporte_salidas(p_hasta)),
    t AS (
        SELECT p.id AS producto_id, p.codigo, p.nombre AS producto, cp.nombre AS categoria,
               p.unidad_medida AS unidad,
               COALESCE(SUM(s.en_ordenes) FILTER (WHERE s.fecha >= p_desde), 0) AS en_ordenes,
               COALESCE(SUM(s.en_ventas)  FILTER (WHERE s.fecha >= p_desde), 0) AS en_ventas,
               COALESCE(SUM(s.en_ordenes + s.en_ventas) FILTER (WHERE s.fecha >= p_desde), 0) AS total,
               p.stock_disponible AS stock_actual,
               p.precio_compra_actual AS costo_unitario,
               ROUND(p.stock_disponible * p.precio_compra_actual, 2) AS valor_stock,
               MAX(s.fecha) AS ultima_salida
          FROM public.producto p
          JOIN public.categoria_producto cp ON cp.id = p.categoria_id
          LEFT JOIN s ON s.producto_id = p.id
         WHERE p.estado = TRUE
           AND (p_categoria_id IS NULL OR p.categoria_id = p_categoria_id)
         GROUP BY p.id, p.codigo, p.nombre, cp.nombre, p.unidad_medida,
                  p.stock_disponible, p.precio_compra_actual
    )
    -- Primero los de mayor salida; los sin salida al final, por valor en bodega
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'producto_id', producto_id, 'codigo', codigo, 'producto', producto,
               'categoria', categoria, 'unidad', unidad,
               'en_ordenes', en_ordenes, 'en_ventas', en_ventas, 'total', total,
               'stock_actual', stock_actual, 'costo_unitario', costo_unitario,
               'valor_stock', valor_stock, 'ultima_salida', ultima_salida)
               ORDER BY total DESC, valor_stock DESC, producto), '[]'::jsonb)
      FROM t;
$$;

-- ---------------------------------------------------------------------
-- 5b. S7 · Proveedores y rentabilidad (margen ESTIMADO)
--    Por producto vendido o consumido en el período:
--      ingreso = ventas directas (con descuento repartido)
--              + consumo en órdenes x precio de lista (costo actual x (1 + margen %))
--      costo unitario = promedio ponderado de las compras del período;
--                       sin compras en el período, el último costo del producto
--      margen = ingreso - (cantidad x costo unitario)
--    Proveedor principal del producto = al que más unidades se le compró
--    hasta la fecha hasta (desempate: compra más reciente); sin compras,
--    el proveedor asociado más barato (producto_proveedor).
--    Por proveedor: compras del período + margen de sus productos.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_proveedores(p_desde DATE, p_hasta DATE)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH s AS (
        SELECT producto_id, SUM(en_ventas) AS cant_ventas, SUM(ingreso_venta) AS ingreso_ventas,
               SUM(en_ordenes) AS cant_ordenes
          FROM public.fn_reporte_salidas(p_hasta)
         WHERE fecha >= p_desde
         GROUP BY producto_id
    ),
    compras_periodo AS (
        SELECT dc.producto_id,
               SUM(dc.cantidad) AS cantidad,
               SUM(dc.subtotal) AS monto
          FROM public.detalle_compra dc
          JOIN public.compra c ON c.id = dc.compra_id
         WHERE c.fecha_compra BETWEEN p_desde AND p_hasta
         GROUP BY dc.producto_id
    ),
    principal AS (
        SELECT DISTINCT ON (x.producto_id) x.producto_id, x.proveedor_id
          FROM (
                SELECT dc.producto_id, c.proveedor_id, SUM(dc.cantidad) AS unidades,
                       MAX(c.fecha_compra) AS ultima, 1 AS prioridad
                  FROM public.detalle_compra dc
                  JOIN public.compra c ON c.id = dc.compra_id
                 WHERE c.fecha_compra <= p_hasta
                 GROUP BY dc.producto_id, c.proveedor_id
                UNION ALL
                SELECT pp.producto_id, pp.proveedor_id, 0, NULL, 2
                  FROM public.producto_proveedor pp
               ) x
         ORDER BY x.producto_id, x.prioridad, x.unidades DESC, x.ultima DESC NULLS LAST, x.proveedor_id
    ),
    prod AS (
        SELECT p.id AS producto_id, p.nombre AS producto, p.unidad_medida AS unidad,
               s.cant_ventas + s.cant_ordenes AS cantidad,
               ROUND(s.ingreso_ventas
                     + s.cant_ordenes * p.precio_compra_actual * (1 + COALESCE(p.margen_ganancia, 0) / 100), 2) AS ingreso,
               CASE WHEN cp.cantidad > 0 THEN ROUND(cp.monto / cp.cantidad, 2)
                    ELSE p.precio_compra_actual END AS costo_unitario,
               CASE WHEN cp.cantidad > 0 THEN 'COMPRAS_PERIODO' ELSE 'ULTIMO_COSTO' END AS origen_costo,
               pr.proveedor_id
          FROM s
          JOIN public.producto p ON p.id = s.producto_id
          LEFT JOIN compras_periodo cp ON cp.producto_id = p.id
          LEFT JOIN principal pr       ON pr.producto_id = p.id
         WHERE s.cant_ventas + s.cant_ordenes > 0
    ),
    prod2 AS (
        SELECT prod.*, ROUND(cantidad * costo_unitario, 2) AS costo,
               ROUND(ingreso - cantidad * costo_unitario, 2) AS margen,
               COALESCE(pv.razon_social, 'Sin proveedor registrado') AS proveedor
          FROM prod
          LEFT JOIN public.proveedor pv ON pv.id = prod.proveedor_id
    ),
    compras_prov AS (
        SELECT c.proveedor_id, COUNT(DISTINCT c.id) AS compras, SUM(c.total) AS monto_comprado,
               (SELECT COUNT(DISTINCT dc.producto_id) FROM public.detalle_compra dc
                  JOIN public.compra c2 ON c2.id = dc.compra_id
                 WHERE c2.proveedor_id = c.proveedor_id
                   AND c2.fecha_compra BETWEEN p_desde AND p_hasta) AS productos_comprados
          FROM public.compra c
         WHERE c.fecha_compra BETWEEN p_desde AND p_hasta
         GROUP BY c.proveedor_id
    ),
    margen_prov AS (
        SELECT proveedor_id, SUM(ingreso) AS ingreso, SUM(costo) AS costo, SUM(margen) AS margen,
               COUNT(*) AS productos_vendidos
          FROM prod2 GROUP BY proveedor_id
    ),
    prov AS (
        SELECT COALESCE(cp.proveedor_id, mp.proveedor_id) AS proveedor_id,
               COALESCE(cp.compras, 0) AS compras,
               COALESCE(cp.monto_comprado, 0) AS monto_comprado,
               COALESCE(cp.productos_comprados, 0) AS productos_comprados,
               COALESCE(mp.productos_vendidos, 0) AS productos_vendidos,
               COALESCE(mp.ingreso, 0) AS ingreso,
               COALESCE(mp.costo, 0) AS costo,
               COALESCE(mp.margen, 0) AS margen
          FROM compras_prov cp
          FULL JOIN margen_prov mp ON COALESCE(mp.proveedor_id, -1) = COALESCE(cp.proveedor_id, -1)
    )
    SELECT jsonb_build_object(
        'proveedores', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'proveedor_id', prov.proveedor_id,
                       'proveedor', COALESCE(pv.razon_social, 'Sin proveedor registrado'),
                       'compras', prov.compras, 'monto_comprado', prov.monto_comprado,
                       'productos_comprados', prov.productos_comprados,
                       'productos_vendidos', prov.productos_vendidos,
                       'ingreso', prov.ingreso, 'costo', prov.costo, 'margen', prov.margen)
                       ORDER BY prov.margen DESC, prov.monto_comprado DESC, pv.razon_social)
              FROM prov LEFT JOIN public.proveedor pv ON pv.id = prov.proveedor_id), '[]'::jsonb),
        'productos', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                       'producto_id', producto_id, 'producto', producto, 'unidad', unidad,
                       'proveedor_id', proveedor_id, 'proveedor', proveedor,
                       'cantidad', cantidad, 'ingreso', ingreso, 'costo_unitario', costo_unitario,
                       'origen_costo', origen_costo, 'costo', costo, 'margen', margen)
                       ORDER BY margen DESC, producto)
              FROM prod2), '[]'::jsonb)
    );
$$;

-- ---------------------------------------------------------------------
-- 6. S5 · Inventario crítico (estado actual: sin período; solo productos con stock mínimo > 0)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_inventario_critico(p_categoria_id INTEGER DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'producto_id', p.id, 'codigo', p.codigo, 'producto', p.nombre,
               'categoria', cp.nombre, 'unidad', p.unidad_medida,
               'stock_actual', p.stock_disponible, 'stock_minimo', p.stock_minimo,
               'faltante', p.stock_minimo - p.stock_disponible)
               ORDER BY (p.stock_minimo - p.stock_disponible) DESC, p.nombre), '[]'::jsonb)
      FROM public.producto p
      JOIN public.categoria_producto cp ON cp.id = p.categoria_id
     WHERE p.estado = TRUE
       AND p.stock_minimo > 0                    -- sin mínimo definido no hay umbral que alertar
       AND p.stock_disponible <= p.stock_minimo
       AND (p_categoria_id IS NULL OR p.categoria_id = p_categoria_id);
$$;

-- ---------------------------------------------------------------------
-- 7. S6 · Rendimiento por técnico (órdenes FINALIZADAS en el período)
--    Horas programadas = fin programado - inicio programado
--    Horas reales      = fin real - inicio real
--    El porcentaje de cumplimiento lo calcula el backend (calcularEficiencia).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_rendimiento(
    p_desde      DATE,
    p_hasta      DATE,
    p_tecnico_id INTEGER DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'tecnico_id', tecnico_id, 'tecnico', tecnico,
               'ordenes_finalizadas', ordenes, 'ordenes_a_tiempo', a_tiempo,
               'horas_programadas', horas_programadas, 'horas_reales', horas_reales)
               ORDER BY ordenes DESC, tecnico), '[]'::jsonb)
      FROM (SELECT u.id AS tecnico_id, u.nombre AS tecnico,
                   COUNT(*) AS ordenes,
                   COUNT(*) FILTER (WHERE ot.fecha_fin_programada IS NOT NULL
                                      AND ot.fecha_fin_real <= ot.fecha_fin_programada) AS a_tiempo,
                   ROUND(SUM(COALESCE(EXTRACT(EPOCH FROM (ot.fecha_fin_programada - ot.fecha_inicio_programada)), 0)) / 3600, 2) AS horas_programadas,
                   ROUND(SUM(COALESCE(EXTRACT(EPOCH FROM (ot.fecha_fin_real - ot.fecha_inicio_real)), 0)) / 3600, 2) AS horas_reales
              FROM public.orden_trabajo_tecnico ott
              JOIN public.orden_trabajo ot ON ot.id = ott.orden_trabajo_id
              JOIN public.usuario u        ON u.id = ott.usuario_id
             WHERE ot.estado = 'FINALIZADA'
               AND ot.fecha_fin_real::date BETWEEN p_desde AND p_hasta
               AND (p_tecnico_id IS NULL OR u.id = p_tecnico_id)
             GROUP BY u.id, u.nombre) t;
$$;

-- ---------------------------------------------------------------------
-- 8. S1 · Resumen general del período
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reporte_resumen_general(p_desde DATE, p_hasta DATE)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH g AS (SELECT public.fn_reporte_agrupacion(p_desde, p_hasta) AS agrupacion),
         i AS (SELECT fecha, monto FROM public.fn_reporte_ingresos_detalle(p_desde, p_hasta)),
         c AS (SELECT fecha_compra AS fecha, total AS monto FROM public.compra
                WHERE fecha_compra BETWEEN p_desde AND p_hasta),
         periodos AS (
               SELECT public.fn_reporte_periodo(fecha, g.agrupacion) AS periodo, monto AS ingreso, 0::numeric AS compra FROM i, g
               UNION ALL
               SELECT public.fn_reporte_periodo(fecha, g.agrupacion), 0, monto FROM c, g)
    SELECT jsonb_build_object(
        'agrupacion',          g.agrupacion,
        'total_ingresos',      COALESCE((SELECT ROUND(SUM(monto), 2) FROM i), 0),
        'total_compras',       COALESCE((SELECT ROUND(SUM(monto), 2) FROM c), 0),
        'ordenes_finalizadas', (SELECT COUNT(*) FROM public.orden_trabajo ot
                                 WHERE ot.estado = 'FINALIZADA'
                                   AND ot.fecha_fin_real::date BETWEEN p_desde AND p_hasta),
        'productos_criticos',  jsonb_array_length(public.fn_reporte_inventario_critico(NULL)),
        'top_servicios',       (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
                                  FROM (SELECT e FROM jsonb_array_elements(public.fn_reporte_servicios(p_desde, p_hasta)) e LIMIT 5) x),
        'top_materiales',      (SELECT COALESCE(jsonb_agg(e), '[]'::jsonb)
                                  FROM (SELECT e FROM jsonb_array_elements(public.fn_reporte_rotacion(p_desde, p_hasta, NULL)) e
                                         WHERE (e->>'total')::numeric > 0 LIMIT 5) x),
        'rendimiento',         public.fn_reporte_rendimiento(p_desde, p_hasta, NULL),
        'serie',               COALESCE((SELECT jsonb_agg(jsonb_build_object('periodo', periodo, 'ingresos', ingresos, 'compras', compras) ORDER BY periodo)
                                           FROM (SELECT periodo, ROUND(SUM(ingreso), 2) AS ingresos, ROUND(SUM(compra), 2) AS compras
                                                   FROM periodos GROUP BY periodo) s), '[]'::jsonb)
    )
    FROM g;
$$;

-- Solo el backend (service_role) llama a estas funciones.
REVOKE ALL ON FUNCTION public.fn_reporte_ingresos_detalle(DATE, DATE)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reporte_ingresos(DATE, DATE)                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reporte_servicios(DATE, DATE)                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reporte_salidas(DATE)                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reporte_rotacion(DATE, DATE, INTEGER)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reporte_proveedores(DATE, DATE)              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reporte_inventario_critico(INTEGER)           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reporte_rendimiento(DATE, DATE, INTEGER)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_reporte_resumen_general(DATE, DATE)           FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reporte_ingresos_detalle(DATE, DATE)       TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_ingresos(DATE, DATE)               TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_servicios(DATE, DATE)              TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_salidas(DATE)                     TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_rotacion(DATE, DATE, INTEGER)     TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_proveedores(DATE, DATE)           TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_inventario_critico(INTEGER)        TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_rendimiento(DATE, DATE, INTEGER)   TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_reporte_resumen_general(DATE, DATE)        TO service_role;

COMMIT;
