// =====================================================================
//  CU13 - Fábrica: arma el control con su repositorio (solo servidor)
//  El cliente de Supabase sale de @/lib/supabase (vía integracion.ts).
// =====================================================================

import { LiquidacionController } from "./control-emitir-nota";
import { obtenerClienteSupabase } from "./integracion";
import { LiquidacionRepositorio } from "./repositorio";

export const RUTA_LIQUIDACION = "/liquidacion";

export async function crearLiquidacionController(): Promise<LiquidacionController> {
  const supabase = await obtenerClienteSupabase();
  return new LiquidacionController(new LiquidacionRepositorio(supabase));
}
