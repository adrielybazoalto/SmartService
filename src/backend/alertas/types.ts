/** CU19 — Tipos de Alertas Preventivas. */

/** Urgencia calculada SIEMPRE con la fecha real de SISTEMA_INSTALADO. */
export type UrgenciaAlerta = 'VENCIDO' | 'PROXIMO' | 'VIGENTE' | 'SIN_FECHA'

/** Alerta con los datos relacionados que muestra el panel (CU19 2.3). */
export interface AlertaPreventiva {
  id: number
  mensaje: string
  /** Fecha de generación de la alerta (TIMESTAMP de Bolivia). */
  fecha_alerta: string
  leido: boolean
  urgencia: UrgenciaAlerta
  /** Días hasta el próximo mantenimiento; negativo = vencido; null = sin fecha. */
  dias_restantes: number | null
  sistema: {
    id: number
    nombre: string
    numero_serie: string | null
    periodicidad_meses: number
    fecha_ultimo_mantenimiento: string | null
    fecha_proximo_mantenimiento: string | null
  }
  establecimiento: { id: number; nombre: string }
  cliente: { id: number; nombre: string }
}

/** Resultado de la evaluación diaria (fn_generar_alertas_preventivas). */
export interface ResultadoGeneracionAlertas {
  /** Sistemas con próximo mantenimiento dentro del umbral. */
  evaluadas: number
  /** Alertas nuevas insertadas en esta ejecución. */
  creadas: number
  umbral_dias: number
  /** Fecha de evaluación en Bolivia (AAAA-MM-DD). */
  fecha_evaluacion: string
}
