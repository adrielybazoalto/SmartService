import type { Db } from '@/lib/supabase/types'
import {
  actualizarCategoriaSchema,
  actualizarProductoSchema,
  crearCategoriaSchema,
  crearImagenProductoSchema,
  crearProductoSchema,
  registrarMovimientoKardexSchema,
  type ActualizarCategoriaInput,
  type ActualizarProductoInput,
  type CrearCategoriaInput,
  type CrearImagenProductoInput,
  type CrearProductoInput,
  type RegistrarMovimientoKardexInput,
} from './schema'
import type {
  CategoriaProducto,
  ImagenProducto,
  MovimientoKardex,
  NuevaCategoriaProducto,
  NuevoMovimientoKardex,
  NuevoProducto,
  Producto,
  ProductoUpdate,
} from './types'

/** Convierte un número a string con decimales (las columnas NUMERIC son strings). */
function num(v: number, decimales = 2): string {
  return v.toFixed(decimales)
}

// ---------------------------------------------------------------------------
// CATEGORÍAS
// ---------------------------------------------------------------------------

export async function listarCategorias(db: Db): Promise<CategoriaProducto[]> {
  const { data, error } = await db
    .from('categoria_producto')
    .select('*')
    .order('nombre', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar las categorías: ${error.message}`)
  return data
}

export async function crearCategoria(db: Db, input: CrearCategoriaInput): Promise<CategoriaProducto> {
  const parsed = crearCategoriaSchema.parse(input)
  const { data, error } = await db
    .from('categoria_producto')
    .insert(parsed as NuevaCategoriaProducto)
    .select()
    .single()
  if (error) throw new Error(`No se pudo crear la categoría: ${error.message}`)
  return data
}

export async function actualizarCategoria(
  db: Db,
  id: number,
  input: ActualizarCategoriaInput,
): Promise<CategoriaProducto> {
  const parsed = actualizarCategoriaSchema.parse(input)
  const { data, error } = await db
    .from('categoria_producto')
    .update(parsed)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(`No se pudo actualizar la categoría: ${error.message}`)
  return data
}

export async function eliminarCategoria(db: Db, id: number): Promise<void> {
  const { error } = await db.from('categoria_producto').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar la categoría: ${error.message}`)
}

// ---------------------------------------------------------------------------
// PRODUCTOS
// ---------------------------------------------------------------------------

export async function listarProductos(db: Db) {
  const { data, error } = await db
    .from('producto')
    .select('*, categoria_producto(*)')
    .order('nombre', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los productos: ${error.message}`)
  return data
}

export async function buscarProductos(db: Db, termino: string) {
  const t = termino.trim()
  if (!t) return listarProductos(db)
  const { data, error } = await db
    .from('producto')
    .select('*, categoria_producto(*)')
    .or(`nombre.ilike.%${t}%,descripcion_tecnica.ilike.%${t}%`)
    .order('nombre', { ascending: true })
  if (error) throw new Error(`No se pudieron buscar productos: ${error.message}`)
  return data
}

export async function getProductoPorId(db: Db, id: number) {
  const { data, error } = await db
    .from('producto')
    .select('*, categoria_producto(*), imagen_producto(*)')
    .eq('id', id)
    .single()
  if (error) throw new Error(`No se encontró el producto: ${error.message}`)
  return data
}

export async function crearProducto(db: Db, input: CrearProductoInput): Promise<Producto> {
  const parsed = crearProductoSchema.parse(input)

  const payload: NuevoProducto = {
    nombre: parsed.nombre,
    descripcion_tecnica: parsed.descripcion_tecnica,
    unidad_medida: parsed.unidad_medida,
    margen_ganancia: num(parsed.margen_ganancia),
    precio_compra_actual: num(parsed.precio_compra_actual)!,
    stock_disponible: num(parsed.stock_disponible),
    stock_minimo: num(parsed.stock_minimo),
    categoria_id: parsed.categoria_id,
  }

  const { data, error } = await db.from('producto').insert(payload).select().single()
  if (error) throw new Error(`No se pudo crear el producto: ${error.message}`)
  return data
}

export async function actualizarProducto(
  db: Db,
  id: number,
  input: ActualizarProductoInput,
): Promise<Producto> {
  const parsed = actualizarProductoSchema.parse(input)

  const payload: ProductoUpdate = {
    ...(parsed.nombre !== undefined && { nombre: parsed.nombre }),
    ...(parsed.descripcion_tecnica !== undefined && { descripcion_tecnica: parsed.descripcion_tecnica }),
    ...(parsed.unidad_medida !== undefined && { unidad_medida: parsed.unidad_medida }),
    ...(parsed.margen_ganancia !== undefined && { margen_ganancia: num(parsed.margen_ganancia) }),
    ...(parsed.precio_compra_actual !== undefined && { precio_compra_actual: num(parsed.precio_compra_actual)! }),
    ...(parsed.stock_disponible !== undefined && { stock_disponible: num(parsed.stock_disponible) }),
    ...(parsed.stock_minimo !== undefined && { stock_minimo: num(parsed.stock_minimo) }),
    ...(parsed.categoria_id !== undefined && { categoria_id: parsed.categoria_id }),
  }

  const { data, error } = await db.from('producto').update(payload).eq('id', id).select().single()
  if (error) throw new Error(`No se pudo actualizar el producto: ${error.message}`)
  return data
}

export async function eliminarProducto(db: Db, id: number): Promise<void> {
  const { error } = await db.from('producto').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar el producto: ${error.message}`)
}

