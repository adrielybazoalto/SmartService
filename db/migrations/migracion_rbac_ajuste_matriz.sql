-- =====================================================================
--  SmartService - Ajuste de la matriz de permisos (Fase 3)
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Es idempotente. Sin tablas nuevas.
--
--  - CU06 Bitácora y CU17 Servicios: solo ADMINISTRADOR.
--  - CU10: clave propia PERSONAL_TECNICO (Administrador y Encargado).
--
--  Va junto con src/lib/navigation.ts. Aplicar el SQL ANTES de usar ese código:
--  solo con el SQL, el CU10 sigue protegido por ORDENES_TRABAJO; solo con el
--  código, nadie entra al CU10.
-- =====================================================================

BEGIN;

-- CU06 y CU17: solo ADMINISTRADOR
DELETE FROM rol_funcion rf USING rol r, funcion f
 WHERE rf.rol_id = r.id AND rf.funcion_id = f.id
   AND r.nombre = 'ENCARGADO' AND f.clave IN ('BITACORA', 'SERVICIOS');

-- CU10 con clave propia
UPDATE funcion SET clave = 'PERSONAL_TECNICO', ruta = '/personal-tecnico'
 WHERE nombre = 'Jornadas y Bloqueos' AND clave IS NULL;

INSERT INTO rol_funcion (rol_id, funcion_id, accion_id, descripcion)
SELECT r.id, f.id, a.id, 'Jornadas y bloqueos (CU10)'
  FROM rol r, funcion f, accion a
 WHERE r.nombre IN ('ADMINISTRADOR', 'ENCARGADO')
   AND f.clave = 'PERSONAL_TECNICO'
   AND a.nombre IN ('LEER', 'CREAR', 'ACTUALIZAR', 'ELIMINAR')
ON CONFLICT (rol_id, funcion_id, accion_id) DO NOTHING;

COMMIT;

-- Verificación (ejecutar aparte): módulos a los que entra cada rol.
-- ENCARGADO no debe tener BITACORA, ROLES, SERVICIOS ni USUARIOS.
-- TECNICO solo COTIZACIONES, ORDENES_TRABAJO y PERFIL.
-- SELECT r.nombre, string_agg(f.clave, ', ' ORDER BY f.clave) AS modulos
--   FROM rol_funcion rf
--   JOIN rol r ON r.id = rf.rol_id
--   JOIN funcion f ON f.id = rf.funcion_id
--   JOIN accion a ON a.id = rf.accion_id
--  WHERE a.nombre = 'LEER' AND f.clave IS NOT NULL
--  GROUP BY r.nombre ORDER BY r.nombre;
