-- =====================================================================
--  SmartService - CU13 Borrar la nota de prueba NS-2026-002 (OT-2026-006)
--  Capa de datos (PostgreSQL / Supabase)
--
--  Ejecutar en Supabase: SQL Editor > New query > pegar > Run.
--  Ejecutar DESPUÉS de migracion_cu12_correccion_horas.sql.
--
--  La nota se emitió con 4,03 h por el error de zona horaria y ya está PAGADA
--  (Stripe en modo de prueba). Se borra para volver a emitirla con las horas
--  correctas. Es idempotente: solo actúa si la nota sigue con esos datos. La
--  bitácora no se modifica: conserva lo ocurrido y suma el registro del borrado.
-- =====================================================================

BEGIN;

WITH borrada AS (
    DELETE FROM public.nota_servicio
     WHERE id = 2
       AND orden_trabajo_id = 10
       AND numero_nota = 'NS-2026-002'
       AND estado = 'PAGADA'
       AND monto_total = 438.10
       AND stripe_session_id LIKE 'cs_test_%'
    RETURNING numero_nota, monto_total, anticipo_pagado, stripe_session_id
)
INSERT INTO public.bitacora (usuario_id, accion, descripcion)
SELECT 1,
       'ELIMINAR_NOTA_SERVICIO_PRUEBA',
       'Nota de prueba ' || numero_nota || ' de OT-2026-006 borrada por monto incorrecto (error de zona horaria)'
           || ' | total: ' || monto_total || ' | anticipo: ' || anticipo_pagado
           || ' | pago Stripe de prueba: ' || stripe_session_id
  FROM borrada;

COMMIT;

-- Verificación (ejecutar aparte): 0 notas para la orden 10 y 1 fila en bitácora
-- SELECT count(*) FROM public.nota_servicio WHERE orden_trabajo_id = 10;
-- SELECT id, accion, descripcion FROM public.bitacora WHERE accion = 'ELIMINAR_NOTA_SERVICIO_PRUEBA';
