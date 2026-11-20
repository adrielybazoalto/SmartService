// =====================================================================
//  CU20 - CONTROL: ReporteController
//  Coordina el caso de uso: permiso -> validación -> consulta ->
//  cálculos -> verificación de datos -> bitácora. No consulta la base
//  directamente (lo hace ReporteRepositorio).
// =====================================================================

import { ahoraBolivia } from "@/lib/fechas";
import { verificarPermisoReporte } from "./autorizacion";
import { ErrorNegocio, MENSAJES } from "./errores";
import type { ReporteRepositorio } from "./repositorio";
import {
  calcularBalance,
  calcularEficiencia,
  calcularMargenPorcentaje,
  clasificarRotacion,
  decidirAgrupacion,
  promedioCumplimiento,
  validarFiltrosReporte,
  verificarDatosReporte,
} from "./reglas";
import {
  NOMBRE_REPORTE,
  type FiltrosReporte,
  type FormatoExportacion,
  type OpcionesFiltro,
  type RendimientoTecnico,
  type Reporte,
  type ReporteGenerado,
} from "./types";

/** Agrega el % de cumplimiento a cada técnico. */
function conCumplimiento(filas: Omit<RendimientoTecnico, "cumplimiento">[]): RendimientoTecnico[] {
  return filas.map((f) => ({ ...f, cumplimiento: calcularEficiencia(f.horas_programadas, f.horas_reales) }));
}

export class ReporteController {
  private readonly repositorio: ReporteRepositorio;

  constructor(repositorio: ReporteRepositorio) {
    this.repositorio = repositorio;
  }

  /** Paso 3: catálogos de técnicos activos y categorías de producto. */
  async listarOpcionesFiltro(): Promise<OpcionesFiltro> {
    await verificarPermisoReporte(await this.repositorio.obtenerUsuarioActual(), "LEER");
    const [tecnicos, categorias] = await Promise.all([
      this.repositorio.listarTecnicosActivos(),
      this.repositorio.listarCategorias(),
    ]);
    return { tecnicos, categorias };
  }

  /** Pasos 6 a 10: valida, calcula, verifica que haya datos y registra la consulta. */
  async generarReporte(datos: unknown, ip: string | null): Promise<ReporteGenerado> {
    const usuario = await verificarPermisoReporte(await this.repositorio.obtenerUsuarioActual(), "LEER");
    const filtros = validarFiltrosReporte(datos);
    const filtrosTexto = await this.verificarFiltrosOpcionales(filtros);

    const reporte = await this.obtenerReporte(filtros);
    verificarDatosReporte(reporte);

    await this.repositorio.registrarEvento(
      usuario.id,
      "GENERAR_REPORTE",
      this.describir(filtros, filtrosTexto, "Consulta"),
      ip,
    );

    return {
      ...reporte,
      titulo: NOMBRE_REPORTE[filtros.tipo],
      filtros,
      agrupacion: filtros.desde && filtros.hasta ? decidirAgrupacion(filtros.desde, filtros.hasta) : null,
      filtrosTexto,
      emitidoPor: usuario.nombre,
      fechaEmision: ahoraBolivia(),
    };
  }

  /** Paso 13: el archivo se arma en el navegador; aquí se valida y se registra la exportación. */
  async registrarExportacion(datos: unknown, formato: unknown, ip: string | null): Promise<void> {
    const usuario = await verificarPermisoReporte(await this.repositorio.obtenerUsuarioActual(), "PROCESAR");
    if (formato !== "PDF" && formato !== "EXCEL") throw new ErrorNegocio(MENSAJES.FORMATO_INVALIDO);
    const filtros = validarFiltrosReporte(datos);
    const filtrosTexto = await this.verificarFiltrosOpcionales(filtros);
    await this.repositorio.registrarEvento(
      usuario.id,
      "EXPORTAR_REPORTE",
      this.describir(filtros, filtrosTexto, `Exportación ${formato as FormatoExportacion}`),
      ip,
    );
  }

