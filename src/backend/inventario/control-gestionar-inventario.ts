import type { Db } from '@/lib/supabase/types'
import { registrarEvento } from '@/backend/bitacora'
import { ErrorInventario, traducirErrorBD } from './errores'
import {
  aNumero,
  esStockCritico,
  sanitizarBusqueda,
  sentidoMovimiento,
  separarImagenes,
  type FilaImagenProducto,
} from './reglas'
import {
  filtrosProductosSchema,
  modificarProductoSchema,
  productoIdSchema,
  registrarCategoriaSchema,
  registrarProductoSchema,
  type FiltrosProductosInput,
  type ModificarProductoInput,
  type ProductoIdInput,
  type RegistrarCategoriaInput,
  type RegistrarProductoInput,
} from './schema'
import { comoDbCU16 } from './tipos-bd'
import type {
  CategoriaDTO,
  KardexProductoDTO,
  MovimientoKardexDTO,
  ProductoInventarioDTO,
} from './types'

/** Incluye las fotos de IMAGEN_PRODUCTO por su relación con PRODUCTO (solo lectura). */
const COLUMNAS_PRODUCTO =
  'id, codigo, nombre, descripcion_tecnica, unidad_medida, margen_ganancia, precio_compra_actual, stock_disponible, stock_minimo, estado, categoria_producto(id, nombre), imagen_producto(id, url_imagen, es_principal, orden)'

type FilaProducto = {
  id: number
  codigo: string | null
  nombre: string
  descripcion_tecnica: string | null
  unidad_medida: string
  margen_ganancia: string | number
  precio_compra_actual: string | number
  stock_disponible: string | number
  stock_minimo: string | number
  estado: boolean
  categoria_producto: { id: number; nombre: string } | null
  imagen_producto?: FilaImagenProducto[] | null
}

function aProductoDTO(p: FilaProducto): ProductoInventarioDTO {
  const stock = aNumero(p.stock_disponible)
  const minimo = aNumero(p.stock_minimo)
  const { principal, adicionales } = separarImagenes(p.imagen_producto)
  const imagenUrl = principal?.url ?? null
  return {
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    descripcionTecnica: p.descripcion_tecnica,
    unidadMedida: p.unidad_medida,
    categoria: p.categoria_producto ? { id: p.categoria_producto.id, nombre: p.categoria_producto.nombre } : null,
    margenGanancia: aNumero(p.margen_ganancia),
    precioCompraActual: aNumero(p.precio_compra_actual),
    stockDisponible: stock,
    stockMinimo: minimo,
    activo: p.estado,
    critico: esStockCritico(stock, minimo),
    imagenPrincipal: principal,
    imagenesAdicionales: adicionales,
    imagenUrl,
    url_imagen: imagenUrl,
  }
}

/**
 * Bitácora (CU06) para operaciones que no pasan por funciones SQL. Mismo
 * criterio que el Ciclo 1: un fallo de auditoría se registra en el servidor y
 * no revierte la operación ya confirmada. (Los ajustes e inventario inicial
 * registran su evento DENTRO de la transacción SQL.)
 */
async function auditar(db: Db, usuarioId: number, accion: string, descripcion: string): Promise<void> {
  try {
    await registrarEvento(db, { usuario_id: usuarioId, accion, descripcion })
  } catch (e) {
    console.error(`[CU16] No se pudo registrar ${accion} en la bitácora:`, e)
  }
}

async function normalizarUrlImagen(db: Db, urlImagen: string): Promise<string> {
  if (!urlImagen.startsWith('data:')) return urlImagen
  try {
    const match = urlImagen.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/)
    if (!match) return urlImagen
    const mimeType = match[1]
    const base64Data = match[2]
    const buffer = Buffer.from(base64Data, 'base64')
    const ext = mimeType.split('/')[1]?.replace('+xml', '') || 'png'
    const fileName = `prod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`

    if ((db as any).storage) {
      const { error } = await (db as any).storage
        .from('productos')
        .upload(fileName, buffer, { contentType: mimeType, upsert: true })

      if (!error) {
        const { data: publicData } = (db as any).storage.from('productos').getPublicUrl(fileName)
        if (publicData?.publicUrl) return publicData.publicUrl
      } else {
        console.error('[CU16] Error al subir imagen a storage:', error)
      }
    }
  } catch (err) {
    console.error('[CU16] Error al procesar imagen base64:', err)
  }
  return urlImagen
}

