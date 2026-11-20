// =====================================================================
//  CU20 - Fábrica: arma el control con su repositorio (solo servidor)
// =====================================================================

import { ReporteController } from "./control-reportes";
import { obtenerClienteSupabase } from "./integracion";
import { ReporteRepositorio } from "./repositorio";

export const RUTA_REPORTES = "/reportes";

export function crearReporteController(): ReporteController {
  return new ReporteController(new ReporteRepositorio(obtenerClienteSupabase()));
}
