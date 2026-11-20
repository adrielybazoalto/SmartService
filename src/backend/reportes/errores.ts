// =====================================================================
//  CU20 - Errores del módulo de reportes
//  Mensajes iguales a la tabla de Excepciones del detalle del CU20.
// =====================================================================

export class ErrorNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorNegocio";
  }
}

export const MENSAJES = {
  SIN_SESION: "Su sesión ha expirado. Inicie sesión nuevamente.",
  SIN_PERMISO: "No tiene permiso para generar reportes.",
  SIN_PERMISO_EXPORTAR: "No tiene permiso para exportar reportes.",
  FALTA_TIPO: "Seleccione el tipo de reporte.",
  FALTAN_FECHAS: "Ingrese la fecha desde y la fecha hasta.",
  FECHA_INVALIDA: "Ingrese fechas válidas.",
  DESDE_MAYOR: "La fecha desde no puede ser mayor que la fecha hasta.",
  HASTA_FUTURA: "La fecha hasta no puede ser posterior a hoy.",
  PERIODO_MAXIMO: "El período máximo es de 12 meses.",
  TECNICO_INVALIDO: "El técnico seleccionado no existe o está inactivo.",
  CATEGORIA_INVALIDA: "La categoría seleccionada no existe.",
  SIN_DATOS: "No se encontraron datos para el período seleccionado.",
  SIN_STOCK_CRITICO: "No hay productos con stock crítico para los filtros seleccionados.",
  SIN_PRODUCTOS: "No hay productos activos para los filtros seleccionados.",
  SIN_REPORTE: "Genere un reporte antes de exportar.",
  FORMATO_INVALIDO: "Seleccione el formato de exportación: PDF o Excel.",
} as const;

export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorNegocio) return error.message;
  if (error instanceof Error) {
    // exigirPermiso (lib/permisos) usa estos textos
    if (error.message.startsWith("No autorizado: inicia sesión")) return MENSAJES.SIN_SESION;
    if (error.message.startsWith("No autorizado")) return MENSAJES.SIN_PERMISO;
    return error.message;
  }
  return "Ocurrió un error inesperado.";
}
