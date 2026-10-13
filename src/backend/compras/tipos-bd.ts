import type { SupabaseClient } from '@supabase/supabase-js'
import type { Json } from '@/lib/supabase/database.types'
import type { Db } from '@/lib/supabase/types'
import type { DatabaseCU16 } from '@/backend/inventario/tipos-bd'

/**
 * Extensión LOCAL de los tipos de la BD para CU15 (mismo criterio que CU16).
 *
 * `database.types.ts` (archivo compartido) todavía no incluye lo que agrega
 * `migracion_cu15_compras.sql`. Se parte de la extensión de CU16 (producto con
 * codigo/estado, kárdex con motivo/stock_resultante/documento/compra_id) y se
 * agrega SOLO lo que CU15 necesita:
 *   - PROVEEDOR          + estado
 *   - PRODUCTO_PROVEEDOR + fecha_actualizacion
 *   - COMPRA, DETALLE_COMPRA (solo lectura desde la app)
 *   - RPC                fn_registrar_compra
 * Cuando database.types.ts se actualice, este archivo se elimina.
 */

type PublicoCU16 = DatabaseCU16['public']
type TablasCU16 = PublicoCU16['Tables']

type ProveedorCU15 = {
  Row: TablasCU16['proveedor']['Row'] & { estado: boolean }
  Insert: TablasCU16['proveedor']['Insert'] & { estado?: boolean }
  Update: TablasCU16['proveedor']['Update'] & { estado?: boolean }
  Relationships: TablasCU16['proveedor']['Relationships']
}

type ProductoProveedorCU15 = {
  Row: TablasCU16['producto_proveedor']['Row'] & { fecha_actualizacion: string }
  Insert: TablasCU16['producto_proveedor']['Insert'] & { fecha_actualizacion?: string }
  Update: TablasCU16['producto_proveedor']['Update'] & { fecha_actualizacion?: string }
  Relationships: TablasCU16['producto_proveedor']['Relationships']
}

type FilaCompra = {
  id: number
  proveedor_id: number
  usuario_id: number
  tipo_documento: string
  nro_documento: string
  nro_documento_normalizado: string
  fecha_compra: string
  total: string
  observacion: string | null
  fecha_registro: string
}

type FilaDetalleCompra = {
  id: number
  compra_id: number
  producto_id: number
  cantidad: string
  costo_unitario: string
  subtotal: string
}

/** Solo lectura: la escritura es exclusiva de fn_registrar_compra (service_role solo tiene SELECT). */
type CompraCU15 = {
  Row: FilaCompra
  Insert: Record<string, never>
  Update: Record<string, never>
  Relationships: [
    {
      foreignKeyName: 'fk_compra_proveedor'
      columns: ['proveedor_id']
      isOneToOne: false
      referencedRelation: 'proveedor'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'fk_compra_usuario'
      columns: ['usuario_id']
      isOneToOne: false
      referencedRelation: 'usuario'
      referencedColumns: ['id']
    },
  ]
}

type DetalleCompraCU15 = {
  Row: FilaDetalleCompra
  Insert: Record<string, never>
  Update: Record<string, never>
  Relationships: [
    {
      foreignKeyName: 'fk_detalle_compra_compra'
      columns: ['compra_id']
      isOneToOne: false
      referencedRelation: 'compra'
      referencedColumns: ['id']
    },
    {
      foreignKeyName: 'fk_detalle_compra_producto'
      columns: ['producto_id']
      isOneToOne: false
      referencedRelation: 'producto'
      referencedColumns: ['id']
    },
  ]
}

type FuncionesCU15 = PublicoCU16['Functions'] & {
  fn_registrar_compra: {
    Args: {
      p_usuario_id: number
      p_proveedor_id: number
      p_tipo_documento: string
      p_nro_documento: string
      p_fecha_compra: string
      p_items: Json
      p_observacion?: string | null
      p_ip?: string | null
    }
    Returns: Json
  }
}

export type DatabaseCU15 = {
  public: Omit<PublicoCU16, 'Tables' | 'Functions'> & {
    Tables: Omit<TablasCU16, 'proveedor' | 'producto_proveedor'> & {
      proveedor: ProveedorCU15
      producto_proveedor: ProductoProveedorCU15
      compra: CompraCU15
      detalle_compra: DetalleCompraCU15
    }
    Functions: FuncionesCU15
  }
}

export type DbCU15 = SupabaseClient<DatabaseCU15>

/** Mismo cliente service role, visto con los tipos de CU15 (solo cambia el tipo). */
export function comoDbCU15(db: Db): DbCU15 {
  return db as unknown as DbCU15
}
