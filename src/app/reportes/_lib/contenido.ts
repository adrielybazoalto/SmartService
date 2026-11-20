// =====================================================================
//  CU20 - Contenido de cada reporte (indicadores, gráfico y tablas).
//  Una sola definición para la pantalla, el PDF y el Excel: así los
//  tres muestran exactamente los mismos datos.
// =====================================================================

import { NOMBRE_ROTACION, type ReporteGenerado } from "@/backend/reportes/types";

export type TipoCelda = "texto" | "monto" | "cantidad" | "horas" | "porcentaje";

export interface Columna {
  titulo: string;
  tipo: TipoCelda;
}

export interface Tabla {
  titulo: string;
  columnas: Columna[];
  filas: (string | number | null)[][];
  /** Fila de totales (opcional), mismo largo que columnas. */
  total?: (string | number | null)[];
}

export interface Indicador {
  etiqueta: string;
  valor: number | null;
  tipo: TipoCelda;
  /** Resalta el valor (verde si es positivo, rojo si es negativo). */
  signo?: boolean;
}

export interface Grafico {
  titulo: string;
  tipo: TipoCelda;
  barras: { etiqueta: string; valor: number; valor2?: number }[];
  /** Nombres de las dos series cuando hay comparación (ej.: ingresos y compras). */
  series?: [string, string];
}

export interface ContenidoReporte {
  indicadores: Indicador[];
  grafico: Grafico | null;
  tablas: Tabla[];
  /** Aclaración que acompaña al reporte en pantalla, PDF y Excel (ej.: margen estimado). */
  nota?: string;
}

const ORIGENES: Record<string, string> = {
  VENTA_DIRECTA: "Venta directa",
  COBRO_ORDEN: "Cobro de órdenes de trabajo",
  ANTICIPO_COTIZACION: "Anticipo de cotización",
  ANTICIPO_ORDEN: "Anticipo de orden correctiva",
};

const METODOS: Record<string, string> = {
  EFECTIVO: "Efectivo",
  QR: "QR",
  TRANSFERENCIA: "Transferencia",
  TARJETA: "Tarjeta",
  "NO REGISTRADO": "No registrado",
};

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const moneda = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const cantidad = new Intl.NumberFormat("es-BO", { maximumFractionDigits: 2 });

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' (sin zonas horarias). */
export function fechaCorta(fecha: string | null): string {
  if (!fecha) return "—";
  const [a, m, d] = fecha.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Etiqueta del período agrupado: día 'DD/MM' o mes 'Nov 2026'. */
export function etiquetaPeriodo(periodo: string): string {
  if (periodo.length === 7) {
    const [a, m] = periodo.split("-");
    return `${MESES[Number(m) - 1]} ${a}`;
  }
  return fechaCorta(periodo).slice(0, 5);
}

export function formatearValor(valor: string | number | null | undefined, tipo: TipoCelda): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "string") return valor;
  switch (tipo) {
    case "monto":
      return `Bs ${moneda.format(valor)}`;
    case "porcentaje":
      return `${cantidad.format(valor)} %`;
    case "horas":
      return `${cantidad.format(valor)} h`;
    default:
      return cantidad.format(valor);
  }
}

/** Texto del período para pantalla y archivos. */
export function textoPeriodo(r: ReporteGenerado): string {
  if (!r.filtros.desde || !r.filtros.hasta) return "Estado actual del inventario";
  return `Del ${fechaCorta(r.filtros.desde)} al ${fechaCorta(r.filtros.hasta)}`
    + (r.agrupacion ? ` · agrupado por ${r.agrupacion === "DIA" ? "día" : "mes"}` : "");
}

