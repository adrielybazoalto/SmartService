import type { Db } from '@/lib/supabase/types'
import { traducirErrorBD, ErrorInventario } from './errores'
import {
  registrarAjusteSchema,
  registrarInventarioInicialSchema,
  resultadoMovimientoBDSchema,
  type RegistrarAjusteInput,
  type RegistrarInventarioInicialInput,
} from './schema'
import { comoDbCU16 } from './tipos-bd'
import type { ResultadoMovimientoDTO } from './types'

/**
 * ControlKardex (CU16) — ÚNICA vía del backend para modificar existencias.
 *
 * No calcula ni escribe stock: delega en las funciones transaccionales de la
 * BD (migracion_cu16_inventario.sql), que bloquean el producto, calculan stock
 * anterior/resultante, insertan el movimiento y registran la bitácora en una
 * sola transacción vía private.fn_kardex_aplicar. La BD vuelve a verificar el
 * permiso (ROL_FUNCION) y el estado del usuario.
 *
 * `usuarioId` debe provenir SIEMPRE de la sesión validada en el servidor.
 */
export class ControlKardex {
  /** Ajuste por conteo físico: AJUSTE_POSITIVO / AJUSTE_NEGATIVO según la diferencia. */
  static async registrarAjuste(
    db: Db,
    usuarioId: number,
    input: RegistrarAjusteInput,
    ip: string | null = null,
  ): Promise<ResultadoMovimientoDTO> {
    const datos = registrarAjusteSchema.parse(input)
    const { data, error } = await comoDbCU16(db).rpc('fn_registrar_ajuste', {
      p_usuario_id: usuarioId,
      p_producto_id: datos.producto_id,
      p_stock_contado: datos.stock_contado,
      p_justificacion: datos.justificacion,
      p_ip: ip,
    })
    if (error) throw traducirErrorBD(error, 'No se pudo registrar el ajuste')
    return ControlKardex.aResultado(data, 'No se pudo registrar el ajuste')
  }

  /** Inventario inicial: solo productos sin movimientos y con stock 0. */
  static async registrarInventarioInicial(
    db: Db,
    usuarioId: number,
    input: RegistrarInventarioInicialInput,
    ip: string | null = null,
  ): Promise<ResultadoMovimientoDTO> {
    const datos = registrarInventarioInicialSchema.parse(input)
    const { data, error } = await comoDbCU16(db).rpc('fn_registrar_inventario_inicial', {
      p_usuario_id: usuarioId,
      p_producto_id: datos.producto_id,
      p_cantidad: datos.cantidad,
      p_observacion: datos.observacion,
      p_ip: ip,
    })
    if (error) throw traducirErrorBD(error, 'No se pudo registrar el inventario inicial')
    return ControlKardex.aResultado(data, 'No se pudo registrar el inventario inicial', 'INVENTARIO_INICIAL')
  }

  /** Valida la respuesta JSON de la función y la convierte en DTO. */
  private static aResultado(data: unknown, contexto: string, motivoPorDefecto = ''): ResultadoMovimientoDTO {
    const r = resultadoMovimientoBDSchema.safeParse(data)
    if (!r.success) {
      console.error(`[CU16] ${contexto}: respuesta inesperada de la BD`, data)
      throw new ErrorInventario(`${contexto}. Respuesta inesperada de la base de datos.`)
    }
    return {
      movimientoId: r.data.movimiento_id,
      productoId: r.data.producto_id,
      producto: r.data.producto,
      motivo: r.data.motivo ?? motivoPorDefecto,
      cantidad: r.data.cantidad,
      stockAnterior: r.data.stock_anterior,
      stockResultante: r.data.stock_resultante,
    }
  }
}
