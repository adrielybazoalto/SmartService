// =====================================================================
//  CU20 - Generar Reportes de Gestión, Ventas y Rendimiento Técnico
//  MODELO: tipos de los filtros y de cada reporte (S1..S7).
//  Los reportes no se guardan en la base (RN6): se calculan al consultar.
// =====================================================================

/** Tipos de reporte del CU20 (subflujos S1..S7). */
export const TIPOS_REPORTE = [
  "RESUMEN_GENERAL",
  "INGRESOS",
  "SERVICIOS",
  "ROTACION_INVENTARIO",
  "INVENTARIO_CRITICO",
  "RENDIMIENTO_TECNICO",
  "PROVEEDORES",
] as const;
export type TipoReporte = (typeof TIPOS_REPORTE)[number];

export const NOMBRE_REPORTE: Record<TipoReporte, string> = {
  RESUMEN_GENERAL: "Resumen general del período",
  INGRESOS: "Ingresos por período",
  SERVICIOS: "Servicios más solicitados",
  ROTACION_INVENTARIO: "Rotación de inventario",
  INVENTARIO_CRITICO: "Inventario crítico",
  RENDIMIENTO_TECNICO: "Rendimiento por técnico",
  PROVEEDORES: "Proveedores y rentabilidad",
};

/** Atajos de período (FA1). */
export const ATAJOS = ["HOY", "ESTA_SEMANA", "ESTE_MES", "MES_ANTERIOR", "ESTE_ANIO"] as const;
export type Atajo = (typeof ATAJOS)[number];

export const NOMBRE_ATAJO: Record<Atajo, string> = {
  HOY: "Hoy",
  ESTA_SEMANA: "Esta semana",
  ESTE_MES: "Este mes",
  MES_ANTERIOR: "Mes anterior",
  ESTE_ANIO: "Este año",
};

export type FormatoExportacion = "PDF" | "EXCEL";

/** Filtros que elige el Administrador (paso 5). Fechas 'YYYY-MM-DD'. */
export interface FiltrosReporte {
  tipo: TipoReporte;
  desde: string | null;
  hasta: string | null;
  tecnicoId: number | null;
  categoriaId: number | null;
}

/** RN3: hasta 31 días por día; más, por mes. */
export type Agrupacion = "DIA" | "MES";

export interface OpcionFiltro {
  id: number;
  nombre: string;
}

export interface OpcionesFiltro {
  tecnicos: OpcionFiltro[];
  categorias: OpcionFiltro[];
}

/** Usuario de la sesión (actor: Administrador). */
export interface UsuarioSesion {
  id: number;
  nombre: string;
  activo: boolean;
}

// ---------------- Filas que devuelve la base ----------------

export interface MontoPorClave {
  monto: number;
  cantidad: number;
}
export interface IngresoPorMetodo extends MontoPorClave {
  metodo: string;
}
export interface IngresoPorOrigen extends MontoPorClave {
  origen: string;
}
export interface IngresoPorPeriodo extends MontoPorClave {
  periodo: string;
}

export interface ServicioSolicitado {
  servicio_id: number;
  servicio: string;
  veces: number;
  horas_estimadas: number;
  monto: number;
}

/** Salida de un producto en el período: órdenes de trabajo + ventas directas. */
export interface MaterialUtilizado {
  producto_id: number;
  producto: string;
  categoria: string;
  unidad: string;
  en_ordenes: number;
  en_ventas: number;
  total: number;
}

/** RN7: Alta (salidas >= stock), Baja (salidas < stock) o Sin movimiento (sin salidas). */
export type ClaseRotacion = "ALTA" | "BAJA" | "SIN_MOVIMIENTO";

export const NOMBRE_ROTACION: Record<ClaseRotacion, string> = {
  ALTA: "Alta",
  BAJA: "Baja",
  SIN_MOVIMIENTO: "Sin movimiento",
};

