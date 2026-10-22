import type { Db } from '@/lib/supabase/types'
import { aNumero, sanitizarBusqueda } from '@/backend/inventario/reglas'
import { ErrorCompras, traducirErrorBDCompras } from './errores'
import { calcularResumenCompra, normalizarNroDocumento } from './reglas'
import {
  compraIdSchema,
  documentoCompraSchema,
  filtrosComprasSchema,
  filtrosProductosCompraSchema,
  registrarCompraSchema,
  resultadoCompraBDSchema,
  resumenCompraSchema,
  type CompraIdInput,
  type DocumentoCompraInput,
  type FiltrosComprasInput,
  type FiltrosProductosCompraInput,
  type RegistrarCompraInput,
  type ResultadoCompraBD,
  type ResumenCompraInput,
} from './schema'
import { comoDbCU15 } from './tipos-bd'
import type {
  ComprobanteIngresoDTO,
  CompraResumenDTO,
  DisponibilidadDocumentoDTO,
  ProductoCompraDTO,
  ProveedorCompraDTO,
  ResumenCompraDTO,
} from './types'

/**
 * ControlRegistrarCompra (CU15) — Registrar Compras de Equipos e Insumos.
 *
 * El registro es UNA llamada a fn_registrar_compra (migracion_cu15_compras.sql):
 * la función valida, inserta cabecera y detalle, genera por cada línea la
 * ENTRADA/COMPRA del kárdex con el núcleo de CU16 («include»), actualiza el
 * último costo y el precio pactado y registra NUEVA_COMPRA en la bitácora, en
 * una sola transacción. Este control NO escribe tablas ni calcula stock.
 *
 * `usuarioId` debe provenir SIEMPRE de la sesión validada en el servidor.
 */
export class ControlRegistrarCompra {
  // ------------------------------------------------------ datos para la compra

  /** Proveedores activos (paso 2). */
  static async listarProveedoresActivos(db: Db): Promise<ProveedorCompraDTO[]> {
    const { data, error } = await comoDbCU15(db)
      .from('proveedor')
      .select('id, razon_social, nit, contacto, telefono')
      .eq('estado', true)
      .order('razon_social', { ascending: true })
    if (error) throw traducirErrorBDCompras(error, 'No se pudieron cargar los proveedores')
    return data.map((p) => ({
      id: p.id,
      razonSocial: p.razon_social,
      nit: p.nit,
      contacto: p.contacto,
      telefono: p.telefono,
    }))
  }

