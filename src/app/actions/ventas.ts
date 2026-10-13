'use server';

/**
 * CU09 — Gestionar Ventas y Arqueo de Caja · Server Actions
 *
 * Reglas de esta capa:
 *  - El usuario SIEMPRE sale de la sesión del servidor (getCurrentUser, CU01),
 *    nunca de un parámetro: una Server Action es un endpoint público.
 *  - La IP se toma de las cabeceras de la petición y se guarda en bitacora.ip.
 *  - En un archivo 'use server' solo se exportan funciones async.
 *  - Respuesta uniforme: { ok: true, data, mensaje } | { ok: false, error }.
 */
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { getSupabaseServiceClient } from '@/lib/supabase/service';
import {
  VentaError,
  anularVenta as anularVentaService,
  buscarClienteMostrador,
  listarClientesVenta as listarClientesService,
  listarProductosVenta as listarProductosService,
  listarTurnosCerrados as listarTurnosService,
  listarVentasCaja,
  obtenerResumenCaja as obtenerResumenCajaService,
  generarNotaVentaPdf,
  obtenerNotaVenta,
  procesarAperturaOArqueo,
  registrarVentaDirecta,
  resumirCaja,
  verificarCajaAbierta,
  type Caja,
  type ClienteVenta,
  type ComprobanteVenta,
  type DatosVentas,
  type Db,
  type ProductoVenta,
  type RegistrarVentaInput,
  type ResultadoCaja,
  type ResumenArqueo,
} from '@/backend/ventas';

// ===========================================================================
// Tipos y contexto
// ===========================================================================
type RespuestaAccion<T> = { ok: true; data: T; mensaje: string } | { ok: false; error: string };

type Contexto = { db: Db; usuarioId: number; nombre: string; esAdmin: boolean; ip: string | null };

/** IP de origen de la petición (detrás de un proxy viene en x-forwarded-for) */
async function obtenerIp(): Promise<string | null> {
  const h = await headers();
  const reenviada = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return reenviada || h.get('x-real-ip') || null;
}

/**
 * Usuario de la sesión creada por loginAction (CU01):
 * createSession({ uid, nombre, correo, rol_id, rol, version }).
 * Se lee de forma defensiva (id o uid; rol como texto u objeto).
 */
async function contexto(): Promise<Contexto> {
  const u = (await getCurrentUser()) as any;
  const id = Number(u?.id ?? u?.uid);
  if (!u || !Number.isInteger(id) || id <= 0) throw new VentaError('Sesión expirada. Vuelva a iniciar sesión.');
  const rol: string = typeof u.rol === 'string' ? u.rol : (u.rol?.nombre ?? u.rol_nombre ?? '');
  return {
    db: getSupabaseServiceClient() as unknown as Db,
    usuarioId: id,
    nombre: u.nombre ?? u.correo ?? `Usuario #${id}`,
    esAdmin: /admin/i.test(rol),
    ip: await obtenerIp(),
  };
}

const exito = <T>(data: T, mensaje: string) => ({ ok: true as const, data, mensaje });

function falla(e: unknown, porDefecto: string) {
  if (e instanceof VentaError) return { ok: false as const, error: e.message };
  console.error('[CU09]', e);
  return { ok: false as const, error: porDefecto };
}

const numeroValido = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ===========================================================================
// Carga de la pantalla
// ===========================================================================

/** Todo lo que necesita page.tsx */
export async function obtenerDatosVentas(): Promise<RespuestaAccion<DatosVentas>> {
  try {
    const { db, usuarioId, nombre, esAdmin } = await contexto();
    const [caja, productos, clientes, clienteMostradorId] = await Promise.all([
      verificarCajaAbierta(db, usuarioId),
      listarProductosService(db),
      listarClientesService(db),
      buscarClienteMostrador(db),
    ]);
    const ventas = caja ? await listarVentasCaja(db, caja.id) : [];
    return exito(
      {
        usuario: { id: usuarioId, nombre, esAdmin },
        caja,
        resumen: caja ? resumirCaja(caja, ventas) : null,
        ventas,
        productos,
        clientes,
        cliente_mostrador_id: clienteMostradorId,
      },
      caja ? `Caja #${caja.id} abierta` : 'Sin caja abierta'
    );
  } catch (e) {
    return falla(e, 'Error al obtener datos de ventas');
  }
}

