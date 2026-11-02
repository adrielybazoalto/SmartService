import type { Tables } from '@/lib/supabase/types'

export const ROL_TECNICO = 'TECNICO'
export {
  ESTADO_CANCELADA,
  ESTADO_FINALIZADA,
  ESTADO_PROGRAMADA,
  ESTADOS_NO_ACTIVOS,
} from '@/backend/ordenes/estados'

export type OrdenTrabajo = Tables<'orden_trabajo'>

export type OrdenAsignable = Pick<
  OrdenTrabajo,
  'id' | 'codigo_orden' | 'tipo_trabajo' | 'estado' | 'fecha_inicio_programada' | 'fecha_fin_programada'
>

export interface TecnicoBase {
  id: number
  nombre: string
  telefono: string | null
}

export interface TecnicoDisponible extends TecnicoBase {
  disponible: boolean
  /** Razones por las que NO está disponible (vacío si lo está). */
  motivos: string[]
  /** Ya pertenece a la cuadrilla actual de la orden. */
  asignado: boolean
  esLider: boolean
}

export interface CuadrillaMiembro {
  usuario_id: number
  nombre: string
  telefono: string | null
  esLider: boolean
}

export interface OrdenConTecnicos {
  orden: OrdenAsignable
  ventanaDefinida: boolean
  /** Solo se asigna/modifica mientras la orden esté PROGRAMADA. */
  modificable: boolean
  tieneCuadrilla: boolean
  tecnicos: TecnicoDisponible[]
  /** Cuadrilla actual (para la consulta en solo lectura, en cualquier estado de la orden). */
  cuadrilla: CuadrillaMiembro[]
}

export interface OrdenListada {
  orden: OrdenAsignable
  totalTecnicos: number
  liderNombre: string | null
}

export interface ResultadoGuardarCuadrilla {
  orden: OrdenAsignable
  nombres: string[]
  liderNombre: string
  anteriores: string[]
}