  /** Excepciones del paso 7: técnico activo y categoría existente. Devuelve su texto. */
  private async verificarFiltrosOpcionales(filtros: FiltrosReporte): Promise<string[]> {
    const texto: string[] = [];
    if (filtros.tecnicoId !== null) {
      const tecnicos = await this.repositorio.listarTecnicosActivos();
      const tecnico = tecnicos.find((t) => t.id === filtros.tecnicoId);
      if (!tecnico) throw new ErrorNegocio(MENSAJES.TECNICO_INVALIDO);
      texto.push(`Técnico: ${tecnico.nombre}`);
    }
    if (filtros.categoriaId !== null) {
      const categorias = await this.repositorio.listarCategorias();
      const categoria = categorias.find((c) => c.id === filtros.categoriaId);
      if (!categoria) throw new ErrorNegocio(MENSAJES.CATEGORIA_INVALIDA);
      texto.push(`Categoría: ${categoria.nombre}`);
    }
    return texto;
  }

  /** Paso 8: obtiene la información del reporte elegido (subflujos S1..S7). */
  private async obtenerReporte(f: FiltrosReporte): Promise<Reporte> {
    const desde = f.desde ?? "";
    const hasta = f.hasta ?? "";
    switch (f.tipo) {
      case "RESUMEN_GENERAL": {
        const r = await this.repositorio.obtenerResumenGeneral(desde, hasta);
        const rendimiento = conCumplimiento(r.rendimiento);
        return {
          tipo: f.tipo,
          datos: {
            total_ingresos: r.total_ingresos,
            total_compras: r.total_compras,
            balance: calcularBalance(r.total_ingresos, r.total_compras),
            ordenes_finalizadas: r.ordenes_finalizadas,
            productos_criticos: r.productos_criticos,
            cumplimiento_promedio: promedioCumplimiento(rendimiento.map((t) => t.cumplimiento)),
            top_servicios: r.top_servicios,
            top_materiales: r.top_materiales,
            serie: r.serie.map((s) => ({ ...s, balance: calcularBalance(s.ingresos, s.compras) })),
          },
        };
      }
      case "INGRESOS": {
        const r = await this.repositorio.listarIngresosPorPeriodo(desde, hasta);
        return { tipo: f.tipo, datos: r };
      }
      case "SERVICIOS":
        return { tipo: f.tipo, datos: await this.repositorio.listarServiciosSolicitados(desde, hasta) };
      case "ROTACION_INVENTARIO": {
        const filas = await this.repositorio.listarRotacionInventario(desde, hasta, f.categoriaId);
        return {
          tipo: f.tipo,
          datos: filas.map((p) => ({ ...p, rotacion: clasificarRotacion(p.total, p.stock_actual) })),
        };
      }
      case "PROVEEDORES": {
        const r = await this.repositorio.obtenerRentabilidadProveedores(desde, hasta);
        return {
          tipo: f.tipo,
          datos: {
            proveedores: r.proveedores.map((p) => ({ ...p, margen_pct: calcularMargenPorcentaje(p.margen, p.ingreso) })),
            productos: r.productos.map((p) => ({ ...p, margen_pct: calcularMargenPorcentaje(p.margen, p.ingreso) })),
          },
        };
      }
      case "INVENTARIO_CRITICO":
        return { tipo: f.tipo, datos: await this.repositorio.listarStockCritico(f.categoriaId) };
      case "RENDIMIENTO_TECNICO":
        return {
          tipo: f.tipo,
          datos: conCumplimiento(await this.repositorio.listarRendimientoTecnicos(desde, hasta, f.tecnicoId)),
        };
    }
  }

  /** Texto para la bitácora: tipo, período, filtros y acción (postcondición del CU20). */
  private describir(f: FiltrosReporte, filtrosTexto: string[], accion: string): string {
    const periodo = f.desde && f.hasta ? `${f.desde} a ${f.hasta}` : "estado actual";
    return [`${accion} de reporte: ${NOMBRE_REPORTE[f.tipo]}`, `Período: ${periodo}`, ...filtrosTexto].join(" | ");
  }
}
