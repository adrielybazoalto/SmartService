// =====================================================================
//  CU20 - Reglas de negocio (funciones puras, sin base de datos).
//  Se usan en el servidor y también en el navegador (atajos de fecha),
//  por eso no importan nada de servidor.
// =====================================================================

import { ahoraBolivia } from "@/lib/fechas";
import { ErrorNegocio, MENSAJES } from "./errores";
import {
  TIPOS_REPORTE,
  type Agrupacion,
  type ClaseRotacion,
  type Atajo,
  type FiltrosReporte,
  type Reporte,
  type TipoReporte,
} from "./types";

const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Reportes que usan cada filtro opcional. */
export const USA_TECNICO: TipoReporte[] = ["RENDIMIENTO_TECNICO"];
export const USA_CATEGORIA: TipoReporte[] = ["ROTACION_INVENTARIO", "INVENTARIO_CRITICO"];
/** FA3: el inventario crítico es el estado actual, no pide período. */
export const SIN_PERIODO: TipoReporte[] = ["INVENTARIO_CRITICO"];

// ---------------- Fechas (texto 'YYYY-MM-DD', calculadas en UTC) ----------------

function aFecha(texto: string): Date {
  const [a, m, d] = texto.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
}

function aTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

function sumarDias(texto: string, dias: number): string {
  const f = aFecha(texto);
  f.setUTCDate(f.getUTCDate() + dias);
  return aTexto(f);
}

/** ¿El texto es una fecha real? (descarta 2026-02-30) */
function esFechaValida(texto: string): boolean {
  return FECHA.test(texto) && aTexto(aFecha(texto)) === texto;
}

/** Fecha de hoy en Bolivia (RN5): 'YYYY-MM-DD'. */
export function hoyBolivia(): string {
  return ahoraBolivia().slice(0, 10);
}

/** Días del período, contando ambos extremos. */
export function diasDelPeriodo(desde: string, hasta: string): number {
  return Math.round((aFecha(hasta).getTime() - aFecha(desde).getTime()) / 86_400_000) + 1;
}

/** FA1: fechas de inicio y fin de cada atajo. La semana empieza el lunes. */
export function calcularRangoAtajo(atajo: Atajo, hoy: string = hoyBolivia()): { desde: string; hasta: string } {
  const [anio, mes] = hoy.split("-").map(Number);
  const mm = String(mes).padStart(2, "0");
  switch (atajo) {
    case "HOY":
      return { desde: hoy, hasta: hoy };
    case "ESTA_SEMANA": {
      const diaSemana = (aFecha(hoy).getUTCDay() + 6) % 7; // lunes = 0
      return { desde: sumarDias(hoy, -diaSemana), hasta: hoy };
    }
    case "ESTE_MES":
      return { desde: `${anio}-${mm}-01`, hasta: hoy };
    case "MES_ANTERIOR": {
      const inicio = new Date(Date.UTC(anio, mes - 2, 1));
      const fin = new Date(Date.UTC(anio, mes - 1, 0));
      return { desde: aTexto(inicio), hasta: aTexto(fin) };
    }
    case "ESTE_ANIO":
      return { desde: `${anio}-01-01`, hasta: hoy };
  }
}

/** RN3: hasta 31 días se agrupa por día; períodos más largos, por mes. */
export function decidirAgrupacion(desde: string, hasta: string): Agrupacion {
  return diasDelPeriodo(desde, hasta) <= 31 ? "DIA" : "MES";
}

/** RN2: el período no puede pasar de 12 meses (ej.: 01/01 al 31/12 sí; al 01/01 del año siguiente no). */
function superaDoceMeses(desde: string, hasta: string): boolean {
  const [a, m, d] = hasta.split("-").map(Number);
  const limite = new Date(Date.UTC(a - 1, m - 1, d));
  limite.setUTCDate(limite.getUTCDate() + 1); // mismo día del año anterior + 1
  return aFecha(desde) < limite;
}