/**
 * ControlGestionarInventario (CU16) — catálogo, categorías y consulta del
 * kárdex. NO modifica existencias: eso es exclusivo de ControlKardex.
 * `usuarioId` debe provenir SIEMPRE de la sesión validada en el servidor.
 */
export class ControlGestionarInventario {
  // ---------------------------------------------------------------- consultas

  /** Catálogo con categoría, existencias y marca de stock crítico (RF13, RF16). */
  static async obtenerCatalogo(db: Db, filtros: FiltrosProductosInput = {}): Promise<ProductoInventarioDTO[]> {
    const f = filtrosProductosSchema.parse(filtros)
    let consulta = comoDbCU16(db).from('producto').select(COLUMNAS_PRODUCTO).order('nombre', { ascending: true })

    if (!f.incluir_inactivos) consulta = consulta.eq('estado', true)
    if (f.categoria_id) consulta = consulta.eq('categoria_id', f.categoria_id)
    const texto = f.texto ? sanitizarBusqueda(f.texto) : ''
    if (texto) consulta = consulta.or(`nombre.ilike.%${texto}%,codigo.ilike.%${texto}%`)

    const { data, error } = await consulta
    if (error) throw traducirErrorBD(error, 'No se pudo cargar el catálogo')
    const productos = data.map(aProductoDTO)
    return f.solo_criticos ? productos.filter((p) => p.critico) : productos
  }

  /** Productos activos con stock crítico (alertas visuales, RF16). */
  static async listarStockCritico(db: Db): Promise<ProductoInventarioDTO[]> {
    return ControlGestionarInventario.obtenerCatalogo(db, { solo_criticos: true })
  }

  static async listarCategorias(db: Db): Promise<CategoriaDTO[]> {
    const { data, error } = await db
      .from('categoria_producto')
      .select('id, nombre, descripcion')
      .order('nombre', { ascending: true })
    if (error) throw traducirErrorBD(error, 'No se pudieron cargar las categorías')
    return data.map((c) => ({ id: c.id, nombre: c.nombre, descripcion: c.descripcion }))
  }

  /** Kárdex de un producto en orden cronológico, con su responsable. */
  static async obtenerKardex(db: Db, input: ProductoIdInput): Promise<KardexProductoDTO> {
    const { producto_id } = productoIdSchema.parse(input)
    const dbCU16 = comoDbCU16(db)

    const { data: producto, error: errProd } = await dbCU16
      .from('producto')
      .select('id, codigo, nombre, stock_disponible, estado')
      .eq('id', producto_id)
      .maybeSingle()
    if (errProd) throw traducirErrorBD(errProd, 'No se pudo consultar el producto')
    if (!producto) throw new ErrorInventario('El producto no existe')

    const { data, error } = await dbCU16
      .from('movimiento_kardex')
      .select(
        'id, fecha_movimiento, tipo_movimiento, motivo, cantidad, stock_anterior, stock_resultante, documento, origen_movimiento, observacion, usuario_id, usuario(nombre)',
      )
      .eq('producto_id', producto_id)
      .order('fecha_movimiento', { ascending: true })
      .order('id', { ascending: true })
    if (error) throw traducirErrorBD(error, 'No se pudo cargar el kárdex')

    const movimientos: MovimientoKardexDTO[] = data.map((m) => ({
      id: m.id,
      fecha: m.fecha_movimiento,
      tipo: m.tipo_movimiento,
      motivo: m.motivo,
      sentido: sentidoMovimiento(m.tipo_movimiento, m.motivo),
      cantidad: aNumero(m.cantidad),
      stockAnterior: aNumero(m.stock_anterior),
      stockResultante: m.stock_resultante === null ? null : aNumero(m.stock_resultante),
      documento: m.documento,
      origen: m.origen_movimiento,
      observacion: m.observacion,
      responsable: { id: m.usuario_id, nombre: m.usuario?.nombre ?? null },
    }))

    return {
      producto: {
        id: producto.id,
        codigo: producto.codigo,
        nombre: producto.nombre,
        stockDisponible: aNumero(producto.stock_disponible),
        activo: producto.estado,
      },
      movimientos,
    }
  }

  // ---------------------------------------------------------------- escritura