/**
 * Productos con stock disponible <= stock mínimo.
 * Filtro en memoria: comparar dos columnas requiere RPC en Postgres;
 * a este volumen es suficiente (optimizable con una función SQL).
 */
export async function listarProductosConStockBajo(db: Db) {
  const { data, error } = await db
    .from('producto')
    .select('*, categoria_producto(*)')
    .order('nombre', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar los productos: ${error.message}`)
  return data.filter(
    (p) => parseFloat(p.stock_disponible) <= parseFloat(p.stock_minimo),
  )
}

// ---------------------------------------------------------------------------
// IMÁGENES DE PRODUCTO
// ---------------------------------------------------------------------------

export async function listarImagenesDeProducto(db: Db, productoId: number): Promise<ImagenProducto[]> {
  const { data, error } = await db
    .from('imagen_producto')
    .select('*')
    .eq('producto_id', productoId)
    .order('orden', { ascending: true })
  if (error) throw new Error(`No se pudieron cargar las imágenes: ${error.message}`)
  return data
}

export async function agregarImagenProducto(
  db: Db,
  input: CrearImagenProductoInput,
): Promise<ImagenProducto> {
  const parsed = crearImagenProductoSchema.parse(input)

  // Solo una imagen principal por producto.
  if (parsed.es_principal) {
    const { error: errReset } = await db
      .from('imagen_producto')
      .update({ es_principal: false })
      .eq('producto_id', parsed.producto_id)
    if (errReset) throw new Error(`No se pudo actualizar las imágenes: ${errReset.message}`)
  }

  const { data, error } = await db.from('imagen_producto').insert(parsed).select().single()
  if (error) throw new Error(`No se pudo agregar la imagen: ${error.message}`)
  return data
}

export async function eliminarImagenProducto(db: Db, id: number): Promise<void> {
  const { error } = await db.from('imagen_producto').delete().eq('id', id)
  if (error) throw new Error(`No se pudo eliminar la imagen: ${error.message}`)
}

// ---------------------------------------------------------------------------
// KARDEX (movimientos de inventario)
// ---------------------------------------------------------------------------

/**
 * Registra un movimiento de kardex y actualiza el stock del producto.
 * ENTRADA suma, SALIDA resta (valida stock suficiente), AJUSTE fija el valor.
 * NOTA: sin transacción atómica entre ambos UPDATE (ver README para la
 * alternativa con función SQL / RPC).
 */
export async function registrarMovimientoKardex(
  db: Db,
  input: RegistrarMovimientoKardexInput,
  usuarioId: number,
): Promise<MovimientoKardex> {
  const parsed = registrarMovimientoKardexSchema.parse(input)

  const { data: producto, error: errProd } = await db
    .from('producto')
    .select('stock_disponible')
    .eq('id', parsed.producto_id)
    .single()
  if (errProd) throw new Error(`No se encontró el producto: ${errProd.message}`)

  const stockAnterior = parseFloat(producto.stock_disponible)
  let stockNuevo = stockAnterior

  if (parsed.tipo_movimiento === 'ENTRADA') {
    stockNuevo = stockAnterior + parsed.cantidad
  } else if (parsed.tipo_movimiento === 'SALIDA') {
    if (parsed.cantidad > stockAnterior) {
      throw new Error('Stock insuficiente para registrar la salida.')
    }
    stockNuevo = stockAnterior - parsed.cantidad
  } else {
    // AJUSTE: el stock pasa a ser la cantidad indicada
    stockNuevo = parsed.cantidad
  }

  const payload: NuevoMovimientoKardex = {
    producto_id: parsed.producto_id,
    usuario_id: usuarioId,
    tipo_movimiento: parsed.tipo_movimiento,
    cantidad: num(parsed.cantidad)!,
    stock_anterior: num(stockAnterior)!,
    origen_movimiento: parsed.origen_movimiento,
    observacion: parsed.observacion,
  }

  const { data: movimiento, error: errMov } = await db
    .from('movimiento_kardex')
    .insert(payload)
    .select()
    .single()
  if (errMov) throw new Error(`No se pudo registrar el movimiento: ${errMov.message}`)

  const { error: errStock } = await db
    .from('producto')
    .update({ stock_disponible: num(stockNuevo)! })
    .eq('id', parsed.producto_id)
  if (errStock) {
    throw new Error(`Movimiento registrado pero no se pudo actualizar el stock: ${errStock.message}`)
  }

  return movimiento
}

export async function listarMovimientosDeProducto(db: Db, productoId: number) {
  const { data, error } = await db
    .from('movimiento_kardex')
    .select('*, usuario(nombre)')
    .eq('producto_id', productoId)
    .order('fecha_movimiento', { ascending: false })
  if (error) throw new Error(`No se pudieron cargar los movimientos: ${error.message}`)
  return data
}