function idOpcional(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

/**
 * Paso 7: valida los parámetros de consulta en el orden de la tabla de
 * Excepciones del CU20. Devuelve los filtros limpios.
 */
export function validarFiltrosReporte(datos: unknown, hoy: string = hoyBolivia()): FiltrosReporte {
  const d = (datos ?? {}) as Record<string, unknown>;

  const tipo = String(d.tipo ?? "") as TipoReporte;
  if (!TIPOS_REPORTE.includes(tipo)) throw new ErrorNegocio(MENSAJES.FALTA_TIPO);

  let desde: string | null = null;
  let hasta: string | null = null;
  if (!SIN_PERIODO.includes(tipo)) {
    desde = String(d.desde ?? "").trim();
    hasta = String(d.hasta ?? "").trim();
    if (!desde || !hasta) throw new ErrorNegocio(MENSAJES.FALTAN_FECHAS);
    if (!esFechaValida(desde) || !esFechaValida(hasta)) throw new ErrorNegocio(MENSAJES.FECHA_INVALIDA);
    if (desde > hasta) throw new ErrorNegocio(MENSAJES.DESDE_MAYOR);
    if (hasta > hoy) throw new ErrorNegocio(MENSAJES.HASTA_FUTURA);
    if (superaDoceMeses(desde, hasta)) throw new ErrorNegocio(MENSAJES.PERIODO_MAXIMO);
  }

  const tecnicoId = USA_TECNICO.includes(tipo) ? idOpcional(d.tecnicoId) : null;
  if (Number.isNaN(tecnicoId)) throw new ErrorNegocio(MENSAJES.TECNICO_INVALIDO);
  const categoriaId = USA_CATEGORIA.includes(tipo) ? idOpcional(d.categoriaId) : null;
  if (Number.isNaN(categoriaId)) throw new ErrorNegocio(MENSAJES.CATEGORIA_INVALIDA);

  return { tipo, desde, hasta, tecnicoId, categoriaId };
}

/** Cumplimiento = horas programadas ÷ horas reales × 100 (null si no hay horas reales). */
export function calcularEficiencia(horasProgramadas: number, horasReales: number): number | null {
  if (!(horasReales > 0) || !(horasProgramadas > 0)) return null;
  return Math.round((horasProgramadas / horasReales) * 1000) / 10;
}

/**
 * RN7 · Rotación de inventario en el período:
 *   Sin movimiento: ninguna salida.
 *   Alta: salió al menos lo que hay en stock (salidas >= stock actual).
 *   Baja: tuvo salidas, pero menos que su stock.
 */
export function clasificarRotacion(salidas: number, stockActual: number): ClaseRotacion {
  if (!(salidas > 0)) return "SIN_MOVIMIENTO";
  return salidas >= stockActual ? "ALTA" : "BAJA";
}

/** RN8 · margen % = margen ÷ ingreso × 100 (null si no hubo ingreso). */
export function calcularMargenPorcentaje(margen: number, ingreso: number): number | null {
  if (!(ingreso > 0)) return null;
  return Math.round((margen / ingreso) * 1000) / 10;
}

/** RN4: balance operativo = ingresos - compras a proveedores. */
export function calcularBalance(ingresos: number, compras: number): number {
  return r2(ingresos - compras);
}

/** Promedio del cumplimiento de los técnicos que tienen dato. */
export function promedioCumplimiento(valores: (number | null)[]): number | null {
  const con = valores.filter((v): v is number => v !== null);
  if (con.length === 0) return null;
  return Math.round((con.reduce((s, v) => s + v, 0) / con.length) * 10) / 10;
}

/** Excepción del paso 8: no hay registros que mostrar. */
export function verificarDatosReporte(reporte: Reporte): void {
  let vacio: boolean;
  switch (reporte.tipo) {
    case "RESUMEN_GENERAL": {
      const d = reporte.datos;
      vacio = d.total_ingresos === 0 && d.total_compras === 0 && d.ordenes_finalizadas === 0
        && d.top_servicios.length === 0 && d.top_materiales.length === 0;
      break;
    }
    case "INGRESOS":
      vacio = reporte.datos.cantidad === 0;
      break;
    case "INVENTARIO_CRITICO":
      if (reporte.datos.length === 0) throw new ErrorNegocio(MENSAJES.SIN_STOCK_CRITICO);
      return;
    case "PROVEEDORES":
      vacio = reporte.datos.proveedores.length === 0 && reporte.datos.productos.length === 0;
      break;
    case "ROTACION_INVENTARIO":
      // Lista todos los productos activos: solo está vacía si no hay productos
      if (reporte.datos.length === 0) throw new ErrorNegocio(MENSAJES.SIN_PRODUCTOS);
      return;
    default:
      vacio = reporte.datos.length === 0;
  }
  if (vacio) throw new ErrorNegocio(MENSAJES.SIN_DATOS);
}
