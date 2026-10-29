import type { Tables, TablesInsert, TablesUpdate } from '@/lib/supabase/types'

export type CargaHoraria = Tables<'carga_horaria_tecnico'>
export type CargaHorariaInsert = TablesInsert<'carga_horaria_tecnico'>
export type CargaHorariaUpdate = TablesUpdate<'carga_horaria_tecnico'>

export type BloqueoTecnico = Tables<'bloqueo_tecnico'>
export type BloqueoTecnicoInsert = TablesInsert<'bloqueo_tecnico'>
export type BloqueoTecnicoUpdate = TablesUpdate<'bloqueo_tecnico'>

export interface TecnicoResumen {
  id: number
  nombre: string
  correo: string
  estado?: boolean
  rol_id?: number
  jornada: string
  jornadaData: {
    id?: number
    dia_semana: string
    hora_inicio: string
    hora_fin: string
    activo: boolean
  } | null
  bloqueado: boolean
  detalleBloqueo: string
  bloqueoActivo?: BloqueoTecnico | null
}