  /** Alta de producto con stock 0 (el stock solo entra por el kárdex). */
  static async registrarProducto(db: Db, usuarioId: number, input: RegistrarProductoInput): Promise<ProductoInventarioDTO> {
    const d = registrarProductoSchema.parse(input)
    let { data, error } = await comoDbCU16(db)
      .from('producto')
      .insert({
        codigo: d.codigo,
        nombre: d.nombre,
        descripcion_tecnica: d.descripcion_tecnica,
        unidad_medida: d.unidad_medida,
        margen_ganancia: d.margen_ganancia.toFixed(2),
        precio_compra_actual: d.precio_compra_actual.toFixed(2),
        stock_minimo: d.stock_minimo.toFixed(2),
        stock_disponible: '0.00',
        estado: true,
        categoria_id: d.categoria_id,
      })
      .select(COLUMNAS_PRODUCTO)
      .single()

    // Si la secuencia de IDs de la BD estuviera desfasada respecto a semillas anteriores, reintentar
    if (error && error.code === '23505' && error.message?.includes('producto_pkey')) {
      for (let intento = 0; intento < 5 && error; intento++) {
        const retry = await comoDbCU16(db)
          .from('producto')
          .insert({
            codigo: d.codigo,
            nombre: d.nombre,
            descripcion_tecnica: d.descripcion_tecnica,
            unidad_medida: d.unidad_medida,
            margen_ganancia: d.margen_ganancia.toFixed(2),
            precio_compra_actual: d.precio_compra_actual.toFixed(2),
            stock_minimo: d.stock_minimo.toFixed(2),
            stock_disponible: '0.00',
            estado: true,
            categoria_id: d.categoria_id,
          })
          .select(COLUMNAS_PRODUCTO)
          .single()
        data = retry.data
        error = retry.error
      }
    }

    if (error || !data) throw traducirErrorBD(error ?? {}, 'No se pudo registrar el producto')

    const item: FilaProducto = data

    if (d.url_imagen && d.url_imagen.trim()) {
      let urlLimpia = d.url_imagen.trim()
      if (urlLimpia.startsWith('data:')) {
        urlLimpia = await normalizarUrlImagen(db, urlLimpia)
      }
      try {
        await db.from('imagen_producto').insert({
          producto_id: item.id,
          url_imagen: urlLimpia,
          es_principal: true,
          orden: 1,
        })
        item.imagen_producto = [{ id: 0, url_imagen: urlLimpia, es_principal: true, orden: 1 }]
      } catch (errImg) {
        console.error('[CU16] Error al registrar imagen:', errImg)
      }
    }

    const producto = aProductoDTO(item)
    await auditar(db, usuarioId, 'NUEVO_PRODUCTO', `Alta del producto «${producto.nombre}» (código ${producto.codigo}, ID ${producto.id}) con stock 0`)
    return producto
  }

