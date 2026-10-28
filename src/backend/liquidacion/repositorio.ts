// =====================================================================
//  CU13 - Emitir Notas de Servicio y Liquidación Operativa
//  ACCESO A DATOS (repositorio): todas las consultas a Supabase del CU13.
//  Cada función corresponde a una operación de las entidades del
//  diagrama de análisis (OrdenTrabajo, DetalleConsumoMaterial,
//  Producto, Servicio, NotaServicio, Bitacora).
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { obtenerUsuarioSesion } from "./integracion";
import { verificarOrdenLiquidable } from "./reglas";
import {
  ESTADO_ORDEN_FINALIZADA,
  type CalculoLiquidacion,
  type MaterialConsumido,
  type NotaServicio,
  type OrdenPendienteLiquidar,
  type Servicio,
  type UsuarioSesion,
} from "./types";

const COLUMNAS_ORDEN = `
  id, codigo_orden, tipo_trabajo, estado, fecha_inicio_real, horas_fin_real, cotizacion_id,
  cotizacion ( numero_cotizacion, cliente ( nombre ) ),
  nota_servicio ( id )
`;

// PostgREST devuelve una relación como objeto o como arreglo según la FK.
function primero<T>(valor: T | T[] | null | undefined): T | null {
  if (Array.isArray(valor)) return valor[0] ?? null;
  return valor ?? null;
}

export type OrdenConNota = OrdenPendienteLiquidar & { tieneNota: boolean };

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
    horas_fin_real: fila.horas_fin_real === null ? null : Number(fila.horas_fin_real),
    cotizacion_id: fila.cotizacion_id,
    numero_cotizacion: cotizacion?.numero_cotizacion ?? null,
    cliente_nombre: cliente?.nombre ?? null,
    tieneNota: Array.isArray(nota) ? nota.length > 0 : Boolean(nota),
  };
}

export class LiquidacionRepositorio {
  constructor(private readonly db: SupabaseClient) {}

  /** OrdenTrabajo: órdenes FINALIZADAS que todavía no tienen nota de servicio. */
  async listarOrdenesSinNota(): Promise<OrdenPendienteLiquidar[]> {
    const { data, error } = await this.db
      .from("orden_trabajo")
      .select(COLUMNAS_ORDEN)
      .eq("estado", ESTADO_ORDEN_FINALIZADA)
      .order("fecha_inicio_real", { ascending: false });

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
   * Se obtiene con las funciones de @/lib/auth o @/lib/sesiones (integracion.ts).
   */
  async obtenerUsuarioActual(): Promise<UsuarioSesion | null> {
    return obtenerUsuarioSesion(this.db);
  }
}
