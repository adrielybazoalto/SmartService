'use server';

/**
 * CU014 — Gestionar Proveedores y Catálogo de Mayoristas · Server Actions
 *
 * Envuelven los servicios de '@/backend/proveedores': obtienen el contexto
 * (usuario de la sesión, IP, cliente Supabase), registran la bitácora,
 * revalidan '/proveedores' y devuelven siempre:
 *   éxito → { ok: true, data, mensaje }   ·   error → { ok: false, error }
 *
 * Nota sobre los alias: en un archivo 'use server' Next.js solo admite
 * exportar funciones async. Un `export const alias = otraFuncion` puede
 * fallar en el build, así que cada alias es una función async que delega.
 */
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth'; // O desde '@/lib/auth' según tu estructura
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  ProveedorError,
  actualizarCatalogoService,
  actualizarProveedorService,
  cambiarEstadoProveedorService,
  eliminarItemCatalogoService,
  guardarHistorialPreciosService,
  guardarProveedorService,
  listarProductosService,
  obtenerCatalogoService,
  obtenerListaProveedoresService,
  obtenerProveedorPorIdService,
  recorrerYValidarListaProductos,
  registrarEventoProveedorService,
  validarProveedorService,
  verificarProductosExistentesService,
  verificarRUCService,
  type ActionResult,
  type CatalogoMayorista,
  type Db,
  type ProductoCatalogoDTO,
  type ProductoOpcion,
  type Proveedor,
  type ProveedorDTO,
  type ResumenCatalogo,
} from '@/backend/proveedores';

// ---------------------------------------------------------------------------
// Contexto y respuestas
// ---------------------------------------------------------------------------
async function contexto(): Promise<{ db: any; usuarioId: number; ip: string }> {
  const usuario = await getCurrentUser();
  if (!usuario) throw new ProveedorError('Sesión expirada. Vuelve a iniciar sesión.');
  
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
  
  const db = getSupabaseServiceClient();
  return { db, usuarioId: usuario.id, ip };
}
const exito = <T>(data: T, mensaje: string) => ({ ok: true as const, data, mensaje });

function fallo(e: unknown, porDefecto: string) {
  if (e instanceof Error && !(e instanceof ProveedorError)) console.error('[CU014]', e);
  const error = e instanceof Error && e.message ? e.message : porDefecto;
  return { ok: false as const, error };
}

const idValido = (id: unknown) => Number.isInteger(Number(id)) && Number(id) > 0;

// ===========================================================================
// 1. Búsqueda y consulta: buscarProveedor → consultarProveedor → obtenerListaProveedores
// ===========================================================================
export async function obtenerProveedoresAction(
  criterio = '',
  incluirInactivos = false
): Promise<ActionResult<Proveedor[]>> {
  try {
    const { db } = await contexto();
    const lista = await obtenerListaProveedoresService(db, criterio, { incluirInactivos });
    return exito(lista, lista.length ? `${lista.length} proveedor(es) encontrado(s)` : 'Sin resultados');
  } catch (e) {
    return fallo(e, 'No se pudieron obtener los proveedores');
  }
}

/** Productos internos para armar el catálogo */
export async function obtenerProductosAction(): Promise<ActionResult<ProductoOpcion[]>> {
  try {
    const { db } = await contexto();
    const productos = await listarProductosService(db);
    return exito(productos, `${productos.length} producto(s) disponibles`);
  } catch (e) {
    return fallo(e, 'No se pudieron obtener los productos');
  }
}

/** Validación anticipada del NIT (verificarRUCExistente) para el formulario */
export async function verificarRUCAction(
  nitRuc: string,
  excluirId?: number
): Promise<ActionResult<{ existe: boolean }>> {
  try {
    const { db } = await contexto();
    const existe = await verificarRUCService(db, nitRuc, excluirId);
    return exito({ existe }, existe ? 'El NIT ya está registrado' : 'NIT disponible');
  } catch (e) {
    return fallo(e, 'No se pudo verificar el NIT');
  }
}

