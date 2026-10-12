'use server'

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import { 
  VentaError,
  anularVenta as anularVentaService,
  procesarAperturaOArqueo,
  registrarVentaDirecta,
  obtenerResumenCaja as obtenerResumenCajaService,
  listarProductosVenta as listarProductosService,
  listarClientesVenta as listarClientesService,
  listarTurnosCerrados as listarTurnosService,
  type Db,
  type Caja,
  type ResumenArqueo
} from '@/backend/ventas';

// Helper para obtener la IP del cliente de forma segura
async function getClientIpLocal(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return h.get('x-real-ip') ?? '0.0.0.0';
}

// Contexto base para las peticiones de ventas y caja
async function contexto(usuarioId = 1) {
  const db = getSupabaseServiceClient() as Db;
  const ip = await getClientIpLocal();
  return { db, usuarioId, ip };
}

function manejarError(e: unknown, porDefecto: string) {
  if (e instanceof VentaError) return { ok: false as const, error: e.message };
  console.error('[CU09 Action Error]', e);
  return { ok: false as const, error: (e as Error)?.message || porDefecto };
}

// ===========================================================================
// Acciones principales (Conectadas al Backend de Ventas)
// ===========================================================================

export async function registrarVentaAction(input: any, usuarioId = 1) {
  try {
    const { db, ip } = await contexto(usuarioId);
    const resultado = await registrarVentaDirecta(db, { ...input, usuarioId, ip });
    revalidatePath('/ventas');
    return { 
      ok: true as const, 
      data: resultado, 
      mensaje: '¡Venta registrada exitosamente!' 
    };
  } catch (e) {
    return manejarError(e, 'No se pudo registrar la venta');
  }
}

// Creamos un alias directo por si algún componente importa la función sin el sufijo 'Action'
export const registrarVenta = registrarVentaAction;

export async function procesarCajaAction(cajaDTO: any, usuarioId = 1) {
  try {
    const { db, ip } = await contexto(usuarioId);
    const resultado = await procesarAperturaOArqueo(db, { ...cajaDTO, usuarioId, ip });
    revalidatePath('/ventas');
    return { ok: true as const, data: resultado };
  } catch (e) {
    return manejarError(e, 'No se pudo procesar la caja');
  }
}

export async function anularVentaAction(ventaId: number, usuarioId = 1) {
  try {
    const { db, ip } = await contexto(usuarioId);
    const resultado = await anularVentaService(db, { usuarioId, ventaId, ip });
    revalidatePath('/ventas');
    return { ok: true as const, data: resultado };
  } catch (e) {
    return manejarError(e, 'No se pudo anular la venta');
  }
}

// ===========================================================================
// Adaptadores exactos con Tipado Estricto para arqueo-modal.tsx
// ===========================================================================

type RespuestaAccion<T> = 
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function abrirCaja(montoInicial: number | { monto_inicial: number }): Promise<RespuestaAccion<{ caja: Caja }>> {
  try {
    const { db, usuarioId, ip } = await contexto();
    const monto = typeof montoInicial === 'object' ? montoInicial.monto_inicial : montoInicial;
    
    const dto: any = {
      tipo: 'APERTURA',
      montoInicial: monto,
      usuarioId,
      ip,
    };

    const resultado = await procesarAperturaOArqueo(db, dto);
    
    revalidatePath('/ventas');
    return { ok: true, data: { caja: resultado as unknown as Caja } };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Error al abrir caja' };
  }
}

export async function cerrarCaja(params: { montoReal?: number; monto_final_real?: number; observacion?: string }): Promise<RespuestaAccion<{ caja: Caja }>> {
  try {
    const { db, usuarioId, ip } = await contexto();
    const monto = params.montoReal ?? params.monto_final_real ?? 0;
    
    const dto: any = {
      tipo: 'ARQUEO',
      montoReal: monto,
      observacion: params.observacion,
      usuarioId,
      ip,
    };

    const resultado = await procesarAperturaOArqueo(db, dto);
    
    revalidatePath('/ventas');
    return { ok: true, data: { caja: resultado as unknown as Caja } };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Error al cerrar caja' };
  }
}

export async function obtenerResumenArqueo(): Promise<RespuestaAccion<ResumenArqueo>> {
  try {
    const { db, usuarioId } = await contexto();
    const resumen = await obtenerResumenCajaService(db, usuarioId) as ResumenArqueo;
    return { ok: true, data: resumen };
  } catch (e: any) {
    return { ok: false, error: e.message || 'No se pudo obtener el resumen' };
  }
}
// ===========================================================================
// Adaptadores avanzados con estructura { ok, data } para page.tsx
// ===========================================================================

export async function anularVenta(ventaId: number) {
  try {
    const { db, usuarioId, ip } = await contexto();
    const resultado = await anularVentaService(db, { usuarioId, ventaId, ip });
    revalidatePath('/ventas');
    return { ok: true as const, data: resultado };
  } catch (e: any) {
    return { ok: false as const, error: e.message || 'No se pudo anular la venta' };
  }
}

export async function listarTurnosCerrados(limite = 20) {
  try {
    const { db, usuarioId } = await contexto();
    const turnos = await listarTurnosService(db, usuarioId);
    return { ok: true as const, data: turnos };
  } catch (e: any) {
    return { ok: false as const, error: e.message || 'Error al listar turnos cerrados' };
  }
}

export async function listarProductosVenta() {
  try {
    const { db } = await contexto();
    const productos = await listarProductosService(db);
    return { ok: true as const, data: productos };
  } catch (e: any) {
    return { ok: false as const, error: e.message || 'Error al listar productos' };
  }
}

export async function listarClientesVenta() {
  try {
    const { db } = await contexto();
    const clientes = await listarClientesService(db);
    return { ok: true as const, data: clientes };
  } catch (e: any) {
    return { ok: false as const, error: e.message || 'Error al listar clientes' };
  }
}

export async function obtenerDatosVentas() {
  try {
    const { db, usuarioId } = await contexto();
    const [productos, clientes, resumenCaja] = await Promise.all([
      listarProductosService(db),
      listarClientesService(db),
      obtenerResumenCajaService(db, usuarioId).catch(() => null)
    ]);
    
    return {
      ok: true as const,
      data: {
        productos,
        clientes,
        caja: resumenCaja,
        resumen: resumenCaja
      } as any 
    };
  } catch (e: any) {
    return { ok: false as const, error: e.message || 'Error al obtener datos de ventas' };
  }
}