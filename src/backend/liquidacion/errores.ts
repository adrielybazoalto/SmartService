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
  ORDEN_NO_FINALIZADA: "No se puede liquidar una orden que no se encuentra en estado Finalizada (Completada).",
  ORDEN_CON_NOTA: (codigo: string) => `La orden ${codigo} ya tiene una nota de servicio emitida.`,
  SIN_SESION: "Debe iniciar sesión con un usuario activo.",
  SIN_PERMISO: "Su rol no tiene permiso para emitir notas de servicio.",
  ANTICIPO_INVALIDO: "El anticipo debe ser un número mayor o igual a cero.",
  ANTICIPO_MAYOR_TOTAL: "El anticipo más los abonos registrados en caja no pueden superar el monto total.",
  FALTA_SERVICIO: "La orden no tiene cotización: seleccione el servicio para calcular la mano de obra.",
  ID_INVALIDO: "El identificador de la orden no es válido.",
  NOTA_NO_EXISTE: "La nota de servicio no existe.",
  NOTA_NO_PENDIENTE: (numero: string) => `La nota ${numero} no está pendiente de pago.`,
  SIN_SALDO: "La nota no tiene saldo pendiente.",
  PAGO_NO_APROBADO: "El pago con tarjeta no fue confirmado. La nota sigue PENDIENTE.",
  PAGO_NO_CORRESPONDE: "El pago no corresponde a una nota de servicio.",
  METODO_INVALIDO: "Método de pago inválido: use Efectivo, QR, Transferencia o Tarjeta.",
  FALTA_REFERENCIA: "Ingrese el número de referencia de la transferencia.",
} as const;

export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorNegocio) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error inesperado.";
}
