// =====================================================================
//  CU20 - Exportar a Excel (paso 12). Genera un .xlsx real en el
//  navegador, sin librerías: un .xlsx es un ZIP con unos XML adentro.
//  Los montos y cantidades van como NÚMEROS (se pueden sumar en Excel).
// =====================================================================

import type { ReporteGenerado } from "@/backend/reportes/types";
import { armarContenido, formatearValor, textoPeriodo, type TipoCelda } from "./contenido";
import { nombreArchivo } from "./exportar-pdf";

// ---------------- ZIP sin compresión ----------------

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function crearZip(archivos: { nombre: string; contenido: string }[]): Uint8Array {
  const cod = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let desplazamiento = 0;

  for (const a of archivos) {
    const nombre = cod.encode(a.nombre);
    const datos = cod.encode(a.contenido);
    const crc = crc32(datos);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nombres en UTF-8
    local.setUint32(14, crc, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, datos.length, true);
    local.setUint16(26, nombre.length, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(8, 0x0800, true);
    cen.setUint32(16, crc, true);
    cen.setUint32(20, datos.length, true);
    cen.setUint32(24, datos.length, true);
    cen.setUint16(28, nombre.length, true);
    cen.setUint32(42, desplazamiento, true);
    central.push(new Uint8Array(cen.buffer), nombre);

    desplazamiento += 30 + nombre.length + datos.length;
  }

  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, archivos.length, true);
  fin.setUint16(10, archivos.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, desplazamiento, true);

  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of todo) {
    salida.set(p, pos);
    pos += p.length;
  }
  return salida;
}

// ---------------- Hoja de cálculo ----------------

/** Estilos: 0 normal, 1 negrita, 2 número 2 decimales, 3 negrita número, 4 título. */
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

type Celda = { v: string | number | null; estilo?: number };

function xml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function columna(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function celdaXml(c: Celda, ref: string): string {
  if (c.v === null || c.v === "") return "";
  const s = c.estilo ? ` s="${c.estilo}"` : "";
  if (typeof c.v === "number") return `<c r="${ref}"${s}><v>${c.v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
}

function valorCelda(v: string | number | null, tipo: TipoCelda, negrita = false): Celda {
  if (typeof v === "number") {
    // Porcentaje y horas se guardan como número; el título de la columna dice la unidad
    const numerico = tipo === "monto" || tipo === "horas" || tipo === "porcentaje" || tipo === "cantidad";
    return { v, estilo: numerico ? (negrita ? 3 : 2) : negrita ? 1 : 0 };
  }
  return { v, estilo: negrita ? 1 : 0 };
}

const UNIDAD: Partial<Record<TipoCelda, string>> = { monto: " (Bs)", horas: " (h)", porcentaje: " (%)" };

export function armarFilas(r: ReporteGenerado): Celda[][] {
  const contenido = armarContenido(r);
  const filas: Celda[][] = [
    [{ v: `SgarNet - ${r.titulo}`, estilo: 4 }],
    [{ v: textoPeriodo(r) }],
    ...r.filtrosTexto.map((f) => [{ v: f }]),
    [{ v: `Emitido el ${r.fechaEmision.slice(0, 16)} por ${r.emitidoPor}` }],
    [],
    [{ v: "Indicadores", estilo: 1 }],
    ...contenido.indicadores.map((i) => [
      { v: i.etiqueta + (UNIDAD[i.tipo] ?? "") },
      i.valor === null ? { v: formatearValor(null, i.tipo) } : valorCelda(i.valor, i.tipo),
    ]),
    ...(contenido.nota ? [[], [{ v: `Nota: ${contenido.nota}` }]] : []),
  ];
  for (const t of contenido.tablas) {
    if (t.filas.length === 0) continue;
    filas.push([], [{ v: t.titulo, estilo: 1 }]);
    filas.push(t.columnas.map((c) => ({ v: c.titulo + (UNIDAD[c.tipo] ?? ""), estilo: 1 })));
    for (const f of t.filas) filas.push(f.map((v, i) => valorCelda(v, t.columnas[i].tipo)));
    if (t.total) filas.push(t.total.map((v, i) => valorCelda(v, t.columnas[i].tipo, true)));
  }
  return filas;
}

export function crearXlsx(r: ReporteGenerado): Uint8Array {
  const filas = armarFilas(r);
  const filasXml = filas
    .map((f, i) => `<row r="${i + 1}">${f.map((c, j) => celdaXml(c, `${columna(j)}${i + 1}`)).join("")}</row>`)
    .join("");
  const hoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="38" customWidth="1"/><col min="2" max="8" width="18" customWidth="1"/></cols>
<sheetData>${filasXml}</sheetData>
</worksheet>`;
  const nombreHoja = xml(r.titulo.slice(0, 31));

  return crearZip([
    {
      nombre: "[Content_Types].xml",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      nombre: "_rels/.rels",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      nombre: "xl/workbook.xml",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${nombreHoja}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    },
    {
      nombre: "xl/_rels/workbook.xml.rels",
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { nombre: "xl/styles.xml", contenido: ESTILOS },
    { nombre: "xl/worksheets/sheet1.xml", contenido: hoja },
  ]);
}

export function exportarExcel(r: ReporteGenerado): void {
  const bytes = crearXlsx(r);
  const blob = new Blob([bytes.buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo(r, "xlsx");
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
