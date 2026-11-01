// =====================================================================
//  CU13 - Emitir Notas de Servicio y Liquidación Operativa
//  ACCESO A DATOS (repositorio): todas las consultas a Supabase del CU13.
//  Cada función corresponde a una operación de las entidades del
//  diagrama de análisis (OrdenTrabajo, DetalleConsumoMaterial,
//  Producto, Servicio, NotaServicio, Bitacora).
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { horasEntre } from "@/backend/asignaciones/disponibilidad";
import { obtenerUsuarioSesion } from "./integracion";
import { verificarOrdenLiquidable } from "./reglas";
import {
  type CalculoLiquidacion,
  type MaterialConsumido,
  type NotaPendientePago,
  type NotaServicio,
  type OrdenPendienteLiquidar,
  type Servicio,
  type UsuarioSesion,
} from "./types";

const COLUMNAS_ORDEN = `
  id, codigo_orden, tipo_trabajo, estado, fecha_inicio_real, fecha_fin_real, cotizacion_id,
  cotizacion ( numero_cotizacion, anticipo_monto, anticipo_metodo, anticipo_referencia, anticipo_fecha, anticipo_stripe_session_id, cliente ( nombre ) ),
  nota_servicio ( id )
`;

// PostgREST devuelve una relación como objeto o como arreglo según la FK.
function primero<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

export /** Horas efectivas = fin real - inicio real (mismo cálculo que el SQL). */
function calcularHoras(inicio: string | null, fin: string | null): number {
  return Math.max(0, horasEntre(inicio, fin) ?? 0);
}

type OrdenConNota = OrdenPendienteLiquidar & { tieneNota: boolean };