export async function listarProductosVenta(): Promise<RespuestaAccion<ProductoVenta[]>> {
  try {
    const { db } = await contexto();
    const productos = await listarProductosService(db);
    return exito(productos, `${productos.length} producto(s)`);
  } catch (e) {
    return falla(e, 'Error al listar productos');
  }
}

export async function listarClientesVenta(): Promise<RespuestaAccion<ClienteVenta[]>> {
  try {
    const { db } = await contexto();
    const clientes = await listarClientesService(db);
    return exito(clientes, `${clientes.length} cliente(s)`);
  } catch (e) {
    return falla(e, 'Error al listar clientes');
  }
}

// ===========================================================================
// Caja: apertura, resumen y arqueo/cierre
// ===========================================================================

/** Pasos 1-2: apertura con fondo inicial (registra APERTURA_CAJA) */
export async function abrirCaja(
  montoInicial: number | { monto_inicial: number }
): Promise<RespuestaAccion<ResultadoCaja>> {
  try {
    const monto = typeof montoInicial === 'object' ? montoInicial?.monto_inicial : montoInicial;
    if (!numeroValido(monto)) return { ok: false, error: 'Ingrese un fondo inicial válido' };

    const { db, usuarioId, ip } = await contexto();
    const resultado = await procesarAperturaOArqueo(db, { tipo: 'APERTURA', usuarioId, montoInicial: monto, ip });
    revalidatePath('/ventas');
    return exito(resultado, `Caja #${resultado.caja.id} abierta`);
  } catch (e) {
    return falla(e, 'Error al abrir caja');
  }
}

/** Resumen previo al conteo físico (efectivo esperado) */
export async function obtenerResumenArqueo(): Promise<RespuestaAccion<ResumenArqueo>> {
  try {
    const { db, usuarioId } = await contexto();
    const resumen = await obtenerResumenCajaService(db, usuarioId);
    if (!resumen) return { ok: false, error: 'No tiene una caja abierta' };
    return exito(resumen, 'Resumen del turno');
  } catch (e) {
    return falla(e, 'No se pudo obtener el resumen');
  }
}

/** Pasos 9-10: arqueo y cierre (si se indica cajaId de otro usuario, se rechaza) */
export async function cerrarCaja(params: {
  montoReal?: number;
  monto_final_real?: number;
  observacion?: string;
  cajaId?: number;
}): Promise<RespuestaAccion<ResultadoCaja>> {
  try {
    const monto = params?.montoReal ?? params?.monto_final_real;
    if (!numeroValido(monto)) return { ok: false, error: 'Ingrese el efectivo contado' };

    const { db, usuarioId, ip } = await contexto();
    const resultado = await procesarAperturaOArqueo(db, {
      tipo: 'ARQUEO',
      usuarioId,
      ip,
      montoReal: monto,
      observacion: params.observacion,
      cajaId: params.cajaId,
    });
    revalidatePath('/ventas');
    const d = resultado.diferencia ?? 0;
    const texto = d === 0 ? 'caja cuadrada' : d > 0 ? `sobrante Bs ${d.toFixed(2)}` : `faltante Bs ${Math.abs(d).toFixed(2)}`;
    return exito(resultado, `Caja #${resultado.caja.id} cerrada: ${texto}`);
  } catch (e) {
    return falla(e, 'Error al cerrar caja');
  }
}

/** Entrada genérica (apertura o arqueo) — sin usuarioId: lo pone la sesión */
export async function procesarCajaAction(
  cajaDTO:
    | { tipo: 'APERTURA'; montoInicial: number }
    | { tipo: 'ARQUEO'; montoReal: number; observacion?: string; cajaId?: number }
): Promise<RespuestaAccion<ResultadoCaja>> {
  if (cajaDTO?.tipo === 'APERTURA') return abrirCaja(cajaDTO.montoInicial);
  if (cajaDTO?.tipo === 'ARQUEO') return cerrarCaja(cajaDTO);
  return { ok: false, error: 'Operación de caja inválida' };
}

