'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getSupabaseServiceClient } from '@/lib/supabase/service'
import { obtenerIpOrigen } from '@/lib/ip'
import type { UsuarioConRol } from '@/lib/auth'
import type { Db } from '@/lib/supabase/types'
import {
  ControlGestionarInventario,
  ControlKardex,
  ErrorInventario,
  exigirAccesoInventario,
  type AccionInventario,
  type CategoriaDTO,
  type FiltrosProductosInput,
  type KardexProductoDTO,
  type ModificarProductoInput,
  type ProductoIdInput,
  type ProductoInventarioDTO,
  type RegistrarAjusteInput,
  type RegistrarCategoriaInput,
  type RegistrarInventarioInicialInput,
  type RegistrarProductoInput,
  type ResultadoInventario,
  type ResultadoMovimientoDTO,
} from '@/backend/inventario'

/**
 * Server Actions de CU16 — Gestionar Inventario y Movimientos de Kárdex.
 *
 * Cada acción es un punto de entrada público (POST directo): TODAS verifican
 * sesión y permisos en el servidor (exigirAccesoInventario), validan la
 * entrada con Zod y devuelven solo DTOs. La identidad del usuario se toma de
 * la sesión, nunca de los argumentos.
 *
 *   ADMINISTRADOR → todas.   ENCARGADO → solo consultas (LEER).   TÉCNICO → ninguna.
 */

const RUTA_INVENTARIO = '/inventario'

/** Mensaje para el usuario: validación Zod / error de negocio / genérico (sin detalles internos). */
function mensajeDeError(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback
  if (e instanceof ErrorInventario) return e.message
  console.error('[CU16] Error inesperado:', e)
  return fallback
}

/** IP de origen para la bitácora centralizada (CU06). */
async function ipCliente(): Promise<string | null> {
  return obtenerIpOrigen()
}

async function ejecutar<T>(
  accion: AccionInventario,
  operacion: (usuario: UsuarioConRol, db: Db) => Promise<T>,
  mensajeExito: string,
  mensajeFallo: string,
): Promise<ResultadoInventario<T>> {
  try {
    const usuario = await exigirAccesoInventario(accion)
    const data = await operacion(usuario, getSupabaseServiceClient())
    if (accion !== 'LEER') revalidatePath(RUTA_INVENTARIO)
    return { ok: true, mensaje: mensajeExito, data }
  } catch (e) {
    return { ok: false, mensaje: mensajeDeError(e, mensajeFallo) }
  }
}

// ------------------------------------------------------------------ consultas

export async function obtenerCatalogoAction(
  filtros: FiltrosProductosInput = {},
): Promise<ResultadoInventario<ProductoInventarioDTO[]>> {
  return ejecutar('LEER', (_u, db) => ControlGestionarInventario.obtenerCatalogo(db, filtros),
    'Catálogo cargado.', 'No se pudo cargar el catálogo.')
}

export async function listarStockCriticoAction(): Promise<ResultadoInventario<ProductoInventarioDTO[]>> {
  return ejecutar('LEER', (_u, db) => ControlGestionarInventario.listarStockCritico(db),
    'Productos con stock crítico.', 'No se pudo consultar el stock crítico.')
}

export async function listarCategoriasAction(): Promise<ResultadoInventario<CategoriaDTO[]>> {
  return ejecutar('LEER', (_u, db) => ControlGestionarInventario.listarCategorias(db),
    'Categorías cargadas.', 'No se pudieron cargar las categorías.')
}

export async function obtenerKardexAction(input: ProductoIdInput): Promise<ResultadoInventario<KardexProductoDTO>> {
  return ejecutar('LEER', (_u, db) => ControlGestionarInventario.obtenerKardex(db, input),
    'Kárdex cargado.', 'No se pudo cargar el kárdex.')
}

// ------------------------------------------------------------- catálogo (Admin)

export async function registrarProductoAction(input: RegistrarProductoInput): Promise<ResultadoInventario<ProductoInventarioDTO>> {
  return ejecutar('CREAR', (u, db) => ControlGestionarInventario.registrarProducto(db, u.id, input),
    'Producto registrado con stock 0.', 'No se pudo registrar el producto.')
}

export async function modificarProductoAction(input: ModificarProductoInput): Promise<ResultadoInventario<ProductoInventarioDTO>> {
  return ejecutar('ACTUALIZAR', (u, db) => ControlGestionarInventario.modificarProducto(db, u.id, input),
    'Producto actualizado.', 'No se pudo modificar el producto.')
}

export async function desactivarProductoAction(input: ProductoIdInput): Promise<ResultadoInventario<ProductoInventarioDTO>> {
  return ejecutar('ELIMINAR', (u, db) => ControlGestionarInventario.desactivarProducto(db, u.id, input),
    'Producto desactivado.', 'No se pudo desactivar el producto.')
}

export async function registrarCategoriaAction(input: RegistrarCategoriaInput): Promise<ResultadoInventario<CategoriaDTO>> {
  return ejecutar('CREAR', (u, db) => ControlGestionarInventario.registrarCategoria(db, u.id, input),
    'Categoría registrada.', 'No se pudo registrar la categoría.')
}

// ------------------------------------------------- movimientos de kárdex (Admin)

export async function registrarAjusteAction(input: RegistrarAjusteInput): Promise<ResultadoInventario<ResultadoMovimientoDTO>> {
  return ejecutar('PROCESAR', async (u, db) => ControlKardex.registrarAjuste(db, u.id, input, await ipCliente()),
    'Ajuste registrado.', 'No se pudo registrar el ajuste.')
}

export async function registrarInventarioInicialAction(
  input: RegistrarInventarioInicialInput,
): Promise<ResultadoInventario<ResultadoMovimientoDTO>> {
  return ejecutar('PROCESAR', async (u, db) => ControlKardex.registrarInventarioInicial(db, u.id, input, await ipCliente()),
    'Inventario inicial registrado.', 'No se pudo registrar el inventario inicial.')
}
