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
  validarPagoManual,
  verificarNotaCobrable,
  verificarOrdenLiquidable,
} from "./reglas";
import type {
  DetalleLiquidacion,
  EmitirNotaInput,
  NotaPendientePago,
  NotaServicio,
  OrdenPendienteLiquidar,
} from "./types";
import type { PasarelaPago } from "@/backend/pagos/pasarela-pago";

export class LiquidacionController {
  constructor(
    private readonly repositorio: LiquidacionRepositorio,
    private readonly pasarela?: PasarelaPago,
  ) {}

  /** UI_OrdenesFinalizadas.mostrarOrdenesSinNota */
  listarOrdenesFinalizadas(): Promise<OrdenPendienteLiquidar[]> {
    return this.repositorio.listarOrdenesSinNota();
  }

  /** Excepción del CU13: orden FINALIZADA y sin nota. */
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

  /** Notas PENDIENTES con saldo por cobrar */
  listarNotasPendientesPago(): Promise<NotaPendientePago[]> {
    return this.repositorio.listarNotasPendientesPago();
  }

  /**
   * Flujo alternativo "Registrar pago del saldo" con EFECTIVO, QR o
   * TRANSFERENCIA: el Encargado confirma que recibió el dinero.
   */
  async registrarPagoSaldo(
    notaId: number,
    metodo: string,
    referencia: string | null,
    ip: string | null,
  ): Promise<NotaServicio> {
    const usuario = verificarPermisoEmitirNota(await this.repositorio.obtenerUsuarioActual());
    const pago = validarPagoManual(metodo, referencia);
    verificarNotaCobrable(await this.repositorio.obtenerNotaPorId(notaId));
    return this.repositorio.registrarPagoManual({ notaId, ...pago, usuarioId: usuario.id, ip });
  }

  /**
   * Flujo alternativo "Cobrar saldo con tarjeta" (pasos 11 a 13)
   * NotaServicio.calcularSaldo + PasarelaPago.crearSesionPago
   * Devuelve el enlace de la página de pago de Stripe.
   */
  async iniciarCobroSaldo(notaId: number, urlBase: string): Promise<{ url: string }> {
    verificarPermisoEmitirNota(await this.repositorio.obtenerUsuarioActual());
    if (!this.pasarela) throw new ErrorNegocio("La pasarela de pago no está configurada.");

    const nota = await this.repositorio.obtenerNotaPorId(notaId);
    const saldo = verificarNotaCobrable(nota);
    const retorno = `${urlBase}/liquidacion/${nota!.orden_trabajo_id}`;

    const sesion = await this.pasarela.crearSesionPago({
      montoBs: saldo,
      descripcion: `Saldo de la nota de servicio ${nota!.numero_nota} - SgarNet`,
      urlRetorno: `${retorno}?pago=exito`,
      urlCancelacion: `${retorno}?pago=cancelado`,
      metadata: { tipo: "NOTA_SERVICIO", nota_id: String(nota!.id), numero_nota: nota!.numero_nota, saldo_bs: saldo.toFixed(2) },
    });
    return { url: sesion.url };
  }

  /**
   * Pasos 15 a 17: al volver de Stripe se verifica el pago y la nota pasa
   * a PAGADA (NotaServicio.registrarPago + Bitacora.registrarEvento).
   */
  async confirmarPagoSaldo(sessionId: string, ip: string | null): Promise<NotaServicio> {
    const usuario = verificarPermisoEmitirNota(await this.repositorio.obtenerUsuarioActual());
    if (!this.pasarela) throw new ErrorNegocio("La pasarela de pago no está configurada.");

    const pago = await this.pasarela.verificarPago(sessionId);
    if (!pago.pagado) throw new ErrorNegocio(MENSAJES.PAGO_NO_APROBADO);

    const notaId = Number(pago.metadata.nota_id);
    if (pago.metadata.tipo !== "NOTA_SERVICIO" || !Number.isInteger(notaId)) {
      throw new ErrorNegocio(MENSAJES.PAGO_NO_CORRESPONDE);
    }

    return this.repositorio.registrarPago({
      notaId,
      sessionId: pago.sessionId,
      montoBs: Number(pago.metadata.saldo_bs),
      usuarioId: usuario.id,
      ip,
    });
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

    // Con cotización, el anticipo lo pone la base (sp_emitir_nota_servicio) y aquí se ignora.
    if (orden.cotizacion_id === null) {
      const calculo = await this.repositorio.calcularLiquidacion(input.ordenTrabajoId, input.servicioId);
      validarAnticipo(input.anticipo, calculo.total_liquidacion);
    }

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
