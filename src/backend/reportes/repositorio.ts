// =====================================================================
//  CU20 - Repositorio: única capa que consulta la base de datos.
//  Los cálculos de cada reporte viven en funciones SQL fn_reporte_*
//  (db/migrations/migracion_cu20_reportes.sql).
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { registrarEvento as registrarEventoBitacora } from "@/backend/bitacora/service";
import type { Db } from "@/lib/supabase/types";
import { obtenerUsuarioSesion } from "./integracion";
import type {
  DatosProveedores,
  IngresoPorMetodo,
  IngresoPorOrigen,
  IngresoPorPeriodo,
  MaterialUtilizado,
  OpcionFiltro,
  ProductoCritico,
  ProductoRotacion,
  RendimientoTecnico,
  ServicioSolicitado,
  UsuarioSesion,
} from "./types";

const ROL_TECNICO = "TECNICO";

/* eslint-disable @typescript-eslint/no-explicit-any */
const num = (v: any): number => Number(v ?? 0);

function mapearServicio(f: any): ServicioSolicitado {
  return {
    servicio_id: f.servicio_id,
    servicio: f.servicio,
    veces: num(f.veces),
    horas_estimadas: num(f.horas_estimadas),
    monto: num(f.monto),
  };
}

function mapearMaterial(f: any): MaterialUtilizado {
  return {
    producto_id: f.producto_id,
    producto: f.producto,
    categoria: f.categoria,
    unidad: f.unidad,
    en_ordenes: num(f.en_ordenes),
    en_ventas: num(f.en_ventas),
    total: num(f.total),
  };
}

/** Fila de fn_reporte_rotacion (la clase la agrega el controlador). */
function mapearRotacion(f: any): Omit<ProductoRotacion, "rotacion"> {
  return {
    ...mapearMaterial(f),
    codigo: f.codigo ?? null,
    stock_actual: num(f.stock_actual),
    costo_unitario: num(f.costo_unitario),
    valor_stock: num(f.valor_stock),
    ultima_salida: f.ultima_salida ?? null,
  };
}

function mapearRendimiento(f: any): Omit<RendimientoTecnico, "cumplimiento"> {
  return {
    tecnico_id: f.tecnico_id,
    tecnico: f.tecnico,
    ordenes_finalizadas: num(f.ordenes_finalizadas),
    ordenes_a_tiempo: num(f.ordenes_a_tiempo),
    horas_programadas: num(f.horas_programadas),
    horas_reales: num(f.horas_reales),
  };
}

/** Resumen general tal como lo devuelve fn_reporte_resumen_general (sin cálculos del backend). */
export interface ResumenGeneralBase {
  agrupacion: string;
  total_ingresos: number;
  total_compras: number;
  ordenes_finalizadas: number;
  productos_criticos: number;
  top_servicios: ServicioSolicitado[];
  top_materiales: MaterialUtilizado[];
  rendimiento: Omit<RendimientoTecnico, "cumplimiento">[];
  serie: { periodo: string; ingresos: number; compras: number }[];
}

export interface IngresosBase {
  total: number;
  cantidad: number;
  por_metodo: IngresoPorMetodo[];
  por_origen: IngresoPorOrigen[];
  serie: IngresoPorPeriodo[];
}

export class DatosReportes {
  private readonly db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  /** Usuario de la sesión (login propio, CU01). */
  obtenerUsuarioActual(): Promise<UsuarioSesion | null> {
    return obtenerUsuarioSesion();
  }

  private async rpc(nombre: string, parametros: Record<string, unknown>): Promise<any> {
    const { data, error } = await this.db.rpc(nombre, parametros);
    if (error) throw new Error(`No se pudo obtener el reporte: ${error.message}`);
    return data;
  }

  // ---------------- Catálogos de filtros (paso 3) ----------------

  /** Usuario: técnicos activos (rol TECNICO, estado = true). */
  async listarTecnicosActivos(): Promise<OpcionFiltro[]> {
    const { data: rol, error: e1 } = await this.db.from("rol").select("id").eq("nombre", ROL_TECNICO).maybeSingle();
    if (e1) throw new Error(`No se pudieron listar los técnicos: ${e1.message}`);
    if (!rol) return [];
    const { data, error } = await this.db
      .from("usuario")
      .select("id, nombre")
      .eq("rol_id", rol.id)
      .eq("estado", true)
      .order("nombre");
    if (error) throw new Error(`No se pudieron listar los técnicos: ${error.message}`);
    return (data ?? []).map((u: any) => ({ id: u.id, nombre: u.nombre }));
  }

  /** CategoriaProducto: todas las categorías. */
  async listarCategorias(): Promise<OpcionFiltro[]> {
    const { data, error } = await this.db.from("categoria_producto").select("id, nombre").order("nombre");
    if (error) throw new Error(`No se pudieron listar las categorías: ${error.message}`);
    return (data ?? []).map((c: any) => ({ id: c.id, nombre: c.nombre }));
  }

  // ---------------- Reportes (paso 8) ----------------