export function armarContenido(r: ReporteGenerado): ContenidoReporte {
  switch (r.tipo) {
    case "RESUMEN_GENERAL": {
      const d = r.datos;
      return {
        indicadores: [
          { etiqueta: "Ingresos", valor: d.total_ingresos, tipo: "monto" },
          { etiqueta: "Compras a proveedores", valor: d.total_compras, tipo: "monto" },
          { etiqueta: "Balance operativo", valor: d.balance, tipo: "monto", signo: true },
          { etiqueta: "Órdenes finalizadas", valor: d.ordenes_finalizadas, tipo: "cantidad" },
          { etiqueta: "Productos en stock crítico", valor: d.productos_criticos, tipo: "cantidad" },
          { etiqueta: "Cumplimiento promedio técnico", valor: d.cumplimiento_promedio, tipo: "porcentaje" },
        ],
        grafico: {
          titulo: "Ingresos y compras por período",
          tipo: "monto",
          series: ["Ingresos", "Compras"],
          barras: d.serie.map((s) => ({ etiqueta: etiquetaPeriodo(s.periodo), valor: s.ingresos, valor2: s.compras })),
        },
        tablas: [
          {
            titulo: "Evolución del balance operativo",
            columnas: [
              { titulo: "Período", tipo: "texto" },
              { titulo: "Ingresos", tipo: "monto" },
              { titulo: "Compras", tipo: "monto" },
              { titulo: "Balance", tipo: "monto" },
            ],
            filas: d.serie.map((s) => [etiquetaPeriodo(s.periodo), s.ingresos, s.compras, s.balance]),
            total: ["Total", d.total_ingresos, d.total_compras, d.balance],
          },
          {
            titulo: "Cinco servicios más solicitados",
            columnas: [
              { titulo: "Servicio", tipo: "texto" },
              { titulo: "Veces", tipo: "cantidad" },
              { titulo: "Monto", tipo: "monto" },
            ],
            filas: d.top_servicios.map((s) => [s.servicio, s.veces, s.monto]),
          },
          {
            titulo: "Cinco materiales más utilizados",
            columnas: [
              { titulo: "Producto", tipo: "texto" },
              { titulo: "Unidad", tipo: "texto" },
              { titulo: "Cantidad", tipo: "cantidad" },
            ],
            filas: d.top_materiales.map((m) => [m.producto, m.unidad, m.total]),
          },
        ],
      };
    }

    case "INGRESOS": {
      const d = r.datos;
      return {
        indicadores: [
          { etiqueta: "Total recaudado", valor: d.total, tipo: "monto" },
          { etiqueta: "Cobros registrados", valor: d.cantidad, tipo: "cantidad" },
        ],
        grafico: {
          titulo: "Ingresos por período",
          tipo: "monto",
          barras: d.serie.map((s) => ({ etiqueta: etiquetaPeriodo(s.periodo), valor: s.monto })),
        },
        tablas: [
          {
            titulo: "Ingresos por método de pago",
            columnas: [
              { titulo: "Método de pago", tipo: "texto" },
              { titulo: "Cobros", tipo: "cantidad" },
              { titulo: "Monto", tipo: "monto" },
            ],
            filas: d.por_metodo.map((m) => [METODOS[m.metodo] ?? m.metodo, m.cantidad, m.monto]),
            total: ["Total", d.cantidad, d.total],
          },
          {
            titulo: "Ingresos por origen",
            columnas: [
              { titulo: "Origen", tipo: "texto" },
              { titulo: "Cobros", tipo: "cantidad" },
              { titulo: "Monto", tipo: "monto" },
            ],
            filas: d.por_origen.map((o) => [ORIGENES[o.origen] ?? o.origen, o.cantidad, o.monto]),
            total: ["Total", d.cantidad, d.total],
          },
          {
            titulo: "Detalle por período",
            columnas: [
              { titulo: "Período", tipo: "texto" },
              { titulo: "Cobros", tipo: "cantidad" },
              { titulo: "Monto", tipo: "monto" },
            ],
            filas: d.serie.map((s) => [etiquetaPeriodo(s.periodo), s.cantidad, s.monto]),
          },
        ],
      };
    }

    case "SERVICIOS": {
      const total = r.datos.reduce((s, x) => s + x.monto, 0);
      return {
        indicadores: [
          { etiqueta: "Servicios distintos", valor: r.datos.length, tipo: "cantidad" },
          { etiqueta: "Monto en cotizaciones aprobadas", valor: Math.round(total * 100) / 100, tipo: "monto" },
        ],
        grafico: {
          titulo: "Veces solicitado (top 10)",
          tipo: "cantidad",
          barras: r.datos.slice(0, 10).map((s) => ({ etiqueta: s.servicio, valor: s.veces })),
        },
        tablas: [{
          titulo: "Servicios más solicitados",
          columnas: [
            { titulo: "Servicio", tipo: "texto" },
            { titulo: "Veces solicitado", tipo: "cantidad" },
            { titulo: "Horas estimadas", tipo: "horas" },
            { titulo: "Monto", tipo: "monto" },
          ],
          filas: r.datos.map((s) => [s.servicio, s.veces, s.horas_estimadas, s.monto]),
        }],
      };
    }

    case "ROTACION_INVENTARIO": {
      const d = r.datos;
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const cuenta = (c: string) => d.filter((p) => p.rotacion === c).length;
      const sinMovimiento = d.filter((p) => p.rotacion === "SIN_MOVIMIENTO");
      const valorTotal = r2(d.reduce((s, p) => s + p.valor_stock, 0));
      const inmovilizado = r2(sinMovimiento.reduce((s, p) => s + p.valor_stock, 0));
      const conSalida = d.filter((p) => p.total > 0);
      return {
        indicadores: [
          { etiqueta: "Productos activos", valor: d.length, tipo: "cantidad" },
          { etiqueta: "Alta rotación", valor: cuenta("ALTA"), tipo: "cantidad" },
          { etiqueta: "Baja rotación", valor: cuenta("BAJA"), tipo: "cantidad" },
          { etiqueta: "Sin movimiento", valor: sinMovimiento.length, tipo: "cantidad" },
          { etiqueta: "Valor del inventario", valor: valorTotal, tipo: "monto" },
          { etiqueta: "Valor inmovilizado (sin movimiento)", valor: inmovilizado, tipo: "monto" },
          {
            etiqueta: "Inventario que no rota",
            valor: valorTotal > 0 ? Math.round((inmovilizado / valorTotal) * 1000) / 10 : null,
            tipo: "porcentaje",
          },
        ],
        grafico: conSalida.length
          ? {
              titulo: "Cantidad que salió (top 10)",
              tipo: "cantidad",
              barras: conSalida.slice(0, 10).map((m) => ({ etiqueta: m.producto, valor: m.total })),
            }
          : null,
        tablas: [
          {
            titulo: "Rotación de inventario",
            columnas: [
              { titulo: "Producto", tipo: "texto" },
              { titulo: "Categoría", tipo: "texto" },
              { titulo: "Unidad", tipo: "texto" },
              { titulo: "En órdenes", tipo: "cantidad" },
              { titulo: "En ventas", tipo: "cantidad" },
              { titulo: "Total salida", tipo: "cantidad" },
              { titulo: "Stock actual", tipo: "cantidad" },
              { titulo: "Valor en bodega", tipo: "monto" },
              { titulo: "Última salida", tipo: "texto" },
              { titulo: "Rotación", tipo: "texto" },
            ],
            filas: d.map((p) => [
              p.producto, p.categoria, p.unidad, p.en_ordenes, p.en_ventas, p.total,
              p.stock_actual, p.valor_stock, p.ultima_salida ? fechaCorta(p.ultima_salida) : "Nunca",
              NOMBRE_ROTACION[p.rotacion],
            ]),
            total: ["Total", "", "", null, null, null, null, valorTotal, "", ""],
          },
          {
            titulo: "Productos sin movimiento (dinero inmovilizado)",
            columnas: [
              { titulo: "Producto", tipo: "texto" },
              { titulo: "Stock actual", tipo: "cantidad" },
              { titulo: "Valor en bodega", tipo: "monto" },
              { titulo: "Última salida", tipo: "texto" },
            ],
            filas: sinMovimiento.map((p) => [
              p.producto, p.stock_actual, p.valor_stock, p.ultima_salida ? fechaCorta(p.ultima_salida) : "Nunca",
            ]),
            total: ["Total", null, inmovilizado, ""],
          },
        ],
      };
    }

    case "PROVEEDORES": {
      const { proveedores, productos } = r.datos;
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const ingreso = r2(productos.reduce((s, p) => s + p.ingreso, 0));
      const margen = r2(productos.reduce((s, p) => s + p.margen, 0));
      const comprado = r2(proveedores.reduce((s, p) => s + p.monto_comprado, 0));
      return {
        indicadores: [
          { etiqueta: "Compras a proveedores", valor: comprado, tipo: "monto" },
          { etiqueta: "Ingreso por productos", valor: ingreso, tipo: "monto" },
          { etiqueta: "Margen bruto estimado", valor: margen, tipo: "monto", signo: true },
          {
            etiqueta: "Margen estimado %",
            valor: ingreso > 0 ? Math.round((margen / ingreso) * 1000) / 10 : null,
            tipo: "porcentaje",
          },
        ],
        grafico: proveedores.length
          ? {
              titulo: "Compras y margen estimado por proveedor",
              tipo: "monto",
              series: ["Comprado", "Margen estimado"],
              barras: proveedores.slice(0, 10).map((p) => ({
                etiqueta: p.proveedor, valor: p.monto_comprado, valor2: Math.max(p.margen, 0),
              })),
            }
          : null,
        tablas: [
          {
            titulo: "Proveedores",
            columnas: [
              { titulo: "Proveedor", tipo: "texto" },
              { titulo: "Compras", tipo: "cantidad" },
              { titulo: "Monto comprado", tipo: "monto" },
              { titulo: "Productos comprados", tipo: "cantidad" },
              { titulo: "Productos vendidos", tipo: "cantidad" },
              { titulo: "Ingreso", tipo: "monto" },
              { titulo: "Margen estimado", tipo: "monto" },
              { titulo: "Margen %", tipo: "porcentaje" },
            ],
            filas: proveedores.map((p) => [
              p.proveedor, p.compras, p.monto_comprado, p.productos_comprados, p.productos_vendidos,
              p.ingreso, p.margen, p.margen_pct,
            ]),
            total: ["Total", null, comprado, null, null, ingreso, margen, null],
          },
          {
            titulo: "Rentabilidad estimada por producto",
            columnas: [
              { titulo: "Producto", tipo: "texto" },
              { titulo: "Proveedor principal", tipo: "texto" },
              { titulo: "Cantidad", tipo: "cantidad" },
              { titulo: "Ingreso", tipo: "monto" },
              { titulo: "Costo unitario", tipo: "monto" },
              { titulo: "Costo de", tipo: "texto" },
              { titulo: "Margen estimado", tipo: "monto" },
              { titulo: "Margen %", tipo: "porcentaje" },
            ],
            filas: productos.map((p) => [
              p.producto, p.proveedor, p.cantidad, p.ingreso, p.costo_unitario,
              p.origen_costo === "COMPRAS_PERIODO" ? "Compras del período" : "Último costo",
              p.margen, p.margen_pct,
            ]),
            total: ["Total", "", null, ingreso, null, "", margen, null],
          },
        ],
        nota:
          "Margen estimado: el costo de cada venta no se guarda; se usa el costo promedio de las compras del período " +
          "o, si no hubo compras, el último costo del producto. Los materiales de órdenes se valoran a precio de lista " +
          "(costo × (1 + margen %)). No incluye mano de obra.",
      };
    }

    case "INVENTARIO_CRITICO":
      return {
        indicadores: [{ etiqueta: "Productos en stock crítico", valor: r.datos.length, tipo: "cantidad" }],
        grafico: null,
        tablas: [{
          titulo: "Productos con stock igual o menor al mínimo",
          columnas: [
            { titulo: "Código", tipo: "texto" },
            { titulo: "Producto", tipo: "texto" },
            { titulo: "Categoría", tipo: "texto" },
            { titulo: "Stock actual", tipo: "cantidad" },
            { titulo: "Stock mínimo", tipo: "cantidad" },
            { titulo: "Faltante", tipo: "cantidad" },
          ],
          filas: r.datos.map((p) => [p.codigo ?? "—", p.producto, p.categoria, p.stock_actual, p.stock_minimo, p.faltante]),
        }],
      };

    case "RENDIMIENTO_TECNICO": {
      const programadas = r.datos.reduce((s, t) => s + t.horas_programadas, 0);
      const reales = r.datos.reduce((s, t) => s + t.horas_reales, 0);
      return {
        indicadores: [
          { etiqueta: "Técnicos con órdenes", valor: r.datos.length, tipo: "cantidad" },
          { etiqueta: "Órdenes finalizadas", valor: r.datos.reduce((s, t) => s + t.ordenes_finalizadas, 0), tipo: "cantidad" },
          { etiqueta: "Horas programadas", valor: Math.round(programadas * 100) / 100, tipo: "horas" },
          { etiqueta: "Horas reales", valor: Math.round(reales * 100) / 100, tipo: "horas" },
        ],
        grafico: {
          titulo: "Horas programadas y reales por técnico",
          tipo: "horas",
          series: ["Programadas", "Reales"],
          barras: r.datos.map((t) => ({ etiqueta: t.tecnico, valor: t.horas_programadas, valor2: t.horas_reales })),
        },
        tablas: [{
          titulo: "Rendimiento por técnico",
          columnas: [
            { titulo: "Técnico", tipo: "texto" },
            { titulo: "Órdenes finalizadas", tipo: "cantidad" },
            { titulo: "A tiempo", tipo: "cantidad" },
            { titulo: "Horas programadas", tipo: "horas" },
            { titulo: "Horas reales", tipo: "horas" },
            { titulo: "Cumplimiento", tipo: "porcentaje" },
          ],
          filas: r.datos.map((t) => [t.tecnico, t.ordenes_finalizadas, t.ordenes_a_tiempo, t.horas_programadas, t.horas_reales, t.cumplimiento]),
        }],
      };
    }
  }
}
