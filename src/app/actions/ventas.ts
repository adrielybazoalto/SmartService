'use server';

/**
 * CU09 — Gestionar Ventas en Mostrador y Arqueo de Caja
 * Tablas (diccionario de datos): caja, venta, detalle_venta, producto,
 * movimiento_kardex, cliente, bitacora.
 */

import { revalidatePath } from 'next/cache';
import {
  actualizarTolerante,
  getClientIp,
  getSupabase,
  getUsuarioSesion,
  insertarTolerante,
  registrarBitacora,
  type UsuarioSesion,
} from './bitacora';

// ===========================================================================
// Tipos (los tipos sí pueden exportarse desde un archivo 'use server')
// ===========================================================================
export type TipoPago = 'EFECTIVO' | 'QR' | 'TARJETA' | 'TRANSFERENCIA';
export type TipoComprobante = 'NOTA_VENTA' | 'RECIBO' | 'FACTURA';

export type ActionResult<T = undefined> =
  | { ok: true; data: T; mensaje?: string }
  | { ok: false; error: string };

export type ProductoVenta = {
  id: number;
  nombre: string;
  unidad_medida: string | null;
  stock_disponible: number;
  stock_minimo: number;
  precio_venta: number;
};

export type ClienteVenta = {
  id: number;
  razon_social: string;
  documento_identidad: string | null;
};

export type Caja = {
  id: number;
  usuario_id: number;
  usuario_nombre?: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  monto_inicial: number;
  monto_final_sistema: number | null;
  monto_final_real: number | null;
  monto_diferencia?: number | null;
  observacion?: string | null;
  estado: 'ABIERTA' | 'CERRADA' | string;
};

export type VentaResumen = {
  id: number;
  nro_comprobante: string | null;
  fecha_emision: string;
  cliente_nombre: string;
  tipo_pago: TipoPago;
  tipo_comprobante: string | null;
  subtotal: number;
  descuento: number;
  total: number;
  estado: string;
  items: number;
};

export type ResumenArqueo = {
  caja: Caja;
  totales_por_pago: Record<TipoPago, number>;
  cantidad_ventas: number;
  cantidad_anuladas: number;
  total_vendido: number;
  efectivo_esperado: number;
};

export type DatosVentas = {
  usuario: { id: number; nombre: string };
  caja: Caja | null;
  resumen: ResumenArqueo | null;
  ventas: VentaResumen[];
  productos: ProductoVenta[];
  clientes: ClienteVenta[];
  cliente_mostrador_id: number | null;
};

export type RegistrarVentaInput = {
  cliente_id?: number | null;
  tipo_pago: TipoPago;
  tipo_comprobante: TipoComprobante;
  descuento?: number;
  items: { producto_id: number; cantidad: number }[];
};

export type VentaRegistrada = {
  id: number;
  nro_comprobante: string;
  subtotal: number;
  descuento: number;
  total: number;
};

// ===========================================================================
// Helpers internos (no exportados → no son endpoints)
// ===========================================================================
const TIPOS_PAGO: TipoPago[] = ['EFECTIVO', 'QR', 'TARJETA', 'TRANSFERENCIA'];
const TIPOS_COMPROBANTE: TipoComprobante[] = ['NOTA_VENTA', 'RECIBO', 'FACTURA'];
const CLIENTE_MOSTRADOR = 'Cliente de mostrador';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round(n * 100) / 100;

/** precio de venta = precio_compra_actual × (1 + margen_ganancia / 100) */
const precioVenta = (p: any) => r2(num(p.precio_compra_actual) * (1 + num(p.margen_ganancia) / 100));

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function mensajeError(e: any, porDefecto: string): string {
  const msg: string = e?.message ?? '';
  if (!msg) return porDefecto;
  if (/ux_caja_usuario_abierta/.test(msg)) return 'El usuario ya tiene una caja abierta';
  if (/ux_venta_nro_comprobante/.test(msg)) return 'Conflicto de correlativo, intente nuevamente';
  return msg;
}

/** Función RPC no instalada todavía (migración pendiente) */
const rpcNoExiste = (error: any) =>
  !!error && (error.code === 'PGRST202' || error.code === '42883' || /Could not find the function/i.test(error.message ?? ''));

async function requireUsuario(): Promise<UsuarioSesion> {
  const u = await getUsuarioSesion();
  if (!u) throw new Error('Sesión expirada. Vuelva a iniciar sesión.');
  return u;
}

