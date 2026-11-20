// =====================================================================
//  CU20 - Exportar a PDF (paso 12). Se arma en el navegador con jsPDF,
//  igual que la nota de servicio del CU13.
// =====================================================================

import type { ReporteGenerado } from "@/backend/reportes/types";
import { armarContenido, formatearValor, textoPeriodo, type Grafico } from "./contenido";

const AZUL: [number, number, number] = [30, 64, 120];
const VERDE: [number, number, number] = [101, 163, 13];
const GRIS: [number, number, number] = [100, 116, 139];

export function nombreArchivo(r: ReporteGenerado, extension: string): string {
  const periodo = r.filtros.desde && r.filtros.hasta ? `${r.filtros.desde}_a_${r.filtros.hasta}` : r.fechaEmision.slice(0, 10);
  return `Reporte_${r.tipo}_${periodo}.${extension}`;
}

export async function exportarPDF(r: ReporteGenerado): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const contenido = armarContenido(r);
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const margen = 15;
  const ancho = 216 - margen * 2;
  const derecha = 216 - margen;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finY = (y: number) => ((doc as any).lastAutoTable?.finalY ?? y) as number;
  const saltoSiHaceFalta = (y: number, alto: number) => {
    if (y + alto > 265) {
      doc.addPage();
      return 20;
    }
    return y;
  };

  // ---------------- Encabezado ----------------
  let y = 18;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("SgarNet - Seguridad Electrónica", margen, y);
  doc.setFontSize(11);
  doc.text("REPORTE GERENCIAL", derecha, y, { align: "right" });
  y += 8;
  doc.setFontSize(13);
  doc.setTextColor(...AZUL);
  doc.text(r.titulo, margen, y);
  doc.setTextColor(0, 0, 0);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(textoPeriodo(r), margen, y);
  for (const filtro of r.filtrosTexto) {
    y += 4.5;
    doc.text(filtro, margen, y);
  }
  y += 4.5;
  doc.setTextColor(...GRIS);
  doc.text(`Emitido el ${r.fechaEmision.slice(0, 16).replace(" ", " a las ")} por ${r.emitidoPor}`, margen, y);
  doc.setTextColor(0, 0, 0);
  y += 3;
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.5);
  doc.line(margen, y, derecha, y);
  y += 6;

  // ---------------- Indicadores (3 por fila) ----------------
  const anchoCaja = (ancho - 8) / 3;
  contenido.indicadores.forEach((ind, i) => {
    const col = i % 3;
    if (i > 0 && col === 0) y += 17;
    const x = margen + col * (anchoCaja + 4);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, anchoCaja, 14, 2, 2);
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(ind.etiqueta.toUpperCase(), x + 3, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    if (ind.signo && ind.valor !== null) doc.setTextColor(...(ind.valor < 0 ? ([185, 28, 28] as const) : ([21, 128, 61] as const)));
    else doc.setTextColor(15, 23, 42);
    doc.text(formatearValor(ind.valor, ind.tipo), x + 3, y + 11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
  });
  y += 22;

  // ---------------- Nota (ej.: margen estimado) ----------------
  if (contenido.nota) {
    const lineas = doc.splitTextToSize(contenido.nota, ancho) as string[];
    y = saltoSiHaceFalta(y, lineas.length * 4 + 4);
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(lineas, margen, y);
    doc.setTextColor(0, 0, 0);
    y += lineas.length * 4 + 3;
  }

  // ---------------- Gráfico de barras ----------------
  if (contenido.grafico && contenido.grafico.barras.length > 0) {
    y = saltoSiHaceFalta(y, 70);
    y = dibujarGrafico(doc, contenido.grafico, margen, y, ancho);
  }

  // ---------------- Tablas ----------------
  for (const tabla of contenido.tablas) {
    if (tabla.filas.length === 0) continue;
    y = saltoSiHaceFalta(y, 25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(tabla.titulo, margen, y);
    doc.setFont("helvetica", "normal");
    const derechaCol = Object.fromEntries(
      tabla.columnas.map((c, i) => [i, { halign: c.tipo === "texto" ? "left" : "right" }]),
    );
    autoTable(doc, {
      startY: y + 2,
      margin: { left: margen, right: margen },
      head: [tabla.columnas.map((c) => c.titulo)],
      body: tabla.filas.map((f) => f.map((v, i) => formatearValor(v, tabla.columnas[i].tipo))),
      foot: tabla.total ? [tabla.total.map((v, i) => formatearValor(v, tabla.columnas[i].tipo))] : undefined,
      theme: "grid",
      styles: { fontSize: 8.5, cellPadding: 1.8 },
      headStyles: { fillColor: AZUL, textColor: 255 },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      columnStyles: derechaCol as any,
    });
    y = finY(y) + 8;
  }

  // ---------------- Pie de página ----------------
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text("SmartService · CU20 Reportes de Gestión · El balance es operativo (ingresos - compras).", margen, 272);
    doc.text(`Página ${p} de ${paginas}`, derecha, 272, { align: "right" });
  }

  doc.save(nombreArchivo(r, "pdf"));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dibujarGrafico(doc: any, g: Grafico, x: number, y: number, ancho: number): number {
  const alto = 45;
  const barras = g.barras.slice(0, 31);
  const maximo = Math.max(1, ...barras.map((b) => Math.max(b.valor, b.valor2 ?? 0)));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(g.titulo, x, y);
  doc.setFont("helvetica", "normal");
  if (g.series) {
    doc.setFontSize(7.5);
    doc.setFillColor(...AZUL);
    doc.rect(x + ancho - 60, y - 3, 3, 3, "F");
    doc.text(g.series[0], x + ancho - 55, y - 0.5);
    doc.setFillColor(...VERDE);
    doc.rect(x + ancho - 30, y - 3, 3, 3, "F");
    doc.text(g.series[1], x + ancho - 25, y - 0.5);
  }
  const base = y + 5 + alto;
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.2);
  doc.line(x, base, x + ancho, base);
  doc.setFontSize(6.5);
  doc.setTextColor(...GRIS);
  doc.text(formatearValor(maximo, g.tipo), x, y + 5);
  doc.setTextColor(0, 0, 0);

  const paso = ancho / barras.length;
  const anchoBarra = Math.min(14, paso * (g.series ? 0.38 : 0.65));
  barras.forEach((b, i) => {
    const cx = x + paso * i + paso / 2;
    const h1 = (b.valor / maximo) * alto;
    doc.setFillColor(...AZUL);
    if (g.series) {
      doc.rect(cx - anchoBarra, base - h1, anchoBarra, h1, "F");
      const h2 = ((b.valor2 ?? 0) / maximo) * alto;
      doc.setFillColor(...VERDE);
      doc.rect(cx, base - h2, anchoBarra, h2, "F");
    } else {
      doc.rect(cx - anchoBarra / 2, base - h1, anchoBarra, h1, "F");
    }
    if (barras.length <= 16 || i % 2 === 0) {
      const etiqueta = b.etiqueta.length > 14 ? `${b.etiqueta.slice(0, 13)}…` : b.etiqueta;
      doc.setFontSize(6.5);
      doc.text(etiqueta, cx, base + 4, { align: "center" });
    }
  });
  return base + 12;
}