// ===========================================================================
// Ventas
// ===========================================================================

/** Pasos 3-7: venta atómica de productos (stock y kárdex: include CU16) */
export async function registrarVentaAction(input: RegistrarVentaInput): Promise<RespuestaAccion<ComprobanteVenta>> {
  try {
    const { db, usuarioId, ip } = await contexto();
    // usuarioId e ip van al final: el navegador no puede sobrescribirlos
    const comprobante = await registrarVentaDirecta(db, { ...(input as any), usuarioId, ip });
    revalidatePath('/ventas');
    return exito(comprobante, `Venta ${comprobante.nroComprobante} registrada`);
  } catch (e) {
    return falla(e, 'No se pudo registrar la venta');
  }
}

export async function registrarVenta(input: RegistrarVentaInput): Promise<RespuestaAccion<ComprobanteVenta>> {
  return registrarVentaAction(input);
}

/** Subflujo: anulación (solo turno abierto y del mismo usuario) */
export async function anularVentaAction(
  ventaId: number
): Promise<RespuestaAccion<{ ventaId: number; nroComprobante: string | null }>> {
  try {
    if (!Number.isInteger(ventaId) || ventaId <= 0) return { ok: false, error: 'Venta inválida' };
    const { db, usuarioId, ip } = await contexto();
    const resultado = await anularVentaService(db, { usuarioId, ventaId, ip });
    revalidatePath('/ventas');
    return exito(resultado, `${resultado.nroComprobante ?? 'Venta'} anulada; stock devuelto al inventario`);
  } catch (e) {
    return falla(e, 'No se pudo anular la venta');
  }
}

export async function anularVenta(
  ventaId: number
): Promise<RespuestaAccion<{ ventaId: number; nroComprobante: string | null }>> {
  return anularVentaAction(ventaId);
}

// ===========================================================================
// Subflujo: consulta de turnos cerrados (Administrador)
// ===========================================================================
export async function listarTurnosCerrados(limite = 20): Promise<RespuestaAccion<Caja[]>> {
  try {
    const { db, esAdmin } = await contexto();
    if (!esAdmin) return { ok: false, error: 'Solo el Administrador puede consultar los turnos cerrados' };
    const tope = Number.isInteger(limite) ? Math.min(Math.max(limite, 1), 100) : 20;
    const turnos = await listarTurnosService(db, tope);
    return exito(turnos, `${turnos.length} turno(s) cerrado(s)`);
  } catch (e) {
    return falla(e, 'Error al listar turnos cerrados');
  }
}

// ===========================================================================
// Paso 8: nota de venta en PDF
// ===========================================================================

/**
 * Devuelve el PDF de la nota de venta en base64 (las Server Actions no
 * pueden devolver binarios). El navegador lo convierte en archivo con
 * abrirNotaVentaPdf() de ventas-form.tsx.
 * Solo la puede obtener quien registró la venta o un Administrador.
 */
export async function descargarNotaVenta(
  ventaId: number
): Promise<RespuestaAccion<{ nombreArchivo: string; base64: string }>> {
  try {
    if (!Number.isInteger(ventaId) || ventaId <= 0) return { ok: false, error: 'Venta inválida' };
    const { db, usuarioId, esAdmin } = await contexto();
    const nota = await obtenerNotaVenta(db, ventaId);
    if (!nota) return { ok: false, error: 'La venta no existe' };
    if (nota.usuario_id !== usuarioId && !esAdmin) {
      return { ok: false, error: 'No tiene permiso para ver esta nota de venta' };
    }
    const bytes = await generarNotaVentaPdf(nota);
    return exito(
      { nombreArchivo: `${nota.nro_comprobante}.pdf`, base64: Buffer.from(bytes).toString('base64') },
      `Nota ${nota.nro_comprobante} generada`
    );
  } catch (e) {
    return falla(e, 'No se pudo generar la nota de venta');
  }
}
