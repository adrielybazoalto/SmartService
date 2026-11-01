// =====================================================================
//  CU13 - Fábrica: arma el control con su repositorio (solo servidor)
//  Cliente de Supabase: getSupabaseServiceClient() (vía integracion.ts).
// =====================================================================

import { LiquidacionController } from "./control-emitir-nota";
import { obtenerClienteSupabase } from "./integracion";
import { LiquidacionRepositorio } from "./repositorio";
import { PasarelaPago } from "@/backend/pagos/pasarela-pago";

export const RUTA_LIQUIDACION = "/liquidacion";

export function crearLiquidacionController(): LiquidacionController {
  const supabase = obtenerClienteSupabase();
  return new LiquidacionController(new LiquidacionRepositorio(supabase), new PasarelaPago());
}