/** S4 · un producto activo con su rotación en el período. */
export interface ProductoRotacion extends MaterialUtilizado {
  codigo: string | null;
  stock_actual: number;
  costo_unitario: number;
  /** stock actual × último costo */
  valor_stock: number;
  /** Fecha (Bolivia) de la última salida hasta la fecha hasta; null si nunca salió. */
  ultima_salida: string | null;
  rotacion: ClaseRotacion;
}

/** S7 · rentabilidad estimada de un producto vendido o consumido en el período. */
export interface RentabilidadProducto {
  producto_id: number;
  producto: string;
  unidad: string;
  proveedor_id: number | null;
  proveedor: string;
  cantidad: number;
  ingreso: number;
  costo_unitario: number;
  /** De dónde sale el costo: promedio de compras del período o último costo del producto. */
  origen_costo: "COMPRAS_PERIODO" | "ULTIMO_COSTO";
  costo: number;
  margen: number;
  /** margen ÷ ingreso × 100 (calcularMargenPorcentaje) */
  margen_pct: number | null;
}

/** S7 · compras del período y margen estimado de los productos de un proveedor. */
export interface RentabilidadProveedor {
  proveedor_id: number | null;
  proveedor: string;
  compras: number;
  monto_comprado: number;
  productos_comprados: number;
  productos_vendidos: number;
  ingreso: number;
  costo: number;
  margen: number;
  margen_pct: number | null;
}

export interface DatosProveedores {
  proveedores: RentabilidadProveedor[];
  productos: RentabilidadProducto[];
}

export interface ProductoCritico {
  producto_id: number;
  codigo: string | null;
  producto: string;
  categoria: string;
  unidad: string;
  stock_actual: number;
  stock_minimo: number;
  faltante: number;
}

export interface RendimientoTecnico {
  tecnico_id: number;
  tecnico: string;
  ordenes_finalizadas: number;
  ordenes_a_tiempo: number;
  horas_programadas: number;
  horas_reales: number;
  /** horas programadas ÷ horas reales × 100 (calcularEficiencia). */
  cumplimiento: number | null;
}

export interface BalancePorPeriodo {
  periodo: string;
  ingresos: number;
  compras: number;
  balance: number;
}

// ---------------- Datos de cada reporte ----------------

export interface DatosResumenGeneral {
  total_ingresos: number;
  total_compras: number;
  balance: number;
  ordenes_finalizadas: number;
  productos_criticos: number;
  cumplimiento_promedio: number | null;
  top_servicios: ServicioSolicitado[];
  top_materiales: MaterialUtilizado[];
  serie: BalancePorPeriodo[];
}

export interface DatosIngresos {
  total: number;
  cantidad: number;
  por_metodo: IngresoPorMetodo[];
  por_origen: IngresoPorOrigen[];
  serie: IngresoPorPeriodo[];
}

export type Reporte =
  | { tipo: "RESUMEN_GENERAL"; datos: DatosResumenGeneral }
  | { tipo: "INGRESOS"; datos: DatosIngresos }
  | { tipo: "SERVICIOS"; datos: ServicioSolicitado[] }
  | { tipo: "ROTACION_INVENTARIO"; datos: ProductoRotacion[] }
  | { tipo: "INVENTARIO_CRITICO"; datos: ProductoCritico[] }
  | { tipo: "RENDIMIENTO_TECNICO"; datos: RendimientoTecnico[] }
  | { tipo: "PROVEEDORES"; datos: DatosProveedores };

/** Reporte listo para mostrar y exportar (paso 9). */
export type ReporteGenerado = Reporte & {
  titulo: string;
  filtros: FiltrosReporte;
  agrupacion: Agrupacion | null;
  /** Texto de los filtros aplicados (técnico / categoría), para pantalla y archivo. */
  filtrosTexto: string[];
  emitidoPor: string;
  /** Fecha y hora de emisión en Bolivia: 'YYYY-MM-DD HH:mm:ss'. */
  fechaEmision: string;
};

export type ResultadoAccion<T> = { ok: true; data: T } | { ok: false; error: string };
