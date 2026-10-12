import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'
import type { Db } from '@/lib/supabase/types'

/**
 * Extensión LOCAL de los tipos de la BD para CU16.
 *
 * `database.types.ts` (archivo compartido) todavía no incluye las columnas ni
 * las funciones que agrega `migracion_cu16_inventario.sql`. Hasta que se
 * apruebe actualizarlo, este módulo describe SOLO lo que CU16 necesita:
 *   - PRODUCTO          + codigo, estado
 *   - MOVIMIENTO_KARDEX + motivo, stock_resultante, documento, compra_id
 *   - RPC               fn_registrar_ajuste, fn_registrar_inventario_inicial
 * Cuando database.types.ts se actualice, este archivo se elimina y `comoDbCU16`
 * deja de ser necesario.
 */

type Publico = Database['public']
type Tablas = Publico['Tables']

type ColumnasProductoCU16 = { codigo: string | null; estado: boolean }
type ColumnasKardexCU16 = {
  motivo: string | null
  stock_resultante: string | null
  documento: string | null
  compra_id: number | null
}

type ProductoCU16 = {
  Row: Tablas['producto']['Row'] & ColumnasProductoCU16
  Insert: Tablas['producto']['Insert'] & Partial<ColumnasProductoCU16>
  Update: Tablas['producto']['Update'] & Partial<ColumnasProductoCU16>
  Relationships: Tablas['producto']['Relationships']
}

type MovimientoKardexCU16 = {
  Row: Tablas['movimiento_kardex']['Row'] & ColumnasKardexCU16
  Insert: Tablas['movimiento_kardex']['Insert'] & Partial<ColumnasKardexCU16>
  Update: Tablas['movimiento_kardex']['Update'] & Partial<ColumnasKardexCU16>
  Relationships: Tablas['movimiento_kardex']['Relationships']
}

type FuncionesCU16 = {
  fn_registrar_ajuste: {
    Args: {
      p_usuario_id: number
      p_producto_id: number
      p_stock_contado: number
      p_justificacion: string
      p_ip?: string | null
    }
    Returns: Json
  }
  fn_registrar_inventario_inicial: {
    Args: {
      p_usuario_id: number
      p_producto_id: number
      p_cantidad: number
      p_observacion?: string | null
      p_ip?: string | null
    }
    Returns: Json
  }
}

export type DatabaseCU16 = {
  public: Omit<Publico, 'Tables' | 'Functions'> & {
    Tables: Omit<Tablas, 'producto' | 'movimiento_kardex'> & {
      producto: ProductoCU16
      movimiento_kardex: MovimientoKardexCU16
    }
    Functions: FuncionesCU16
  }
}

export type DbCU16 = SupabaseClient<DatabaseCU16>

/** Mismo cliente service role, visto con los tipos de CU16 (solo cambia el tipo). */
export function comoDbCU16(db: Db): DbCU16 {
  return db as unknown as DbCU16
}