// Columnas de nota_servicio que usa el CU13 (incluye las del pago con tarjeta)
const COLUMNAS_NOTA =
  "id, orden_trabajo_id, numero_nota, anticipo_pagado, fecha_emision, estado, monto_total, metodo_pago, fecha_pago, referencia_pago";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapearNota(fila: any): NotaServicio {
  return {
    id: fila.id,
    orden_trabajo_id: fila.orden_trabajo_id,
    numero_nota: fila.numero_nota,
    anticipo_pagado: Number(fila.anticipo_pagado),
    fecha_emision: fila.fecha_emision,
    estado: fila.estado,
    monto_total: Number(fila.monto_total),
    metodo_pago: fila.metodo_pago ?? null,
    fecha_pago: fila.fecha_pago ?? null,
    referencia_pago: fila.referencia_pago ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapearOrden(fila: any): OrdenConNota {
  const cotizacion = primero(fila.cotizacion);
  const cliente = cotizacion ? primero(cotizacion.cliente) : null;
  const nota = fila.nota_servicio;
  return {
    id: fila.id,
    codigo_orden: fila.codigo_orden,
    tipo_trabajo: fila.tipo_trabajo,
    estado: fila.estado,
    fecha_inicio_real: fila.fecha_inicio_real,
    fecha_fin_real: fila.fecha_fin_real,
    horas_trabajadas: calcularHoras(fila.fecha_inicio_real, fila.fecha_fin_real),
    cotizacion_id: fila.cotizacion_id,
    numero_cotizacion: cotizacion?.numero_cotizacion ?? null,
    cliente_nombre: cliente?.nombre ?? null,
    anticipo_cotizacion: cotizacion
      ? {
          monto: Number(cotizacion.anticipo_monto ?? 0),
          metodo: cotizacion.anticipo_metodo ?? null,
          referencia:
            cotizacion.anticipo_referencia ??
            (cotizacion.anticipo_stripe_session_id ? `…${cotizacion.anticipo_stripe_session_id.slice(-8)}` : null),
          fecha: cotizacion.anticipo_fecha ?? null,
        }
      : null,
    tieneNota: Array.isArray(nota) ? nota.length > 0 : Boolean(nota),
  };
}

export class LiquidacionRepositorio {
  constructor(private readonly db: SupabaseClient) {}

  /** OrdenTrabajo: órdenes FINALIZADAS (terminadas en el CU12) sin nota de servicio. */
  async listarOrdenesSinNota(): Promise<OrdenPendienteLiquidar[]> {
    const { data, error } = await this.db
      .from("orden_trabajo")
      .select(COLUMNAS_ORDEN)
      .ilike("estado", "finalizada")
      .order("fecha_fin_real", { ascending: false });

    if (error) throw new Error(`No se pudieron listar las órdenes: ${error.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filas: any[] = data ?? [];
    return filas
      .map(mapearOrden)
      .filter((o: OrdenConNota) => !o.tieneNota)
      .map((o: OrdenConNota) => verificarOrdenLiquidable(o));
  }

  /** OrdenTrabajo.verificarFinalizada: obtiene la orden con su estado. */
  async obtenerOrden(ordenTrabajoId: number): Promise<OrdenConNota | null> {
    const { data, error } = await this.db
      .from("orden_trabajo")
      .select(COLUMNAS_ORDEN)
      .eq("id", ordenTrabajoId)
      .maybeSingle();

    if (error) throw new Error(`No se pudo obtener la orden: ${error.message}`);
    return data ? mapearOrden(data) : null;
  }
  /** NotaServicio.obtenerPorOrden: la nota ya emitida de la orden (o null). */
  async obtenerNotaDeOrden(ordenTrabajoId: number): Promise<NotaServicio | null> {
    const { data, error } = await this.db
      .from("nota_servicio")
      .select(COLUMNAS_NOTA)
      .eq("orden_trabajo_id", ordenTrabajoId)
      .maybeSingle();

    if (error) throw new Error(`No se pudo obtener la nota de servicio: ${error.message}`);
    return data ? mapearNota(data) : null;
  }

  /** NotaServicio.buscarPorId */
  async obtenerNotaPorId(notaId: number): Promise<NotaServicio | null> {
    const { data, error } = await this.db.from("nota_servicio").select(COLUMNAS_NOTA).eq("id", notaId).maybeSingle();
    if (error) throw new Error(`No se pudo obtener la nota de servicio: ${error.message}`);
    return data ? mapearNota(data) : null;
  }

  /** Notas PENDIENTES (con saldo por cobrar), para la pantalla de liquidación. */
  async listarNotasPendientesPago(): Promise<NotaPendientePago[]> {
    const { data, error } = await this.db
      .from("nota_servicio")
      .select(`${COLUMNAS_NOTA}, orden_trabajo ( codigo_orden, cotizacion ( cliente ( nombre ) ) )`)
      .ilike("estado", "pendiente")
      .order("id", { ascending: false });

    if (error) throw new Error(`No se pudieron listar las notas pendientes: ${error.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filas: any[] = data ?? [];
    return filas.map((f): NotaPendientePago => {
      const n = mapearNota(f);
      const orden = primero(f.orden_trabajo);
      const cotizacion = orden ? primero(orden.cotizacion) : null;
      const cliente = cotizacion ? primero(cotizacion.cliente) : null;
      return {
        id: n.id,
        numero_nota: n.numero_nota,
        orden_trabajo_id: n.orden_trabajo_id,
        codigo_orden: orden?.codigo_orden ?? "—",
        cliente_nombre: cliente?.nombre ?? null,
        fecha_emision: n.fecha_emision,
        monto_total: n.monto_total,
        anticipo_pagado: n.anticipo_pagado,
        saldo: Math.round((n.monto_total - n.anticipo_pagado) * 100) / 100,
      };
    });
  }

  /**
   * NotaServicio.registrarPagoManual + Bitacora.registrarEvento
   * EFECTIVO / QR / TRANSFERENCIA en una transacción (sp_registrar_pago_manual_nota).
   */
  async registrarPagoManual(params: {
    notaId: number;
    metodo: string;
    referencia: string | null;
    usuarioId: number;
    ip: string | null;
  }): Promise<NotaServicio> {
    const { data, error } = await this.db.rpc("sp_registrar_pago_manual_nota", {
      p_nota_id: params.notaId,
      p_metodo: params.metodo,
      p_referencia: params.referencia,
      p_usuario_id: params.usuarioId,
      p_ip: params.ip,
    });
    if (error) throw new Error(error.message);
    return mapearNota(Array.isArray(data) ? data[0] : data);
  }

  /**
   * NotaServicio.registrarPago + Bitacora.registrarEvento
   * Todo en una transacción dentro de sp_registrar_pago_nota (idempotente).
   */
  async registrarPago(params: {
    notaId: number;
    sessionId: string;
    montoBs: number;
    usuarioId: number;
    ip: string | null;
  }): Promise<NotaServicio> {
    const { data, error } = await this.db.rpc("sp_registrar_pago_nota", {
      p_nota_id: params.notaId,
      p_session_id: params.sessionId,
      p_monto_pagado: params.montoBs,
      p_usuario_id: params.usuarioId,
      p_ip: params.ip,
    });
    if (error) throw new Error(error.message);
    return mapearNota(Array.isArray(data) ? data[0] : data);
  }

  /** DetalleConsumoMaterial.listarPorOrden + Producto.calcularPrecioVenta */
  async listarMaterialesConsumidos(ordenTrabajoId: number): Promise<MaterialConsumido[]> {
    const { data, error } = await this.db
      .from("detalle_consumo_material")
      .select("id, producto_id, cantidad_utilizada, producto ( nombre, precio_compra_actual, margen_ganancia )")
      .eq("orden_trabajo_id", ordenTrabajoId)
      .order("id");

    if (error) throw new Error(`No se pudieron obtener los materiales: ${error.message}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filas: any[] = data ?? [];
    return filas.map((fila): MaterialConsumido => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const producto: any = primero(fila.producto as any);
      const precioCompra = Number(producto?.precio_compra_actual ?? 0);
      const margen = Number(producto?.margen_ganancia ?? 0);
      const precioVenta = Math.round(precioCompra * (1 + margen / 100) * 100) / 100;
      const cantidad = Number(fila.cantidad_utilizada);
      return {
        id: fila.id,
        producto_id: fila.producto_id,
        producto_nombre: producto?.nombre ?? "Producto",
        cantidad_utilizada: cantidad,
        precio_venta: precioVenta,
        subtotal: Math.round(cantidad * precioVenta * 100) / 100,
      };
    });
  }

  /** Servicio.obtenerTarifa: servicios activos para órdenes correctivas. */
  async listarServiciosActivos(): Promise<Servicio[]> {
    const { data, error } = await this.db
      .from("servicio")
      .select("id, nombre, precio_hora_base")
      .eq("activo", true)
      .order("nombre");

    if (error) throw new Error(`No se pudieron obtener los servicios: ${error.message}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filas: any[] = data ?? [];
    return filas.map((s): Servicio => ({ id: s.id, nombre: s.nombre, precio_hora_base: Number(s.precio_hora_base) }));
  }

  /** Cálculo oficial en la base (fn_calcular_liquidacion). */
  async calcularLiquidacion(ordenTrabajoId: number, servicioId?: number | null): Promise<CalculoLiquidacion> {
    const { data, error } = await this.db.rpc("fn_calcular_liquidacion", {
      p_orden_id: ordenTrabajoId,
      p_servicio_id: servicioId ?? null,
    });

    if (error) throw new Error(error.message);
    const fila = Array.isArray(data) ? data[0] : data;
    return {
      costo_materiales: Number(fila?.costo_materiales ?? 0),
      horas_trabajadas: Number(fila?.horas_trabajadas ?? 0),
      tarifa_hora: Number(fila?.tarifa_hora ?? 0),
      costo_mano_obra: Number(fila?.costo_mano_obra ?? 0),
      total_liquidacion: Number(fila?.total_liquidacion ?? 0),
    };
  }

  /**
   * NotaServicio.generarNumero + registrar + Bitacora.registrarEvento
   * Todo en una transacción dentro de sp_emitir_nota_servicio.
   */
  async emitirNota(params: {
    ordenTrabajoId: number;
    anticipo: number;
    usuarioId: number;
    ip: string | null;
    servicioId?: number | null;
  }): Promise<NotaServicio> {
    const { data, error } = await this.db.rpc("sp_emitir_nota_servicio", {
      p_orden_id: params.ordenTrabajoId,
      p_anticipo: params.anticipo,
      p_usuario_id: params.usuarioId,
      p_ip: params.ip,
      p_servicio_id: params.servicioId ?? null,
    });

    if (error) throw new Error(error.message);
    const nota = Array.isArray(data) ? data[0] : data;
    return {
      ...nota,
      anticipo_pagado: Number(nota.anticipo_pagado),
      monto_total: Number(nota.monto_total),
    } as NotaServicio;
  }

  /**
   * Usuario que inició sesión (login propio del CU01).
   * Se obtiene con getCurrentUser() de @/lib/auth (integracion.ts).
   */
  async obtenerUsuarioActual(): Promise<UsuarioSesion | null> {
    return obtenerUsuarioSesion();
  }
}
