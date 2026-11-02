'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { obtenerIpOrigen } from '@/lib/ip'
import type { UsuarioConRol } from '@/lib/auth'
import type { Db } from '@/lib/supabase/types'
import {
  ControlRegistrarCompra,
  ErrorCompras,
  exigirAccesoCompras,
  type AccionCompras,
  type CompraIdInput,
  type CompraResumenDTO,
  type ComprobanteIngresoDTO,
  type DisponibilidadDocumentoDTO,
  type DocumentoCompraInput,
  type FiltrosComprasInput,
  type FiltrosProductosCompraInput,
  type ProductoCompraDTO,
  type ProveedorCompraDTO,
  type RegistrarCompraInput,
  type ResultadoCompras,
  type ResumenCompraDTO,
  type ResumenCompraInput,
} from '@/backend/compras'

/**
 * Server Actions de CU15 — Registrar Compras de Equipos e Insumos.
 *
 * Cada acción es un punto de entrada público (POST directo): TODAS verifican
 * sesión y permisos en el servidor (exigirAccesoCompras), validan la entrada
 * con Zod y devuelven solo DTOs. La identidad del usuario se toma de la
 * sesión, nunca de los argumentos.
 *
 *   ADMINISTRADOR y ENCARGADO → consultar (LEER) y registrar (CREAR).   TÉCNICO → ninguna.
 */

const RUTA_COMPRAS = '/compras'
/** Una compra cambia existencias y kárdex (CU16). */
const RUTA_INVENTARIO = '/inventario'

/** Mensaje para el usuario: validación Zod / error de negocio / genérico (sin detalles internos). */
function mensajeDeError(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback
  if (e instanceof ErrorCompras) return e.message
  console.error('[CU15] Error inesperado:', e)
  return fallback
}

/** IP de origen para la bitácora centralizada (CU06). */
async function ipCliente(): Promise<string | null> {
  return obtenerIpOrigen()
}

async function ejecutar<T>(
  accion: AccionCompras,
  operacion: (usuario: UsuarioConRol, db: Db) => Promise<T> | T,
  mensajeExito: string,
  mensajeFallo: string,
): Promise<ResultadoCompras<T>> {
  try {
    const usuario = await exigirAccesoCompras(accion)
    const data = await operacion(usuario, getSupabaseServiceClient())
    if (accion !== 'LEER') {
      revalidatePath(RUTA_COMPRAS)
      revalidatePath(RUTA_INVENTARIO)
    }
    return { ok: true, mensaje: mensajeExito, data }
  } catch (e) {
    return { ok: false, mensaje: mensajeDeError(e, mensajeFallo) }
  }
}

// ------------------------------------------------------- datos para la compra

export async function listarProveedoresCompraAction(): Promise<ResultadoCompras<ProveedorCompraDTO[]>> {
  return ejecutar('LEER', (_u, db) => ControlRegistrarCompra.listarProveedoresActivos(db),
    'Proveedores cargados.', 'No se pudieron cargar los proveedores.')
}

export async function listarProductosCompraAction(
  filtros: FiltrosProductosCompraInput = {},
): Promise<ResultadoCompras<ProductoCompraDTO[]>> {
  return ejecutar('LEER', (_u, db) => ControlRegistrarCompra.listarProductosDisponibles(db, filtros),
    'Productos cargados.', 'No se pudieron cargar los productos.')
}

export async function verificarDocumentoCompraAction(
  input: DocumentoCompraInput,
): Promise<ResultadoCompras<DisponibilidadDocumentoDTO>> {
  return ejecutar('LEER', (_u, db) => ControlRegistrarCompra.verificarDocumento(db, input),
    'Documento verificado.', 'No se pudo verificar el documento.')
}

export async function sugerirNumeroDocumentoCompraAction(
  tipoDocumento: 'FACTURA' | 'NOTA',
  proveedorId?: string | number | null,
): Promise<ResultadoCompras<string>> {
  return ejecutar(
    'LEER',
    (_u, db) =>
      ControlRegistrarCompra.sugerirNumeroDocumento(
        db,
        tipoDocumento,
        proveedorId ? Number(proveedorId) : null,
      ),
    'Número sugerido.',
    'No se pudo sugerir el número de documento.',
  )
}

export async function calcularResumenCompraAction(input: ResumenCompraInput): Promise<ResultadoCompras<ResumenCompraDTO>> {
  return ejecutar('LEER', () => ControlRegistrarCompra.calcularResumen(input),
    'Resumen calculado.', 'No se pudo calcular el total.')
}

// ------------------------------------------------------------------ registro

export async function registrarCompraAction(input: RegistrarCompraInput): Promise<ResultadoCompras<ComprobanteIngresoDTO>> {
  return ejecutar('CREAR', async (u, db) => ControlRegistrarCompra.registrarCompra(db, u.id, input, await ipCliente()),
    'Compra registrada. Stock y kárdex actualizados.', 'No se pudo registrar la compra.')
}

// ----------------------------------------------------------------- consultas

export async function listarComprasAction(
  filtros: FiltrosComprasInput = { limite: 50 },
): Promise<ResultadoCompras<CompraResumenDTO[]>> {
  return ejecutar('LEER', (_u, db) => ControlRegistrarCompra.listarCompras(db, filtros),
    'Compras cargadas.', 'No se pudieron cargar las compras.')
}

/** Detalle de la compra con los datos del comprobante de ingreso a almacén. */
export async function obtenerComprobanteIngresoAction(
  input: CompraIdInput,
): Promise<ResultadoCompras<ComprobanteIngresoDTO>> {
  return ejecutar('LEER', (_u, db) => ControlRegistrarCompra.obtenerComprobanteIngreso(db, input),
    'Comprobante cargado.', 'No se pudo cargar la compra.')
}