  /** S1 · fn_reporte_resumen_general */
  async obtenerResumenGeneral(desde: string, hasta: string): Promise<ResumenGeneralBase> {
    const d = (await this.rpc("fn_reporte_resumen_general", { p_desde: desde, p_hasta: hasta })) ?? {};
    return {
      agrupacion: d.agrupacion,
      total_ingresos: num(d.total_ingresos),
      total_compras: num(d.total_compras),
      ordenes_finalizadas: num(d.ordenes_finalizadas),
      productos_criticos: num(d.productos_criticos),
      top_servicios: (d.top_servicios ?? []).map(mapearServicio),
      top_materiales: (d.top_materiales ?? []).map(mapearMaterial),
      rendimiento: (d.rendimiento ?? []).map(mapearRendimiento),
      serie: (d.serie ?? []).map((s: any) => ({ periodo: s.periodo, ingresos: num(s.ingresos), compras: num(s.compras) })),
    };
  }

  /** S2 · fn_reporte_ingresos (ventas, recibos de órdenes y anticipos) */
  async listarIngresosPorPeriodo(desde: string, hasta: string): Promise<IngresosBase> {
    const d = (await this.rpc("fn_reporte_ingresos", { p_desde: desde, p_hasta: hasta })) ?? {};
    return {
      total: num(d.total),
      cantidad: num(d.cantidad),
      por_metodo: (d.por_metodo ?? []).map((m: any) => ({ metodo: m.metodo, monto: num(m.monto), cantidad: num(m.cantidad) })),
      por_origen: (d.por_origen ?? []).map((o: any) => ({ origen: o.origen, monto: num(o.monto), cantidad: num(o.cantidad) })),
      serie: (d.serie ?? []).map((s: any) => ({ periodo: s.periodo, monto: num(s.monto), cantidad: num(s.cantidad) })),
    };
  }

  /** S3 · fn_reporte_servicios (cotizaciones aprobadas) */
  async listarServiciosSolicitados(desde: string, hasta: string): Promise<ServicioSolicitado[]> {
    const d = await this.rpc("fn_reporte_servicios", { p_desde: desde, p_hasta: hasta });
    return (d ?? []).map(mapearServicio);
  }

  /** S4 · fn_reporte_rotacion (todos los productos activos: salidas, stock y valor) */
  async listarRotacionInventario(
    desde: string,
    hasta: string,
    categoriaId: number | null,
  ): Promise<Omit<ProductoRotacion, "rotacion">[]> {
    const d = await this.rpc("fn_reporte_rotacion", { p_desde: desde, p_hasta: hasta, p_categoria_id: categoriaId });
    return (d ?? []).map(mapearRotacion);
  }

  /** S7 · fn_reporte_proveedores (compras y margen estimado; el % lo calcula el controlador) */
  async obtenerRentabilidadProveedores(desde: string, hasta: string): Promise<DatosProveedores> {
    const d = (await this.rpc("fn_reporte_proveedores", { p_desde: desde, p_hasta: hasta })) ?? {};
    return {
      proveedores: (d.proveedores ?? []).map((f: any) => ({
        proveedor_id: f.proveedor_id ?? null,
        proveedor: f.proveedor,
        compras: num(f.compras),
        monto_comprado: num(f.monto_comprado),
        productos_comprados: num(f.productos_comprados),
        productos_vendidos: num(f.productos_vendidos),
        ingreso: num(f.ingreso),
        costo: num(f.costo),
        margen: num(f.margen),
        margen_pct: null,
      })),
      productos: (d.productos ?? []).map((f: any) => ({
        producto_id: f.producto_id,
        producto: f.producto,
        unidad: f.unidad,
        proveedor_id: f.proveedor_id ?? null,
        proveedor: f.proveedor,
        cantidad: num(f.cantidad),
        ingreso: num(f.ingreso),
        costo_unitario: num(f.costo_unitario),
        origen_costo: f.origen_costo === "COMPRAS_PERIODO" ? "COMPRAS_PERIODO" : "ULTIMO_COSTO",
        costo: num(f.costo),
        margen: num(f.margen),
        margen_pct: null,
      })),
    };
  }

  /** S5 · fn_reporte_inventario_critico (stock actual <= stock mínimo) */
  async listarStockCritico(categoriaId: number | null): Promise<ProductoCritico[]> {
    const d = await this.rpc("fn_reporte_inventario_critico", { p_categoria_id: categoriaId });
    return (d ?? []).map((f: any) => ({
      producto_id: f.producto_id,
      codigo: f.codigo ?? null,
      producto: f.producto,
      categoria: f.categoria,
      unidad: f.unidad,
      stock_actual: num(f.stock_actual),
      stock_minimo: num(f.stock_minimo),
      faltante: num(f.faltante),
    }));
  }

  /** S6 · fn_reporte_rendimiento (órdenes finalizadas por técnico) */
  async listarRendimientoTecnicos(
    desde: string,
    hasta: string,
    tecnicoId: number | null,
  ): Promise<Omit<RendimientoTecnico, "cumplimiento">[]> {
    const d = await this.rpc("fn_reporte_rendimiento", { p_desde: desde, p_hasta: hasta, p_tecnico_id: tecnicoId });
    return (d ?? []).map(mapearRendimiento);
  }

  // ---------------- Bitácora (CU06, «include») ----------------

  /** Bitacora.registrarEvento (mismo servicio que usan los demás módulos). */
  async registrarEvento(usuarioId: number, accion: string, descripcion: string, ip: string | null): Promise<void> {
    await registrarEventoBitacora(this.db as unknown as Db, { usuario_id: usuarioId, accion, descripcion }, ip);
  }
}
