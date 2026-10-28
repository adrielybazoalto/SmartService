// =====================================================================
//  CU13 - Validación de los datos que llegan desde el formulario
//  (sin librerías externas; si el resto del proyecto usa zod en sus
//  schema.ts, pueden reescribir esta función con zod igual que ellos)
// =====================================================================

import { ErrorNegocio, MENSAJES } from "./errores";
import type { EmitirNotaInput } from "./types";

function enteroPositivo(valor: unknown): number | null {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function validarEmitirNotaInput(datos: unknown): EmitirNotaInput {
  const d = (datos ?? {}) as Record<string, unknown>;

  const ordenTrabajoId = enteroPositivo(d.ordenTrabajoId);
  if (ordenTrabajoId === null) throw new ErrorNegocio(MENSAJES.ID_INVALIDO);

  const anticipo = Number(d.anticipo);
  if (!Number.isFinite(anticipo) || anticipo < 0) throw new ErrorNegocio(MENSAJES.ANTICIPO_INVALIDO);

  const servicioId =
    d.servicioId === null || d.servicioId === undefined || d.servicioId === ""
      ? null
      : enteroPositivo(d.servicioId);

  return { ordenTrabajoId, anticipo: Math.round(anticipo * 100) / 100, servicioId };
}
