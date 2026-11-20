// =====================================================================
//  CU20 - Fábrica: arma el servicio con sus datos (solo servidor)
// =====================================================================

import { ServicioReportes } from "./servicio-reportes";
import { obtenerClienteSupabase } from "./integracion";
import { DatosReportes } from "./repositorio";

export const RUTA_REPORTES = "/reportes";

export function crearReportes(): ServicioReportes {
  return new ServicioReportes(new DatosReportes(obtenerClienteSupabase()));
}