  /** Modifica datos y precios. El stock NO se modifica aquí. */
  static async modificarProducto(db: Db, usuarioId: number, input: ModificarProductoInput): Promise<ProductoInventarioDTO> {
    const d = modificarProductoSchema.parse(input)
    const dbCU16 = comoDbCU16(db)

    const { data: actual, error: errActual } = await dbCU16
      .from('producto')
      .select('id, nombre, precio_compra_actual, margen_ganancia')
      .eq('id', d.producto_id)
      .maybeSingle()
    if (errActual) throw traducirErrorBD(errActual, 'No se pudo consultar el producto')
    if (!actual) throw new ErrorInventario('El producto no existe')

    const cambios = {
      ...(d.codigo !== undefined && { codigo: d.codigo }),
      ...(d.nombre !== undefined && { nombre: d.nombre }),
      ...(d.descripcion_tecnica !== undefined && { descripcion_tecnica: d.descripcion_tecnica }),
      ...(d.unidad_medida !== undefined && { unidad_medida: d.unidad_medida }),
      ...(d.margen_ganancia !== undefined && { margen_ganancia: d.margen_ganancia.toFixed(2) }),
      ...(d.precio_compra_actual !== undefined && { precio_compra_actual: d.precio_compra_actual.toFixed(2) }),
      ...(d.stock_minimo !== undefined && { stock_minimo: d.stock_minimo.toFixed(2) }),
      ...(d.categoria_id !== undefined && { categoria_id: d.categoria_id }),
    }

    const { data, error } = Object.keys(cambios).length > 0
      ? await dbCU16
          .from('producto')
          .update(cambios)
          .eq('id', d.producto_id)
          .select(COLUMNAS_PRODUCTO)
          .single()
      : await dbCU16
          .from('producto')
          .select(COLUMNAS_PRODUCTO)
          .eq('id', d.producto_id)
          .single()

    if (error || !data) throw traducirErrorBD(error, 'No se pudo modificar el producto')

    const item: FilaProducto = data

    if (d.url_imagen !== undefined) {
      let urlLimpia = d.url_imagen ? d.url_imagen.trim() : ''
      if (urlLimpia.startsWith('data:')) {
        urlLimpia = await normalizarUrlImagen(db, urlLimpia)
      }
      try {
        const { data: imgsExistentes } = await db
          .from('imagen_producto')
          .select('id')
          .eq('producto_id', d.producto_id)
          .order('es_principal', { ascending: false })
          .limit(1)

        const imgExistente = imgsExistentes?.[0] ?? null

        if (urlLimpia) {
          if (imgExistente) {
            await db
              .from('imagen_producto')
              .update({ url_imagen: urlLimpia, es_principal: true })
              .eq('id', imgExistente.id)
          } else {
            await db.from('imagen_producto').insert({
              producto_id: d.producto_id,
              url_imagen: urlLimpia,
              es_principal: true,
              orden: 1,
            })
          }
          item.imagen_producto = [{ id: 0, url_imagen: urlLimpia, es_principal: true, orden: 1 }]
        } else if (imgExistente) {
          await db.from('imagen_producto').delete().eq('producto_id', d.producto_id)
          item.imagen_producto = []
        }
      } catch (errImg) {
        console.error('[CU16] Error al actualizar imagen:', errImg)
      }
    }

    const producto = aProductoDTO(item)

    const precioAntes = aNumero(actual.precio_compra_actual)
    const margenAntes = aNumero(actual.margen_ganancia)
    const cambioPrecio =
      (d.precio_compra_actual !== undefined && d.precio_compra_actual !== precioAntes) ||
      (d.margen_ganancia !== undefined && d.margen_ganancia !== margenAntes)

    if (cambioPrecio) {
      await auditar(
        db,
        usuarioId,
        'CAMBIO_PRECIO',
        `«${producto.nombre}» (ID ${producto.id}): precio de compra ${precioAntes.toFixed(2)} → ${producto.precioCompraActual.toFixed(2)}, ` +
          `margen ${margenAntes.toFixed(2)} % → ${producto.margenGanancia.toFixed(2)} %`,
      )
    } else {
      await auditar(db, usuarioId, 'MODIFICAR_PRODUCTO', `Modificación de datos del producto «${producto.nombre}» (ID ${producto.id})`)
    }
    return producto
  }

  /** Desactiva un producto (no se borra: conserva su kárdex y su historial). */
  static async desactivarProducto(db: Db, usuarioId: number, input: ProductoIdInput): Promise<ProductoInventarioDTO> {
    const { producto_id } = productoIdSchema.parse(input)
    const dbCU16 = comoDbCU16(db)

    const { data, error } = await dbCU16
      .from('producto')
      .update({ estado: false })
      .eq('id', producto_id)
      .eq('estado', true)
      .select(COLUMNAS_PRODUCTO)
      .maybeSingle()
    if (error) throw traducirErrorBD(error, 'No se pudo desactivar el producto')

    if (!data) {
      const { data: existe, error: errExiste } = await dbCU16
        .from('producto')
        .select('id')
        .eq('id', producto_id)
        .maybeSingle()
      if (errExiste) throw traducirErrorBD(errExiste, 'No se pudo consultar el producto')
      throw new ErrorInventario(existe ? 'El producto ya está inactivo' : 'El producto no existe')
    }

    const producto = aProductoDTO(data)
    await auditar(db, usuarioId, 'DESACTIVAR_PRODUCTO', `Desactivación del producto «${producto.nombre}» (ID ${producto.id})`)
    return producto
  }

  static async registrarCategoria(db: Db, usuarioId: number, input: RegistrarCategoriaInput): Promise<CategoriaDTO> {
    const d = registrarCategoriaSchema.parse(input)
    const { data, error } = await db
      .from('categoria_producto')
      .insert({ nombre: d.nombre, descripcion: d.descripcion })
      .select('id, nombre, descripcion')
      .single()
    if (error) throw traducirErrorBD(error, 'No se pudo registrar la categoría')

    await auditar(db, usuarioId, 'NUEVA_CATEGORIA', `Alta de la categoría «${data.nombre}» (ID ${data.id})`)
    return { id: data.id, nombre: data.nombre, descripcion: data.descripcion }
  }
}