function mapCaja(row: any): Caja {
  return {
    id: row.id,
    usuario_id: row.usuario_id,
    usuario_nombre: row.usuario?.nombre ?? undefined,
    fecha_apertura: row.fecha_apertura,
    fecha_cierre: row.fecha_cierre ?? null,
    monto_inicial: num(row.monto_inicial),
    monto_final_sistema: row.monto_final_sistema == null ? null : num(row.monto_final_sistema),
    monto_final_real: row.monto_final_real == null ? null : num(row.monto_final_real),
    monto_diferencia: row.monto_diferencia == null ? null : num(row.monto_diferencia),
    observacion: row.observacion ?? null,
    estado: row.estado,
  };
}

async function obtenerCajaAbierta(usuarioId: number): Promise<Caja | null> {
  const { data, error } = await getSupabase()
    .from('caja')
    .select('*')
    .eq('usuario_id', usuarioId)
    .eq('estado', 'ABIERTA')
    .order('fecha_apertura', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapCaja(data) : null;
}

async function listarVentasDeCaja(cajaId: number): Promise<VentaResumen[]> {
  const { data, error } = await getSupabase()
    .from('venta')
    .select('*, cliente:cliente_id(razon_social), detalle_venta(id)')
    .eq('caja_id', cajaId)
    .order('id', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[]).map((v: any) => ({
    id: v.id,
    nro_comprobante: v.nro_comprobante ?? null,
    fecha_emision: v.fecha_emision,
    cliente_nombre: v.cliente?.razon_social ?? '—',
    tipo_pago: (v.tipo_pago ?? 'EFECTIVO') as TipoPago,
    tipo_comprobante: v.tipo_comprobante ?? null,
    subtotal: num(v.subtotal),
    descuento: num(v.descuento),
    total: num(v.total),
    estado: v.estado ?? 'EMITIDA',
    items: Array.isArray(v.detalle_venta) ? v.detalle_venta.length : 0,
  }));
}

function calcularResumen(caja: Caja, ventas: VentaResumen[]): ResumenArqueo {
  const totales: Record<TipoPago, number> = { EFECTIVO: 0, QR: 0, TARJETA: 0, TRANSFERENCIA: 0 };
  let emitidas = 0;
  let anuladas = 0;
  for (const v of ventas) {
    if (v.estado === 'ANULADA') {
      anuladas++;
      continue;
    }
    emitidas++;
    const tp = TIPOS_PAGO.includes(v.tipo_pago) ? v.tipo_pago : 'EFECTIVO';
    totales[tp] = r2(totales[tp] + v.total);
  }
  const total = r2(Object.values(totales).reduce((a, b) => a + b, 0));
  return {
    caja,
    totales_por_pago: totales,
    cantidad_ventas: emitidas,
    cantidad_anuladas: anuladas,
    total_vendido: total,
    // Solo el efectivo físico entra en el arqueo; QR/tarjeta/transferencia van a banco
    efectivo_esperado: r2(caja.monto_inicial + totales.EFECTIVO),
  };
}

async function obtenerClienteMostradorId(): Promise<number | null> {
  const db = getSupabase();
  const { data } = await db
    .from('cliente')
    .select('id')
    .ilike('razon_social', CLIENTE_MOSTRADOR)
    .limit(1)
    .maybeSingle();
  if (data) return (data as any).id;
  const { data: nuevo } = await insertarTolerante<{ id: number }>(
    'cliente',
    { tipo_cliente: 'NATURAL', razon_social: CLIENTE_MOSTRADOR, documento_identidad: '0' },
    'id'
  );
  return nuevo?.id ?? null;
}

// ===========================================================================
// Server Actions
// ===========================================================================

/** Carga todo lo que necesita la pantalla de Ventas en Mostrador */
export async function obtenerDatosVentas(): Promise<ActionResult<DatosVentas>> {
  try {
    const usuario = await requireUsuario();
    const db = getSupabase();

    const [caja, productosRes, clientesRes, clienteMostradorId] = await Promise.all([
      obtenerCajaAbierta(usuario.id),
      db.from('producto').select('*').order('nombre'),
      db.from('cliente').select('id, razon_social, documento_identidad').order('razon_social').limit(500),
      obtenerClienteMostradorId(),
    ]);
    if (productosRes.error) throw new Error(productosRes.error.message);
    if (clientesRes.error) throw new Error(clientesRes.error.message);

    const ventas = caja ? await listarVentasDeCaja(caja.id) : [];

    return {
      ok: true,
      data: {
        usuario: { id: usuario.id, nombre: usuario.nombre },
        caja,
        resumen: caja ? calcularResumen(caja, ventas) : null,
        ventas,
        productos: (productosRes.data ?? []).map((p: any) => ({
          id: p.id,
          nombre: p.nombre,
          unidad_medida: p.unidad_medida ?? null,
          stock_disponible: num(p.stock_disponible),
          stock_minimo: num(p.stock_minimo),
          precio_venta: precioVenta(p),
        })),
        clientes: (clientesRes.data ?? []) as ClienteVenta[],
        cliente_mostrador_id: clienteMostradorId,
      },
    };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudieron cargar los datos de ventas'));
  }
}

/** CU09 pasos 1-2: abrir turno de caja con fondo inicial */
export async function abrirCaja(montoInicial: number): Promise<ActionResult<Caja>> {
  try {
    const usuario = await requireUsuario();
    const monto = r2(num(montoInicial));
    if (!Number.isFinite(Number(montoInicial)) || monto < 0) return fail('El fondo inicial debe ser un monto válido (≥ 0)');

    if (await obtenerCajaAbierta(usuario.id)) return fail('El usuario ya tiene una caja abierta');

    const { data, error } = await insertarTolerante('caja', {
      usuario_id: usuario.id,
      monto_inicial: monto,
      estado: 'ABIERTA',
    });
    if (error || !data) return fail(mensajeError(error, 'No se pudo abrir la caja'));

    await registrarBitacora({
      usuario_id: usuario.id,
      accion: 'APERTURA_CAJA',
      descripcion: `Apertura de caja #${(data as any).id} con fondo inicial Bs ${monto.toFixed(2)}`,
    });

    revalidatePath('/ventas');
    return { ok: true, data: mapCaja(data), mensaje: 'Caja abierta correctamente' };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo abrir la caja'));
  }
}

/** CU09 pasos 3-7: registrar venta + detalle + stock + kárdex + bitácora */
export async function registrarVenta(input: RegistrarVentaInput): Promise<ActionResult<VentaRegistrada>> {
  try {
    const usuario = await requireUsuario();
    const ip = await getClientIp();

    // ---- Validaciones de entrada --------------------------------------
    if (!TIPOS_PAGO.includes(input.tipo_pago)) return fail('Método de pago inválido');
    if (!TIPOS_COMPROBANTE.includes(input.tipo_comprobante)) return fail('Tipo de comprobante inválido');
    const descuento = r2(num(input.descuento ?? 0));
    if (descuento < 0) return fail('El descuento no puede ser negativo');

    // Agrupa líneas repetidas del mismo producto
    const agrupado = new Map<number, number>();
    for (const it of input.items ?? []) {
      const id = Number(it.producto_id);
      const cant = Number(it.cantidad);
      if (!Number.isInteger(id) || id <= 0) return fail('Producto inválido');
      if (!Number.isInteger(cant) || cant <= 0) return fail('Las cantidades deben ser enteros mayores a 0');
      agrupado.set(id, (agrupado.get(id) ?? 0) + cant);
    }
    if (agrupado.size === 0) return fail('Agregue al menos un producto a la venta');
    const items = [...agrupado.entries()].map(([producto_id, cantidad]) => ({ producto_id, cantidad }));

    const clienteId = input.cliente_id ?? (await obtenerClienteMostradorId());
    if (!clienteId) return fail('No se encontró el cliente de la venta');

    // ---- Camino principal: función transaccional en PostgreSQL ----------
    const db = getSupabase();
    const { data: rpcData, error: rpcError } = await db.rpc('fn_registrar_venta', {
      p_usuario_id: usuario.id,
      p_cliente_id: clienteId,
      p_tipo_pago: input.tipo_pago,
      p_tipo_comprobante: input.tipo_comprobante,
      p_descuento: descuento,
      p_items: items,
      p_ip: ip,
    } as any);

    if (!rpcError && rpcData) {
      const v = rpcData as any;
      revalidatePath('/ventas');
      return {
        ok: true,
        data: {
          id: v.id,
          nro_comprobante: v.nro_comprobante,
          subtotal: num(v.subtotal),
          descuento: num(v.descuento),
          total: num(v.total),
        },
        mensaje: `Venta ${v.nro_comprobante} registrada`,
      };
    }
    if (rpcError && !rpcNoExiste(rpcError)) return fail(mensajeError(rpcError, 'No se pudo registrar la venta'));

    // ---- Respaldo: la migración aún no instaló fn_registrar_venta --------
    const res = await registrarVentaSinRpc(usuario.id, clienteId, input, descuento, items, ip);
    if (res.ok) revalidatePath('/ventas');
    return res;
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo registrar la venta'));
  }
}

/**
 * Respaldo con compensación manual (rollback lógico) cuando la función SQL
 * todavía no existe. El descuento de stock usa control optimista
 * (UPDATE ... WHERE stock_disponible = valor_leído) para no pisar ventas
 * concurrentes. Cuando la migración esté aplicada este camino no se usa.
 */
async function registrarVentaSinRpc(
  usuarioId: number,
  clienteId: number,
  input: RegistrarVentaInput,
  descuento: number,
  items: { producto_id: number; cantidad: number }[],
  ip: string
): Promise<ActionResult<VentaRegistrada>> {
  const db = getSupabase();

  const caja = await obtenerCajaAbierta(usuarioId);
  if (!caja) return fail('Debe abrir un turno de caja antes de vender');

  const { data: prods, error: pErr } = await db
    .from('producto')
    .select('*')
    .in('id', items.map((i) => i.producto_id));
  if (pErr) return fail(pErr.message);
  const porId = new Map<number, any>((prods ?? []).map((p: any) => [p.id, p]));

  let subtotal = 0;
  const lineas = items.map((it) => {
    const p = porId.get(it.producto_id);
    if (!p) throw new Error(`Producto ${it.producto_id} no existe`);
    if (num(p.stock_disponible) < it.cantidad) {
      throw new Error(`Stock insuficiente para "${p.nombre}": disponible ${num(p.stock_disponible)}, solicitado ${it.cantidad}`);
    }
    const precio = precioVenta(p);
    const sub = r2(precio * it.cantidad);
    subtotal = r2(subtotal + sub);
    return { ...it, nombre: p.nombre as string, stock_anterior: num(p.stock_disponible), precio, sub };
  });
  if (descuento > subtotal) return fail('El descuento no puede ser mayor al subtotal');
  const total = r2(subtotal - descuento);

  // Correlativo NV-AAAA-00001
  const anio = new Date().getFullYear();
  const { data: ultima } = await db
    .from('venta')
    .select('nro_comprobante')
    .like('nro_comprobante', `NV-${anio}-%`)
    .order('nro_comprobante', { ascending: false })
    .limit(1)
    .maybeSingle();
  const seq = Number(String((ultima as any)?.nro_comprobante ?? '').split('-')[2] ?? 0) + 1;
  const nro = `NV-${anio}-${String(seq).padStart(5, '0')}`;

  // Cabecera
  const { data: venta, error: vErr } = await insertarTolerante<any>('venta', {
    caja_id: caja.id,
    cliente_id: clienteId,
    usuario_id: usuarioId,
    tipo_comprobante: input.tipo_comprobante,
    nro_comprobante: nro,
    subtotal,
    descuento,
    total,
    estado: 'EMITIDA',
    tipo_pago: input.tipo_pago,
  });
  if (vErr || !venta) return fail(mensajeError(vErr, 'No se pudo registrar la venta'));

  const deshacer = async (stocksAplicados: { id: number; anterior: number }[]) => {
    for (const s of stocksAplicados) {
      await db.from('producto').update({ stock_disponible: s.anterior } as any).eq('id', s.id);
    }
    await db.from('detalle_venta').delete().eq('venta_id', venta.id);
    await db.from('venta').delete().eq('id', venta.id);
  };

  // Detalle
  const { error: dErr } = await db.from('detalle_venta').insert(
    lineas.map((l) => ({
      venta_id: venta.id,
      producto_id: l.producto_id,
      cantidad: l.cantidad,
      precio_unitario: l.precio,
      subtotal: l.sub,
    })) as any
  );
  if (dErr) {
    await deshacer([]);
    return fail(dErr.message);
  }

  // Stock (optimista)
  const aplicados: { id: number; anterior: number }[] = [];
  for (const l of lineas) {
    const { data: upd, error: uErr } = await db
      .from('producto')
      .update({ stock_disponible: l.stock_anterior - l.cantidad } as any)
      .eq('id', l.producto_id)
      .eq('stock_disponible', l.stock_anterior)
      .select('id');
    if (uErr || !upd || upd.length === 0) {
      await deshacer(aplicados);
      return fail(`El stock de "${l.nombre}" cambió durante la venta. Intente nuevamente.`);
    }
    aplicados.push({ id: l.producto_id, anterior: l.stock_anterior });
  }

  // Kárdex SALIDA
  const { error: kErr } = await db.from('movimiento_kardex').insert(
    lineas.map((l) => ({
      producto_id: l.producto_id,
      usuario_id: usuarioId,
      tipo_movimiento: 'SALIDA',
      cantidad: l.cantidad,
      stock_anterior: l.stock_anterior,
      origen_movimiento: 'VENTA',
      observacion: `Venta ${nro}`,
    })) as any
  );
  if (kErr) {
    await deshacer(aplicados);
    return fail(`No se pudo registrar el kárdex: ${kErr.message}`);
  }

  await registrarBitacora({
    usuario_id: usuarioId,
    accion: 'REGISTRO_VENTA',
    descripcion: `Venta ${nro} por Bs ${total.toFixed(2)} (${input.tipo_pago})`,
    ip,
  });

  return { ok: true, data: { id: venta.id, nro_comprobante: nro, subtotal, descuento, total }, mensaje: `Venta ${nro} registrada` };
}

/** Subflujo CU09: anular venta del turno abierto (devuelve stock con ENTRADA en kárdex) */
export async function anularVenta(ventaId: number): Promise<ActionResult<{ nro_comprobante: string }>> {
  try {
    const usuario = await requireUsuario();
    const ip = await getClientIp();
    const db = getSupabase();

    const { data, error } = await db.rpc('fn_anular_venta', {
      p_usuario_id: usuario.id,
      p_venta_id: ventaId,
      p_ip: ip,
    } as any);
    if (!error && data) {
      revalidatePath('/ventas');
      return { ok: true, data: { nro_comprobante: (data as any).nro_comprobante }, mensaje: 'Venta anulada y stock devuelto' };
    }
    if (error && !rpcNoExiste(error)) return fail(mensajeError(error, 'No se pudo anular la venta'));

    // ---- Respaldo sin función SQL ---------------------------------------
    const { data: venta, error: vErr } = await db
      .from('venta')
      .select('*, caja:caja_id(id, estado, usuario_id), detalle_venta(producto_id, cantidad)')
      .eq('id', ventaId)
      .maybeSingle();
    if (vErr) return fail(vErr.message);
    if (!venta) return fail('La venta no existe');
    const v = venta as any;
    if (v.estado === 'ANULADA') return fail('La venta ya está anulada');
    if (v.caja?.estado !== 'ABIERTA') return fail('No se puede anular una venta de un turno cerrado');
    if (v.caja?.usuario_id !== usuario.id) return fail('Solo el titular del turno puede anular sus ventas');

    // Marca primero como ANULADA (condicional) para evitar doble anulación concurrente
    const { data: marcada } = await db
      .from('venta')
      .update({ estado: 'ANULADA' } as any)
      .eq('id', ventaId)
      .neq('estado', 'ANULADA')
      .select('id');
    if (!marcada || marcada.length === 0) return fail('La venta ya fue anulada');

    for (const d of (v.detalle_venta ?? []) as any[]) {
      if (!d.producto_id) continue;
      for (let intento = 0; intento < 3; intento++) {
        const { data: p } = await db.from('producto').select('stock_disponible').eq('id', d.producto_id).single();
        const anterior = num((p as any)?.stock_disponible);
        const { data: upd } = await db
          .from('producto')
          .update({ stock_disponible: anterior + num(d.cantidad) } as any)
          .eq('id', d.producto_id)
          .eq('stock_disponible', anterior)
          .select('id');
        if (upd && upd.length) {
          await db.from('movimiento_kardex').insert({
            producto_id: d.producto_id,
            usuario_id: usuario.id,
            tipo_movimiento: 'ENTRADA',
            cantidad: num(d.cantidad),
            stock_anterior: anterior,
            origen_movimiento: 'ANULACION_VENTA',
            observacion: `Anulación ${v.nro_comprobante ?? ventaId}`,
          } as any);
          break;
        }
      }
    }

    await registrarBitacora({
      usuario_id: usuario.id,
      accion: 'ANULAR_VENTA',
      descripcion: `Venta ${v.nro_comprobante ?? ventaId} anulada`,
      ip,
    });
    revalidatePath('/ventas');
    return { ok: true, data: { nro_comprobante: v.nro_comprobante }, mensaje: 'Venta anulada y stock devuelto' };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo anular la venta'));
  }
}

/** Resumen previo al cierre: efectivo esperado por método de pago */
export async function obtenerResumenArqueo(): Promise<ActionResult<ResumenArqueo>> {
  try {
    const usuario = await requireUsuario();
    const caja = await obtenerCajaAbierta(usuario.id);
    if (!caja) return fail('No tiene una caja abierta');
    return { ok: true, data: calcularResumen(caja, await listarVentasDeCaja(caja.id)) };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo calcular el arqueo'));
  }
}

/** CU09 pasos 9-10: arqueo y cierre de caja */
export async function cerrarCaja(input: {
  monto_final_real: number;
  observacion?: string;
}): Promise<ActionResult<Caja>> {
  try {
    const usuario = await requireUsuario();
    const contado = r2(num(input.monto_final_real));
    if (!Number.isFinite(Number(input.monto_final_real)) || contado < 0) {
      return fail('Ingrese el efectivo contado (monto ≥ 0)');
    }

    // Solo se cierra la caja propia (excepción "cerrar caja de otro usuario")
    const caja = await obtenerCajaAbierta(usuario.id);
    if (!caja) return fail('No tiene una caja abierta para cerrar');

    const resumen = calcularResumen(caja, await listarVentasDeCaja(caja.id));
    const diferencia = r2(contado - resumen.efectivo_esperado);
    const observacion = (input.observacion ?? '').trim();
    if (diferencia !== 0 && observacion.length < 5) {
      return fail('Hay diferencia en el arqueo: registre una observación que la justifique');
    }

    const { data, error } = await actualizarTolerante(
      'caja',
      {
        fecha_cierre: new Date().toISOString(),
        monto_final_sistema: resumen.efectivo_esperado,
        monto_final_real: contado,
        monto_diferencia: diferencia,
        observacion: observacion || null,
        estado: 'CERRADA',
      },
      { columna: 'id', valor: caja.id }
    );
    if (error || !data) return fail(mensajeError(error, 'No se pudo cerrar la caja'));

    const tipoDif = diferencia === 0 ? 'cuadrada' : diferencia > 0 ? 'sobrante' : 'faltante';
    await registrarBitacora({
      usuario_id: usuario.id,
      accion: 'ARQUEO_CAJA',
      descripcion:
        `Cierre de caja #${caja.id}: esperado Bs ${resumen.efectivo_esperado.toFixed(2)}, ` +
        `contado Bs ${contado.toFixed(2)}, diferencia Bs ${diferencia.toFixed(2)} (${tipoDif}). ` +
        `Ventas: ${resumen.cantidad_ventas}, total Bs ${resumen.total_vendido.toFixed(2)}` +
        (observacion ? `. Obs: ${observacion}` : ''),
    });

    revalidatePath('/ventas');
    // Devuelve también la diferencia aunque la columna aún no exista en BD
    return {
      ok: true,
      data: { ...mapCaja(data), monto_diferencia: diferencia, observacion: observacion || null },
      mensaje: 'Caja cerrada correctamente',
    };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudo cerrar la caja'));
  }
}

/** Subflujo "Consultar turnos": turnos cerrados con su diferencia de arqueo */
export async function listarTurnosCerrados(limite = 20): Promise<ActionResult<Caja[]>> {
  try {
    await requireUsuario();
    const { data, error } = await getSupabase()
      .from('caja')
      .select('*, usuario:usuario_id(nombre)')
      .eq('estado', 'CERRADA')
      .order('fecha_cierre', { ascending: false })
      .limit(Math.min(Math.max(1, limite), 100));
    if (error) return fail(error.message);
    return {
      ok: true,
      data: ((data ?? []) as any[]).map((row: any) => {
        const c = mapCaja(row);
        if (c.monto_diferencia == null && c.monto_final_real != null && c.monto_final_sistema != null) {
          c.monto_diferencia = r2(c.monto_final_real - c.monto_final_sistema);
        }
        return c;
      }),
    };
  } catch (e: any) {
    return fail(mensajeError(e, 'No se pudieron cargar los turnos'));
  }
}
