import { timingSafeEqual } from 'node:crypto'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import type { Db } from '@/lib/supabase/types'
import { generarAlertasPreventivas, umbralDias } from '@/backend/alertas'

/**
 * CU19 — Evaluación diaria de Alertas Preventivas.
 *
 * GET /api/cron/alertas
 *
 * Protección: `Authorization: Bearer <CRON_SECRET>`. Sin cabecera, con un
 * secreto distinto o sin CRON_SECRET configurado responde 401.
 *
 * Programación (ver `vercel.json`): una vez al día, `0 10 * * *` UTC
 * (06:00 en Bolivia). El cron de Vercel SOLO se ejecuta en el despliegue de
 * producción; en local se dispara a mano:
 *
 *   curl -H "Authorization: Bearer TU_CRON_SECRET" http://localhost:3000/api/cron/alertas
 *
 * En Vercel basta con definir CRON_SECRET (y opcionalmente ALERTAS_UMBRAL_DIAS)
 * en Settings → Environment Variables: el cron envía la cabecera solo.
 *
 * No usa sesión, dashboard ni Server Actions: puede ejecutarse sin nadie
 * conectado. La inserción es idempotente (RPC fn_generar_alertas_preventivas).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function autorizado(request: Request): boolean {
  const secreto = process.env.CRON_SECRET
  if (!secreto) {
    console.error('[CU19] CRON_SECRET no está configurado: se rechaza la ejecución.')
    return false
  }

  const cabecera = request.headers.get('authorization') ?? ''
  const prefijo = 'Bearer '
  if (!cabecera.startsWith(prefijo)) return false

  const recibido = Buffer.from(cabecera.slice(prefijo.length), 'utf8')
  const esperado = Buffer.from(secreto, 'utf8')
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}

export async function GET(request: Request) {
  if (!autorizado(request)) {
    return Response.json({ ok: false, error: 'No autorizado' }, { status: 401 })
  }

  try {
    const db = getSupabaseServiceClient() as unknown as Db
    const resultado = await generarAlertasPreventivas(db, umbralDias())
    console.info(
      `[CU19] Evaluación diaria: ${resultado.evaluadas} sistema(s) dentro del umbral, ` +
        `${resultado.creadas} alerta(s) nueva(s) (umbral ${resultado.umbral_dias} días).`,
    )
    return Response.json({ ok: true, ...resultado })
  } catch (e) {
    console.error('[CU19] Error en la evaluación diaria de alertas:', e)
    const error = e instanceof Error ? e.message : 'Error al generar las alertas preventivas'
    return Response.json({ ok: false, error }, { status: 500 })
  }
}
