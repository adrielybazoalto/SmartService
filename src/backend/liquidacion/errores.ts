// =====================================================================
//  CU13 - Errores del módulo de liquidación
//  ErrorNegocio = regla del caso de uso no cumplida (mensaje para el usuario).
// =====================================================================

export class ErrorNegocio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorNegocio";
  }
}

/** Mensajes del CU13 (iguales a los de la especificación del caso de uso). */
export const MENSAJES = {
  ORDEN_NO_EXISTE: "La orden de trabajo no existe.",
  ORDEN_NO_FINALIZADA: "No se puede liquidar una orden que no se encuentra en estado Finalizada.",
  ORDEN_CON_NOTA: (codigo: string) => `La orden ${codigo} ya tiene una nota de servicio emitida.`,
  SIN_SESION: "Debe iniciar sesión con un usuario activo.",
  SIN_PERMISO: "Su rol no tiene permiso para emitir notas de servicio.",
  ANTICIPO_INVALIDO: "El anticipo debe ser un número mayor o igual a cero.",
  ANTICIPO_MAYOR_TOTAL: "El anticipo no puede ser mayor al monto total.",
  FALTA_SERVICIO: "La orden no tiene cotización: seleccione el servicio para calcular la mano de obra.",
  ID_INVALIDO: "El identificador de la orden no es válido.",
} as const;

export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorNegocio) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}
