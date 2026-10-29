// =====================================================================
//  CU13 - Emitir Notas de Servicio y Liquidación Operativa
//  CONTROL: LiquidacionController (mismo nombre que el diagrama de análisis)
//  Coordina el caso de uso: usa reglas, autorización y el repositorio.
//  No consulta la base directamente.
// =====================================================================

import { verificarPermisoEmitirNota } from "./autorizacion";
import { ErrorNegocio, MENSAJES } from "./errores";
import type { LiquidacionRepositorio } from "./repositorio";
import {
  calcularSaldo,
  requiereElegirServicio,
  validarAnticipo,
  verificarOrdenLiquidable,
} from "./reglas";
import type {
  DetalleLiquidacion,
  EmitirNotaInput,
  NotaServicio,
  OrdenPendienteLiquidar,
} from "./types";

export class LiquidacionController {
  constructor(private readonly repositorio: LiquidacionRepositorio) {}

  /** UI_OrdenesFinalizadas.mostrarOrdenesSinNota */
  listarOrdenesFinalizadas(): Promise<OrdenPendienteLiquidar[]> {
    return this.repositorio.listarOrdenesSinNota();
  }

  /** Excepción del CU13: orden COMPLETADA y sin nota. */
  async verificarEstadoOrden(ordenTrabajoId: number): Promise<OrdenPendienteLiquidar> {
    return verificarOrdenLiquidable(await this.repositorio.obtenerOrden(ordenTrabajoId));
  }

  /**
   * Pasos 2 y 3 del flujo principal:
   * calcularCostoMateriales + calcularManoDeObra + calcularMontoTotal
   */
  async obtenerDetalleLiquidacion(
    ordenTrabajoId: number,
    servicioId?: number | null,
  ): Promise<DetalleLiquidacion> {
    const orden = await this.verificarEstadoOrden(ordenTrabajoId);
    const requiereServicio = requiereElegirServicio(orden);

    const [materiales, calculo, servicios] = await Promise.all([
      this.repositorio.listarMaterialesConsumidos(ordenTrabajoId),
      this.repositorio.calcularLiquidacion(ordenTrabajoId, servicioId),
      requiereServicio ? this.repositorio.listarServiciosActivos() : Promise.resolve([]),
    ]);

    return { orden, materiales, calculo, requiereServicio, servicios };
  }
    /** Orden que ya tiene nota: devuelve la nota y su detalle (para ver y descargar el PDF). */
  async consultarNotaEmitida(
    ordenTrabajoId: number,
  ): Promise<{ nota: NotaServicio; detalle: DetalleLiquidacion } | null> {
    const nota = await this.repositorio.obtenerNotaDeOrden(ordenTrabajoId);
    if (!nota) return null;
    const fila = await this.repositorio.obtenerOrden(ordenTrabajoId);
    if (!fila) return null;

    const { tieneNota: _tieneNota, ...orden } = fila;
    void _tieneNota;
    const materiales = await this.repositorio.listarMaterialesConsumidos(ordenTrabajoId);
    const costoMateriales = Math.round(materiales.reduce((s, m) => s + m.subtotal, 0) * 100) / 100;
    const costoManoObra = Math.max(0, Math.round((nota.monto_total - costoMateriales) * 100) / 100);
    const horas = orden.horas_trabajadas;

    return {
      nota,
      detalle: {
        orden,
        materiales,
        calculo: {
          costo_materiales: costoMateriales,
          horas_trabajadas: horas,
          tarifa_hora: horas > 0 ? Math.round((costoManoObra / horas) * 100) / 100 : 0,
          costo_mano_obra: costoManoObra,
          total_liquidacion: nota.monto_total,
        },
        requiereServicio: false,
        servicios: [],
      },
    };
  }

  /** Paso 5: saldo = total - anticipo */
  calcularSaldo(total: number, anticipo: number): number {
    return calcularSaldo(total, anticipo);
  }

  /** Pasos 6 y 7: emitir la nota de servicio y registrar en bitácora */
  async emitirNotaServicio(input: EmitirNotaInput, ip: string | null): Promise<NotaServicio> {
    const usuario = verificarPermisoEmitirNota(await this.repositorio.obtenerUsuarioActual());

    const orden = await this.verificarEstadoOrden(input.ordenTrabajoId);
    if (requiereElegirServicio(orden) && !input.servicioId) {
      throw new ErrorNegocio(MENSAJES.FALTA_SERVICIO);
    }

    const calculo = await this.repositorio.calcularLiquidacion(input.ordenTrabajoId, input.servicioId);
    validarAnticipo(input.anticipo, calculo.total_liquidacion);

    // La base vuelve a validar todo dentro de una sola transacción.
    return this.repositorio.emitirNota({
      ordenTrabajoId: input.ordenTrabajoId,
      anticipo: input.anticipo,
      usuarioId: usuario.id,
      ip,
      servicioId: input.servicioId ?? null,
    });
  }
}