  /**
   * Productos activos del catálogo del proveedor seleccionado (CU14).
   * Solo devuelve los artículos que se encuentran registrados previamente en el
   * "Catálogo del mayorista" (producto_proveedor) de ese proveedor en específico.
   */
  static async listarProductosDisponibles(
    db: Db,
    filtros: FiltrosProductosCompraInput = {},
  ): Promise<ProductoCompraDTO[]> {
    const f = filtrosProductosCompraSchema.parse(filtros)
    const dbCU15 = comoDbCU15(db)

    // Si no se especifica un proveedor, no se devuelven productos para compra
    if (!f.proveedor_id) {
      return []
    }

    // 1. Consultar únicamente los productos registrados para este proveedor en CU14
    const { data: pactados, error: pactadosError } = await dbCU15
      .from('producto_proveedor')
      .select('producto_id, precio_compra')
      .eq('proveedor_id', f.proveedor_id)

    if (pactadosError) throw traducirErrorBDCompras(pactadosError, 'No se pudieron cargar los precios pactados')
    if (!pactados || pactados.length === 0) {
      return []
    }

    const idsPermitidos = pactados.map((pp) => pp.producto_id)
    const precioPactado = new Map(pactados.map((pp) => [pp.producto_id, aNumero(pp.precio_compra)]))

    // 2. Consultar los detalles de inventario solo de los productos autorizados
    let consulta = dbCU15
      .from('producto')
      .select('id, codigo, nombre, unidad_medida, precio_compra_actual, stock_disponible, categoria_producto(nombre)')
      .eq('estado', true)
      .in('id', idsPermitidos)
      .order('nombre', { ascending: true })

    const texto = f.texto ? sanitizarBusqueda(f.texto) : ''
    if (texto) consulta = consulta.or(`nombre.ilike.%${texto}%,codigo.ilike.%${texto}%`)

    const { data: productos, error: productosError } = await consulta
    if (productosError) throw traducirErrorBDCompras(productosError, 'No se pudieron cargar los productos')

    return (productos ?? []).map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      unidadMedida: p.unidad_medida,
      categoria: p.categoria_producto?.nombre ?? null,
      precioCompraActual: aNumero(p.precio_compra_actual),
      stockDisponible: aNumero(p.stock_disponible),
      precioPactado: precioPactado.get(p.id) ?? null,
    }))
  }

  /**
   * Comprobación previa de documento duplicado (excepción "Documento ya
   * registrado"), con la misma normalización que la BD. Es solo un aviso
   * temprano: la garantía es el índice único uq_compra_documento.
   */
  static async verificarDocumento(db: Db, input: DocumentoCompraInput): Promise<DisponibilidadDocumentoDTO> {
    const d = documentoCompraSchema.parse(input)
    const { data, error } = await comoDbCU15(db)
      .from('compra')
      .select('id')
      .eq('proveedor_id', d.proveedor_id)
      .eq('tipo_documento', d.tipo_documento)
      .eq('nro_documento_normalizado', normalizarNroDocumento(d.nro_documento))
      .limit(1)
      .maybeSingle()
    if (error) throw traducirErrorBDCompras(error, 'No se pudo verificar el documento')
    return { disponible: !data, compraId: data?.id ?? null }
  }

  /**
   * Genera o sugiere el siguiente número secuencial de documento según el tipo
   * (FACTURA → FAC-0001..., NOTA → NOT-0001...) evitando colisiones con
   * documentos ya registrados para el proveedor o en el sistema.
   */
  static async sugerirNumeroDocumento(
    db: Db,
    tipoDocumento: 'FACTURA' | 'NOTA',
    proveedorId?: number | null,
  ): Promise<string> {
    const prefijo = tipoDocumento === 'FACTURA' ? 'FAC-' : 'NOT-'
    const dbCU15 = comoDbCU15(db)

    let consulta = dbCU15
      .from('compra')
      .select('nro_documento, proveedor_id')
      .eq('tipo_documento', tipoDocumento)

    const { data, error } = await consulta
    if (error) throw traducirErrorBDCompras(error, 'No se pudo consultar la numeración de documentos')

    const relevantes = proveedorId
      ? (data ?? []).filter((d) => d.proveedor_id === proveedorId)
      : (data ?? [])

    let maxNum = 0
    for (const row of relevantes) {
      const doc = (row.nro_documento || '').trim()
      const regexPrefijo = new RegExp(`^${prefijo}(\\d+)`, 'i')
      const matchPrefijo = doc.match(regexPrefijo)
      if (matchPrefijo && matchPrefijo[1]) {
        const val = parseInt(matchPrefijo[1], 10)
        if (!isNaN(val) && val > maxNum) maxNum = val
      } else {
        const matchFin = doc.match(/(\d+)$/)
        if (matchFin && matchFin[1]) {
          const val = parseInt(matchFin[1], 10)
          if (!isNaN(val) && val > maxNum) maxNum = val
        }
      }
    }

    let siguiente = maxNum + 1
    let sugerido = `${prefijo}${String(siguiente).padStart(4, '0')}`

    // Asegurar que no coincida con ningún documento existente del mismo proveedor
    const existentes = new Set(relevantes.map((d) => (d.nro_documento || '').trim().toUpperCase()))
    while (existentes.has(sugerido.toUpperCase())) {
      siguiente++
      sugerido = `${prefijo}${String(siguiente).padStart(4, '0')}`
    }

    return sugerido
  }

  /** Subtotal por línea y total (paso 4). No accede a la BD. */
  static calcularResumen(input: ResumenCompraInput): ResumenCompraDTO {
    const { items } = resumenCompraSchema.parse(input)
    return calcularResumenCompra(items)
  }

  // ---------------------------------------------------------------- registro

  /**
   * Registra la compra (pasos 5–7) y devuelve el comprobante de ingreso a
   * almacén. Todo ocurre dentro de fn_registrar_compra; aquí solo se valida la
   * forma, se invoca la función y se arma el DTO.
   */
  static async registrarCompra(
    db: Db,
    usuarioId: number,
    input: RegistrarCompraInput,
    ip: string | null = null,
  ): Promise<ComprobanteIngresoDTO> {
    const d = registrarCompraSchema.parse(input)
    const dbCU15 = comoDbCU15(db)

    const { data, error } = await dbCU15.rpc('fn_registrar_compra', {
      p_usuario_id: usuarioId,
      p_proveedor_id: d.proveedor_id,
      p_tipo_documento: d.tipo_documento,
      p_nro_documento: d.nro_documento,
      p_fecha_compra: d.fecha_compra,
      // Números JSON (no strings): la función exige jsonb_typeof = 'number'
      p_items: d.items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad, costo_unitario: i.costo_unitario })),
      p_observacion: d.observacion,
      p_ip: ip,
    })
    if (error) throw traducirErrorBDCompras(error, 'No se pudo registrar la compra')

    const r = resultadoCompraBDSchema.safeParse(data)
    if (!r.success) {
      console.error('[CU15] No se pudo registrar la compra: respuesta inesperada de la BD', data)
      throw new ErrorCompras('No se pudo confirmar el registro de la compra. Consulte el listado de compras antes de reintentar.')
    }

    // La compra YA está confirmada: si la lectura del comprobante completo
    // falla, se devuelve el que armó la propia función (sin datos opcionales).
    try {
      return await ControlRegistrarCompra.obtenerComprobanteIngreso(db, { compra_id: r.data.compra_id })
    } catch (e) {
      console.warn(`[CU15] Compra #${r.data.compra_id} registrada; comprobante armado con la respuesta de la función:`, e)
      return ControlRegistrarCompra.comprobanteDesdeFuncion(r.data, d.observacion)
    }
  }

  // --------------------------------------------------------------- consultas

  /** Listado de compras, de la más reciente a la más antigua. */
  static async listarCompras(db: Db, filtros: FiltrosComprasInput = { limite: 50 }): Promise<CompraResumenDTO[]> {
    const f = filtrosComprasSchema.parse(filtros)
    let consulta = comoDbCU15(db)
      .from('compra')
      .select(
        'id, tipo_documento, nro_documento, fecha_compra, fecha_registro, total, proveedor_id, usuario_id, proveedor(razon_social), usuario(nombre), detalle_compra(count)',
      )
      .order('fecha_compra', { ascending: false })
      .order('id', { ascending: false })
      .limit(f.limite)

    if (f.proveedor_id) consulta = consulta.eq('proveedor_id', f.proveedor_id)
    if (f.tipo_documento) consulta = consulta.eq('tipo_documento', f.tipo_documento)
    if (f.desde) consulta = consulta.gte('fecha_compra', f.desde)
    if (f.hasta) consulta = consulta.lte('fecha_compra', f.hasta)
    // Búsqueda sobre la clave normalizada: solo [A-Z0-9], sin comodines del usuario
    const nro = f.nro_documento ? normalizarNroDocumento(f.nro_documento).replace(/[^A-Z0-9]/g, '') : ''
    if (nro) consulta = consulta.ilike('nro_documento_normalizado', `%${nro}%`)

    const { data, error } = await consulta
    if (error) throw traducirErrorBDCompras(error, 'No se pudieron cargar las compras')
    return data.map((c) => ({
      id: c.id,
      proveedor: { id: c.proveedor_id, razonSocial: c.proveedor?.razon_social ?? null },
      tipoDocumento: c.tipo_documento,
      nroDocumento: c.nro_documento,
      fechaCompra: c.fecha_compra,
      fechaRegistro: c.fecha_registro,
      total: aNumero(c.total),
      responsable: { id: c.usuario_id, nombre: c.usuario?.nombre ?? null },
      cantidadLineas: c.detalle_compra?.[0]?.count ?? 0,
    }))
  }

  /**
   * Detalle de una compra = comprobante de ingreso a almacén: cabecera,
   * proveedor, responsable, líneas con costo histórico y el movimiento de
   * kárdex (stock anterior → resultante) que generó cada línea.
   */
  static async obtenerComprobanteIngreso(db: Db, input: CompraIdInput): Promise<ComprobanteIngresoDTO> {
    const { compra_id } = compraIdSchema.parse(input)
    const dbCU15 = comoDbCU15(db)

    const [compra, detalle, movimientos] = await Promise.all([
      dbCU15
        .from('compra')
        .select(
          'id, tipo_documento, nro_documento, fecha_compra, fecha_registro, total, observacion, proveedor_id, usuario_id, proveedor(razon_social, nit), usuario(nombre)',
        )
        .eq('id', compra_id)
        .maybeSingle(),
      dbCU15
        .from('detalle_compra')
        .select('producto_id, cantidad, costo_unitario, subtotal, producto(codigo, nombre, unidad_medida)')
        .eq('compra_id', compra_id)
        .order('producto_id', { ascending: true }),
      dbCU15
        .from('movimiento_kardex')
        .select('id, producto_id, stock_anterior, stock_resultante')
        .eq('compra_id', compra_id)
        .eq('motivo', 'COMPRA'),
    ])
    if (compra.error) throw traducirErrorBDCompras(compra.error, 'No se pudo consultar la compra')
    if (!compra.data) throw new ErrorCompras('La compra no existe')
    if (detalle.error) throw traducirErrorBDCompras(detalle.error, 'No se pudo consultar el detalle de la compra')
    if (movimientos.error) throw traducirErrorBDCompras(movimientos.error, 'No se pudo consultar el kárdex de la compra')

    const c = compra.data
    const movPorProducto = new Map(movimientos.data.map((m) => [m.producto_id, m]))
    return {
      compraId: c.id,
      proveedor: { id: c.proveedor_id, razonSocial: c.proveedor?.razon_social ?? '', nit: c.proveedor?.nit ?? null },
      tipoDocumento: c.tipo_documento,
      nroDocumento: c.nro_documento,
      documento: `${c.tipo_documento} ${c.nro_documento}`,
      fechaCompra: c.fecha_compra,
      fechaRegistro: c.fecha_registro,
      responsable: { id: c.usuario_id, nombre: c.usuario?.nombre ?? null },
      observacion: c.observacion,
      total: aNumero(c.total),
      lineas: detalle.data.map((l) => {
        const mov = movPorProducto.get(l.producto_id)
        return {
          productoId: l.producto_id,
          codigo: l.producto?.codigo ?? null,
          producto: l.producto?.nombre ?? `Producto ${l.producto_id}`,
          unidadMedida: l.producto?.unidad_medida ?? null,
          cantidad: aNumero(l.cantidad),
          costoUnitario: aNumero(l.costo_unitario),
          subtotal: aNumero(l.subtotal),
          movimientoId: mov?.id ?? null,
          stockAnterior: mov ? aNumero(mov.stock_anterior) : null,
          stockResultante: mov?.stock_resultante == null ? null : aNumero(mov.stock_resultante),
        }
      }),
    }
  }

  /** Comprobante con los datos que devuelve fn_registrar_compra (respaldo). */
  private static comprobanteDesdeFuncion(r: ResultadoCompraBD, observacion: string | null): ComprobanteIngresoDTO {
    return {
      compraId: r.compra_id,
      proveedor: { id: r.proveedor_id, razonSocial: r.proveedor, nit: null },
      tipoDocumento: r.tipo_documento,
      nroDocumento: r.nro_documento,
      documento: `${r.tipo_documento} ${r.nro_documento}`,
      fechaCompra: r.fecha_compra,
      fechaRegistro: r.fecha_registro,
      responsable: { id: r.usuario_id, nombre: null },
      observacion,
      total: r.total,
      lineas: r.lineas.map((l) => ({
        productoId: l.producto_id,
        codigo: null,
        producto: l.producto,
        unidadMedida: null,
        cantidad: l.cantidad,
        costoUnitario: l.costo_unitario,
        subtotal: l.subtotal,
        movimientoId: l.movimiento_id,
        stockAnterior: l.stock_anterior,
        stockResultante: l.stock_resultante,
      })),
    }
  }
}