// ===========================================================================
// 2. Registro y validación: registrarDatosProveedor → solicitarValidacionProveedor
//    → verificarRUCExistente → guardarProveedor → registrarEventoProveedor
// ===========================================================================
export async function registrarProveedorAction(proveedorDTO: ProveedorDTO): Promise<ActionResult<Proveedor>> {
  try {
    const { db, usuarioId, ip } = await contexto();
    const datos = await validarProveedorService(db, proveedorDTO);
    const proveedor = await guardarProveedorService(db, datos);
    await registrarEventoProveedorService(
      db,
      usuarioId,
      'CREAR_PROVEEDOR',
      ip,
      `Proveedor #${proveedor.id} "${proveedor.razon_social}" (NIT ${proveedor.nit}) registrado`
    );
    revalidatePath('/proveedores');
    return exito(proveedor, 'Proveedor registrado correctamente');
  } catch (e) {
    return fallo(e, 'No se pudo registrar el proveedor');
  }
}

/** Subflujo: modificar proveedor */
export async function actualizarProveedorAction(
  id: number,
  proveedorDTO: ProveedorDTO
): Promise<ActionResult<Proveedor>> {
  try {
    if (!idValido(id)) return fallo(null, 'Proveedor inválido');
    const { db, usuarioId, ip } = await contexto();
    const datos = await validarProveedorService(db, proveedorDTO, id);
    const proveedor = await actualizarProveedorService(db, id, datos);
    await registrarEventoProveedorService(
      db,
      usuarioId,
      'ACTUALIZAR_PROVEEDOR',
      ip,
      `Proveedor #${id} "${proveedor.razon_social}" actualizado`
    );
    revalidatePath('/proveedores');
    return exito(proveedor, 'Proveedor actualizado');
  } catch (e) {
    return fallo(e, 'No se pudo actualizar el proveedor');
  }
}

/** Subflujo: desactivar / reactivar proveedor */
export async function cambiarEstadoProveedorAction(id: number, activo: boolean): Promise<ActionResult<Proveedor>> {
  try {
    if (!idValido(id)) return fallo(null, 'Proveedor inválido');
    const { db, usuarioId, ip } = await contexto();
    const proveedor = await cambiarEstadoProveedorService(db, id, activo);
    await registrarEventoProveedorService(
      db,
      usuarioId,
      activo ? 'ACTIVAR_PROVEEDOR' : 'DESACTIVAR_PROVEEDOR',
      ip,
      `Proveedor #${id} "${proveedor.razon_social}" ${activo ? 'reactivado' : 'desactivado'}`
    );
    revalidatePath('/proveedores');
    return exito(proveedor, activo ? 'Proveedor reactivado' : 'Proveedor desactivado');
  } catch (e) {
    return fallo(e, 'No se pudo cambiar el estado del proveedor');
  }
}

// ===========================================================================
// 3. Catálogo de mayoristas: seleccionarProveedorYCatalogo → procesarActualizacionCatalogo
//    → recorrerYValidarListaProductos → verificarProductosExistentes
//    → actualizarPreciosYStockMayorista → guardarHistorialPrecios → registrarEventoProveedor
// ===========================================================================
export async function obtenerCatalogoAction(proveedorId: number): Promise<ActionResult<CatalogoMayorista[]>> {
  try {
    if (!idValido(proveedorId)) return fallo(null, 'Proveedor inválido');
    const { db } = await contexto();
    const catalogo = await obtenerCatalogoService(db, proveedorId);
    return exito(catalogo, `${catalogo.length} producto(s) en el catálogo`);
  } catch (e) {
    return fallo(e, 'No se pudo obtener el catálogo');
  }
}

