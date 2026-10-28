// =====================================================================
//  CU13 - Generación del PDF de la Nota de Servicio (navegador)
//  LiquidacionController.generarPDF / UI_Liquidacion.mostrarNotaPDF
//  Requiere:  npm install jspdf jspdf-autotable
//  Si el proyecto ya tiene un generador de PDF (el de cotizaciones del
//  CU08), pueden reemplazar esta función por ese generador.
// =====================================================================

import type { DetalleLiquidacion, NotaServicio } from "@/backend/liquidacion/types";
import { formatearBs, formatearFecha } from "./formato";

export async function descargarNotaServicioPDF(
  nota: NotaServicio,
  detalle: DetalleLiquidacion,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const margen = 15;
  let y = 18;

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("SgarNet - Seguridad Electrónica", margen, y);
  doc.setFontSize(13);
  doc.text(`NOTA DE SERVICIO ${nota.numero_nota}`, 200, y, { align: "right" });

  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Fecha de emisión: ${formatearFecha(nota.fecha_emision)}`, margen, y);
  doc.text(`Estado: ${nota.estado}`, 200, y, { align: "right" });
  y += 6;
  doc.text(`Orden de trabajo: ${detalle.orden.codigo_orden} (${detalle.orden.tipo_trabajo})`, margen, y);
  y += 6;
  doc.text(`Cliente: ${detalle.orden.cliente_nombre ?? "—"}`, margen, y);
  if (detalle.orden.numero_cotizacion) {
    doc.text(`Cotización: ${detalle.orden.numero_cotizacion}`, 200, y, { align: "right" });
  }

  // Materiales consumidos
  autoTable(doc, {
    startY: y + 8,
    head: [["Material", "Cantidad", "Precio unit.", "Subtotal"]],
    body: detalle.materiales.length
      ? detalle.materiales.map((m) => [
          m.producto_nombre,
          String(m.cantidad_utilizada),
          formatearBs(m.precio_venta),
          formatearBs(m.subtotal),
        ])
      : [["Sin materiales registrados", "", "", ""]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30, 64, 120] },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: margen, right: margen },
  });

  // Mano de obra y totales
  const c = detalle.calculo;
  const saldo = Math.round((nota.monto_total - nota.anticipo_pagado) * 100) / 100;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finTabla = (doc as any).lastAutoTable?.finalY ?? y + 30;

  autoTable(doc, {
    startY: finTabla + 6,
    body: [
      ["Costo de materiales", formatearBs(c.costo_materiales)],
      [`Mano de obra (${c.horas_trabajadas} h x ${formatearBs(c.tarifa_hora)})`, formatearBs(c.costo_mano_obra)],
      ["MONTO TOTAL", formatearBs(nota.monto_total)],
      ["Anticipo pagado", `- ${formatearBs(nota.anticipo_pagado)}`],
      ["SALDO PENDIENTE", formatearBs(saldo)],
    ],
    styles: { fontSize: 10 },
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right" } },
    margin: { left: 110, right: margen },
    theme: "grid",
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finTotales = (doc as any).lastAutoTable?.finalY ?? 200;
  doc.setFontSize(9);
  doc.text("Recibí conforme: ______________________", margen, finTotales + 25);
  doc.text("Entregué conforme: ______________________", 110, finTotales + 25);

  doc.save(`${nota.numero_nota}.pdf`);
}
