-- =====================================================================
--  SmartService - CU18 Datos de PRUEBA: sistemas instalados
--
--  3 clientes, 4 establecimientos y 5 sistemas instalados (cámaras, alarma,
--  cerco eléctrico, control de acceso) para probar los tickets de soporte y
--  el dictado por voz. Son datos ficticios.
--
--  Idempotente: los clientes se identifican por documento_identidad
--  (PRUEBA-CU18-*), los establecimientos por cliente + nombre y los sistemas
--  por numero_serie (PRUEBA-CU18-*). Se puede ejecutar más de una vez.
--
--  NO es una migración: ejecutar solo en el entorno de pruebas.
--  Para quitarlos, ver el bloque comentado al final.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
INSERT INTO public.cliente (nombre, tipo_cliente, razon_social, documento_identidad, correo, telefono, estado)
VALUES
    ('Hotel Las Palmeras',  'JURIDICO', 'Las Palmeras Hotelería S.R.L.', 'PRUEBA-CU18-001', 'soporte@laspalmeras.test', '70000001', TRUE),
    ('Farmacia Central',    'JURIDICO', 'Farmacia Central Ltda.',        'PRUEBA-CU18-002', 'sistemas@farmaciacentral.test', '70000002', TRUE),
    ('Juan Carlos Rojas',   'NATURAL',  NULL,                            'PRUEBA-CU18-003', 'jc.rojas@correo.test', '70000003', TRUE)
ON CONFLICT (documento_identidad) DO NOTHING;

-- ---------------------------------------------------------------------
-- Establecimientos
-- ---------------------------------------------------------------------
INSERT INTO public.establecimiento (cliente_id, nombre_establecimiento, direccion, tipo_inmueble, estado)
SELECT c.id, e.nombre, e.direccion, e.tipo, TRUE
  FROM (VALUES
        ('PRUEBA-CU18-001', 'Edificio principal',     'Av. Principal 100',     'HOTEL'),
        ('PRUEBA-CU18-001', 'Oficinas administrativas', 'Calle Comercio 25',   'OFICINA'),
        ('PRUEBA-CU18-002', 'Sucursal Norte',         'Av. Norte 450',         'LOCAL COMERCIAL'),
        ('PRUEBA-CU18-003', 'Domicilio',              'Condominio Los Pinos 8', 'VIVIENDA')
       ) AS e(doc, nombre, direccion, tipo)
  JOIN public.cliente c ON c.documento_identidad = e.doc
 WHERE NOT EXISTS (
        SELECT 1 FROM public.establecimiento x
         WHERE x.cliente_id = c.id AND x.nombre_establecimiento = e.nombre);

-- ---------------------------------------------------------------------
-- Sistemas instalados
-- ---------------------------------------------------------------------
INSERT INTO public.sistema_instalado (
    establecimiento_id, nombre_sistema, fecha_instalacion, numero_serie, periodicidad_meses,
    fecha_ultimo_mantenimiento, fecha_proximo_mantenimiento, observaciones)
SELECT est.id, s.nombre, s.instalado::DATE, s.serie, s.periodicidad,
       s.ultimo::DATE, (s.ultimo::DATE + make_interval(months => s.periodicidad))::DATE, s.obs
  FROM (VALUES
        ('PRUEBA-CU18-001', 'Edificio principal',       'Cámaras de seguridad CCTV',    'PRUEBA-CU18-S01', 6,  '2025-03-10', '2026-05-10', '16 cámaras IP y NVR en el lobby y parqueo'),
        ('PRUEBA-CU18-001', 'Oficinas administrativas', 'Control de acceso biométrico', 'PRUEBA-CU18-S02', 12, '2025-08-01', '2025-08-01', 'Lector de huella y cerradura magnética'),
        ('PRUEBA-CU18-002', 'Sucursal Norte',           'Alarma contra intrusión',      'PRUEBA-CU18-S03', 6,  '2024-11-20', '2026-06-15', 'Panel de 8 zonas con sirena exterior'),
        ('PRUEBA-CU18-002', 'Sucursal Norte',           'Cámaras IP de mostrador',      'PRUEBA-CU18-S04', 6,  '2025-01-15', '2026-04-20', '4 cámaras domo'),
        ('PRUEBA-CU18-003', 'Domicilio',                'Cerco eléctrico perimetral',   'PRUEBA-CU18-S05', 6,  '2025-06-05', '2026-03-05', '120 m lineales, energizador de 8 J')
       ) AS s(doc, establecimiento, nombre, serie, periodicidad, instalado, ultimo, obs)
  JOIN public.cliente c ON c.documento_identidad = s.doc
  JOIN public.establecimiento est ON est.cliente_id = c.id AND est.nombre_establecimiento = s.establecimiento
 WHERE NOT EXISTS (SELECT 1 FROM public.sistema_instalado x WHERE x.numero_serie = s.serie);

COMMIT;

-- Verificación (ejecutar aparte): 5 filas
-- SELECT c.nombre, e.nombre_establecimiento, s.nombre_sistema, s.numero_serie
--   FROM sistema_instalado s
--   JOIN establecimiento e ON e.id = s.establecimiento_id
--   JOIN cliente c ON c.id = e.cliente_id
--  WHERE s.numero_serie LIKE 'PRUEBA-CU18-%' ORDER BY s.numero_serie;

-- Quitar los datos de prueba: el CASCADE borra establecimientos, sistemas y
-- tickets; las OT derivadas quedan con mantenimiento_ticket_id = NULL.
-- DELETE FROM cliente WHERE documento_identidad LIKE 'PRUEBA-CU18-%';