export async function procesarActualizacionCatalogoAction(
  proveedorId: number,
  listaDTO: ProductoCatalogoDTO[]
): Promise<ActionResult<ResumenCatalogo>> {
  try {
    if (!idValido(proveedorId)) return fallo(null, 'Proveedor inválido');
    const { db, usuarioId, ip } = await contexto();

    const proveedor = await obtenerProveedorPorIdService(db, proveedorId);
    if (!proveedor) return fallo(null, 'El proveedor no existe');
    if (!proveedor.estado) return fallo(null, 'El proveedor está desactivado: reactívelo para actualizar su catálogo');

    // 3.2 recorrerYValidarListaProductos
    const items = recorrerYValidarListaProductos(listaDTO);
    // 3.3 verificarProductosExistentes
    const nombres = await verificarProductosExistentesService(db, items);
    // 3.4 actualizarPreciosYStockMayorista
    const resultado = await actualizarCatalogoService(db, proveedorId, items, nombres);
    // 3.5 guardarHistorialPrecios
    await guardarHistorialPreciosService(db, {
      usuarioId,
      ip,
      proveedorId,
      proveedorNombre: proveedor.razon_social,
      precios: resultado.cambiosPrecio,
    });
    // 2.4 registrarEventoProveedor
    if (resultado.insertados + resultado.actualizados > 0) {
      await registrarEventoProveedorService(
        db,
        usuarioId,
        'ACTUALIZAR_CATALOGO_PROVEEDOR',
        ip,
        `Catálogo de "${proveedor.razon_social}": ${resultado.insertados} nuevo(s), ` +
          `${resultado.actualizados} actualizado(s), ${resultado.sinCambios} sin cambios`
      );
    }

    // 4. confirmarResultadoCatalogo → mostrarResumenCatalogo
    const catalogo = await obtenerCatalogoService(db, proveedorId);
    revalidatePath('/proveedores');
    const resumen: ResumenCatalogo = {
      proveedorId,
      proveedorNombre: proveedor.razon_social,
      ...resultado,
      catalogo,
    };
    const mensaje =
      resultado.insertados + resultado.actualizados === 0
        ? 'No había cambios que guardar en el catálogo'
        : `Catálogo actualizado: ${resultado.insertados} nuevo(s), ${resultado.actualizados} actualizado(s)`;
    return exito(resumen, mensaje);
  } catch (e) {
    return fallo(e, 'No se pudo actualizar el catálogo');
  }
}

/** Quitar un producto del catálogo del proveedor */
export async function eliminarItemCatalogoAction(catalogoId: number): Promise<ActionResult<CatalogoMayorista>> {
  try {
    if (!idValido(catalogoId)) return fallo(null, 'Registro inválido');
    const { db, usuarioId, ip } = await contexto();
    const item = await eliminarItemCatalogoService(db, catalogoId);
    await registrarEventoProveedorService(
      db,
      usuarioId,
      'QUITAR_PRODUCTO_PROVEEDOR',
      ip,
      `"${item.producto_nombre}" retirado del catálogo del proveedor #${item.proveedor_id}`
    );
    revalidatePath('/proveedores');
    return exito(item, `"${item.producto_nombre}" retirado del catálogo`);
  } catch (e) {
    return fallo(e, 'No se pudo quitar el producto del catálogo');
  }
}

// ===========================================================================
// Alias con los nombres del diagrama de comunicación
// ===========================================================================
export async function registrarDatosProveedor(proveedorDTO: ProveedorDTO): Promise<ActionResult<Proveedor>> {
  return registrarProveedorAction(proveedorDTO);
}

export async function procesarActualizacionCatalogo(
  proveedorId: number,
  listaDTO: ProductoCatalogoDTO[]
): Promise<ActionResult<ResumenCatalogo>> {
  return procesarActualizacionCatalogoAction(proveedorId, listaDTO);
}

export async function obtenerListaProveedores(
  criterio = '',
  incluirInactivos = false
): Promise<ActionResult<Proveedor[]>> {
  return obtenerProveedoresAction(criterio, incluirInactivos);
}

export async function buscarProveedor(criterio = ''): Promise<ActionResult<Proveedor[]>> {
  return obtenerProveedoresAction(criterio, false);
}
