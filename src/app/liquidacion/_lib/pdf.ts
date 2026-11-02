// =====================================================================
//  CU13 - Generación del PDF de la Nota de Servicio (navegador)
//  LiquidacionController.generarPDF / UI_Liquidacion.mostrarNotaPDF
//  Nota completa: cliente, establecimiento, orden, técnicos, cotización
//  de referencia, materiales, mano de obra, pagos a cuenta (anticipo del
//  contrato + abonos registrados en caja), saldo y cobro del saldo.
// =====================================================================

import type { DetalleLiquidacion, NotaServicio } from "@/backend/liquidacion/types";
import { etiquetaMetodoPago, formatearBs, formatearFecha, formatearFechaHora } from "./formato";
// TIMESTAMP sin zona en hora de Bolivia (orden_trabajo, anticipo, recibos): se muestra tal cual
import { formatearFechaHora as formatearTimestamp } from "@/lib/fechas";

const AZUL: [number, number, number] = [30, 64, 120];
const r2 = (n: number) => Math.round(n * 100) / 100;

export async function descargarNotaServicioPDF(
  nota: NotaServicio,
  detalle: DetalleLiquidacion,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const margen = 15;
  const derecha = 200;
  const { orden, calculo: c, datos, abonos, total_abonos, reciboSaldo } = detalle;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finY = (y: number) => ((doc as any).lastAutoTable?.finalY ?? y) as number;

  // ---------------- Encabezado ----------------
  let y = 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("SgarNet - Seguridad Electrónica", margen, y);
  doc.setFontSize(12);
  doc.text("NOTA DE SERVICIO", derecha, y, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Liquidación operativa de orden de trabajo", margen, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(nota.numero_nota, derecha, y, { align: "right" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Fecha de emisión: ${formatearFecha(nota.fecha_emision)}`, derecha, y, { align: "right" });
  y += 5;
  doc.text(`Estado: ${nota.estado}`, derecha, y, { align: "right" });
  doc.setDrawColor(...AZUL);
  doc.line(margen, y + 3, derecha, y + 3);

  // ---------------- Cliente y orden ----------------
  const cli = datos.cliente;
  const est = datos.establecimiento;
  const tecnicos = datos.tecnicos.length
    ? datos.tecnicos.map((t) => t.nombre + (t.es_lider ? " (líder)" : "")).join(", ")
    : "—";
  autoTable(doc, {
    startY: y + 7,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 0.8 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 30 }, 2: { fontStyle: "bold", cellWidth: 30 } },
    body: [
      ["Cliente:", cli?.nombre ?? orden.cliente_nombre ?? "—", "Orden de trabajo:", `${orden.codigo_orden} (${orden.tipo_trabajo})`],
      ["Razón social:", cli?.razon_social ?? "—", "Inicio real:", formatearTimestamp(orden.fecha_inicio_real)],
      ["CI / NIT:", cli?.documento_identidad ?? "—", "Fin real:", formatearTimestamp(orden.fecha_fin_real)],
      ["Teléfono:", cli?.telefono ?? "—", "Cotización:", orden.numero_cotizacion ?? "Correctiva sin cotización"],
      ["Establecimiento:", est?.nombre ?? "—", "Monto pactado:", orden.total_cotizacion != null ? formatearBs(orden.total_cotizacion) : "—"],
      ["Dirección:", est?.direccion ?? "—", "Técnicos:", tecnicos],
    ],
    margin: { left: margen, right: margen },
  });

  // ---------------- Materiales ----------------
  autoTable(doc, {
    startY: finY(y) + 5,
    head: [["Materiales y equipos consumidos en campo", "Cantidad", "Precio unit.", "Subtotal"]],
    body: detalle.materiales.length
      ? detalle.materiales.map((m) => [
          m.producto_nombre,
          String(m.cantidad_utilizada),
          formatearBs(m.precio_venta),
          formatearBs(m.subtotal),
        ])
      : [["Sin materiales registrados", "", "", ""]],
    foot: [["Total materiales", "", "", formatearBs(c.costo_materiales)]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: AZUL },
    footStyles: { fillColor: [235, 239, 245], textColor: 20 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: margen, right: margen },
  });

  // ---------------- Mano de obra ----------------
  autoTable(doc, {
    startY: finY(y) + 4,
    head: [["Mano de obra", "Horas", "Tarifa por hora", "Subtotal"]],
    body: [[
      orden.numero_cotizacion ? `Servicio técnico (tarifa pactada en ${orden.numero_cotizacion})` : "Servicio técnico (tarifa del catálogo)",
      `${c.horas_trabajadas} h` + (c.horas_trabajadas !== orden.horas_trabajadas ? ` (reales ${orden.horas_trabajadas} h)` : ""),
      formatearBs(c.tarifa_hora),
      formatearBs(c.costo_mano_obra),
    ]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: AZUL },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
    margin: { left: margen, right: margen },
  });

  // ---------------- Pagos a cuenta ----------------
  // Anticipo: registrado en la cotización (CU08) o, sin cotización, el ingresado al emitir
  const reg = orden.anticipo_cotizacion;
  const anticipo = reg ? reg.monto : Math.max(0, r2(nota.anticipo_pagado - total_abonos));
  const totalACuenta = r2(anticipo + total_abonos);
  const excedente = Math.max(0, r2(totalACuenta - nota.anticipo_pagado));
  const filasPagos: string[][] = [];
  if (anticipo > 0) {
    filasPagos.push([
      "—",
      reg ? `Anticipo al aprobar ${orden.numero_cotizacion ?? "la cotización"} (CU08)` : "Anticipo entregado",
      reg?.fecha ? formatearTimestamp(reg.fecha) : "—",
      reg ? etiquetaMetodoPago(reg.metodo) + (reg.referencia ? ` Ref. ${reg.referencia}` : "") : "—",
      formatearBs(anticipo),
    ]);
  }
  for (const p of abonos) {
    filasPagos.push([
      p.nro_comprobante,
      "Abono registrado en caja",
      formatearTimestamp(p.fecha),
      etiquetaMetodoPago(p.tipo_pago) + (p.referencia_pago ? ` Ref. ${p.referencia_pago}` : ""),
      formatearBs(p.monto),
    ]);
  }
  autoTable(doc, {
    startY: finY(y) + 4,
    head: [["Recibo", "Pagos a cuenta", "Fecha", "Método", "Monto"]],
    body: filasPagos.length ? filasPagos : [["", "Sin pagos a cuenta", "", "", formatearBs(0)]],
    foot: [["", "Total pagado a cuenta", "", "", formatearBs(totalACuenta)]],
    styles: { fontSize: 9 },
    headStyles: { fillColor: AZUL },
    footStyles: { fillColor: [235, 239, 245], textColor: 20 },
    columnStyles: { 4: { halign: "right" } },
    margin: { left: margen, right: margen },
  });

  // ---------------- Resumen ----------------
  const saldoNota = r2(nota.monto_total - nota.anticipo_pagado);
  const pagada = nota.estado.toUpperCase() === "PAGADA";
  const diferencia = orden.total_cotizacion != null ? r2(nota.monto_total - orden.total_cotizacion) : null;
  const resumen: string[][] = [
    ["Costo de materiales", formatearBs(c.costo_materiales)],
    ["Costo de mano de obra", formatearBs(c.costo_mano_obra)],
    ["MONTO TOTAL DEL SERVICIO", formatearBs(nota.monto_total)],
  ];
  if (diferencia !== null) {
    resumen.push(["Diferencia con lo cotizado", `${diferencia >= 0 ? "+" : "-"} ${formatearBs(Math.abs(diferencia))}`]);
  }
  resumen.push(["(-) Pagado a cuenta (aplicado)", `- ${formatearBs(nota.anticipo_pagado)}`]);
  if (excedente > 0) resumen.push(["Saldo a favor del cliente", formatearBs(excedente)]);
  resumen.push(["SALDO DE LA NOTA", formatearBs(saldoNota)]);
  if (pagada && nota.metodo_pago && saldoNota > 0) {
    resumen.push([
      `Saldo cobrado: ${etiquetaMetodoPago(nota.metodo_pago)} (${formatearFechaHora(nota.fecha_pago ?? null)})` +
        (reciboSaldo ? ` Recibo ${reciboSaldo.nro_comprobante}` : "") +
        (nota.referencia_pago && nota.referencia_pago !== reciboSaldo?.nro_comprobante ? ` Ref. ${nota.referencia_pago}` : ""),
      `- ${formatearBs(saldoNota)}`,
    ]);
  }
  resumen.push(["SALDO PENDIENTE", formatearBs(pagada ? 0 : saldoNota)]);

  autoTable(doc, {
    startY: finY(y) + 5,
    body: resumen,
    styles: { fontSize: 9.5 },
    columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "right", cellWidth: 32 } },
    margin: { left: 100, right: margen },
    theme: "grid",
    didParseCell: (d) => {
      const t = String(d.row.raw && (d.row.raw as string[])[0]);
      if (t.startsWith("MONTO TOTAL") || t.startsWith("SALDO PENDIENTE")) {
        d.cell.styles.fillColor = [235, 239, 245];
        d.cell.styles.fontStyle = "bold";
      }
    },
  });

  // ---------------- Firmas ----------------
  let fin = finY(200) + 22;
  if (fin > 255) {
    doc.addPage();
    fin = 40;
  }
  doc.setFontSize(9);
  doc.line(margen, fin, margen + 70, fin);
  doc.line(120, fin, 190, fin);
  doc.text("Entregué conforme (SgarNet)", margen, fin + 5);
  doc.text(`Recibí conforme (${cli?.nombre ?? "Cliente"})`, 120, fin + 5);
  doc.setFontSize(7.5);
  doc.setTextColor(110);
  doc.text(
    "El cliente declara conformidad con los trabajos ejecutados, los materiales instalados y los montos liquidados en esta nota.",
    margen,
    fin + 14,
  );

  doc.save(`${nota.numero_nota}.pdf`);
}
