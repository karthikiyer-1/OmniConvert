/**
 * Real document conversions in the browser.
 *  - PDF in: text (pdf.js text layer) or page images (pdf.js rendering).
 *  - DOCX / ODT / PPTX / XLSX in: read straight from their ZIP/XML parts.
 *  - DOCX / XLSX out: minimal, valid Office Open XML written with JSZip.
 *  - HEIC/HEIF photos: decoded with libheif (WebAssembly, via heic-to) to PNG.
 */
import type { Progress } from "./media";

/* --------------------------------------------------------------------- PDF */

async function pdfjs() {
  const lib = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

async function openPdf(blob: Blob) {
  const lib = await pdfjs();
  return lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, disableFontFace: false }).promise;
}

/** Text of every page, with line breaks where the text moves down the page. */
export async function pdfText(blob: Blob, onProgress?: Progress): Promise<string[]> {
  const doc = await openPdf(blob);
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    let out = "";
    let lastY: number | null = null;
    for (const item of content.items as { str: string; transform: number[]; hasEOL?: boolean }[]) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2 && !out.endsWith("\n")) out += "\n";
      out += item.str;
      if (item.hasEOL) out += "\n";
      lastY = y;
    }
    pages.push(out.replace(/[ \t]+\n/g, "\n").trim());
    onProgress?.(n / doc.numPages, `Reading page ${n} of ${doc.numPages}…`);
  }
  await doc.destroy();
  return pages;
}

export const PDF_MAX_IMAGE_PAGES = 10;

/** Render pages (up to 10) stacked into one image. */
export async function pdfImage(blob: Blob, type: "png" | "jpg", onProgress?: Progress): Promise<{ blob: Blob; pages: number; total: number }> {
  const doc = await openPdf(blob);
  const total = doc.numPages;
  const count = Math.min(total, PDF_MAX_IMAGE_PAGES);
  const canvases: HTMLCanvasElement[] = [];
  for (let n = 1; n <= count; n++) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2, 1600 / base.width) });
    const c = document.createElement("canvas");
    c.width = Math.round(viewport.width);
    c.height = Math.round(viewport.height);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    canvases.push(c);
    onProgress?.(n / count, `Rendering page ${n} of ${count}…`);
  }
  await doc.destroy();
  const gap = 24;
  const out = document.createElement("canvas");
  out.width = Math.max(...canvases.map((c) => c.width));
  out.height = canvases.reduce((h, c) => h + c.height, 0) + gap * (canvases.length - 1);
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = type === "jpg" ? "#ffffff" : "#e5e5ea";
  ctx.fillRect(0, 0, out.width, out.height);
  let y = 0;
  for (const c of canvases) {
    ctx.drawImage(c, (out.width - c.width) / 2, y);
    y += c.height + gap;
  }
  const result = await new Promise<Blob | null>((r) => out.toBlob(r, type === "png" ? "image/png" : "image/jpeg", 0.9));
  if (!result) throw new Error("Couldn’t encode the page image");
  return { blob: result, pages: count, total };
}

/* --------------------------------------------------- Office / ODF reading */

const xmlText = (s: string) =>
  s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, "&");

/** Paragraph texts from DOCX, ODT or PPTX. */
export async function officeText(blob: Blob, ext: string): Promise<string[]> {
  const JSZip = (await import("jszip")).default;
  let zip;
  try {
    zip = await JSZip.loadAsync(blob);
  } catch {
    throw new Error("This file isn’t a valid Office document. Save it as DOCX, ODT or PPTX and try again.");
  }
  const read = async (path: string) => (await zip.file(path)?.async("string")) ?? "";
  const paras = (xml: string, pTag: string, tTag: RegExp) =>
    [...xml.matchAll(new RegExp(`<${pTag}[ >][\\s\\S]*?</${pTag}>|<${pTag}/>`, "g"))].map((m) =>
      xmlText([...m[0].matchAll(tTag)].map((t) => t[1]).join("")),
    );
  if (ext === "docx") {
    const xml = (await read("word/document.xml")).replace(/<w:tab\/>/g, "<w:t>\t</w:t>").replace(/<w:br\/>/g, "<w:t>\n</w:t>");
    return paras(xml, "w:p", /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g);
  }
  if (ext === "odt") {
    const xml = await read("content.xml");
    return [...xml.matchAll(/<text:(?:p|h)[^>]*?(?:\/>|>([\s\S]*?)<\/text:(?:p|h)>)/g)].map((m) =>
      xmlText((m[1] ?? "").replace(/<text:tab\/>/g, "\t").replace(/<text:line-break\/>/g, "\n").replace(/<[^>]+>/g, "")),
    );
  }
  if (ext === "pptx") {
    const slides = Object.keys(zip.files)
      .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      .sort((a, b) => +a.match(/\d+/)![0] - +b.match(/\d+/)![0]);
    const out: string[] = [];
    for (const [i, f] of slides.entries()) {
      out.push(`Slide ${i + 1}`);
      out.push(...paras(await read(f), "a:p", /<a:t>([\s\S]*?)<\/a:t>/g).filter(Boolean));
      out.push("");
    }
    return out;
  }
  throw new Error(`Reading ${ext.toUpperCase()} isn’t supported`);
}

/** Rows of the first worksheet of an XLSX file. */
export async function xlsxRows(blob: Blob): Promise<string[][]> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(blob);
  const shared = [...((await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    xmlText([...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const sheetPath = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort()[0];
  if (!sheetPath) throw new Error("This workbook has no worksheets");
  const xml = await zip.file(sheetPath)!.async("string");
  const col = (ref: string) => ref.replace(/\d+/g, "").split("").reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, inner = ""] = c;
      const t = /t="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
      const val = t === "s" ? shared[+v] ?? "" : t === "inlineStr" ? xmlText(/<t[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? "") : xmlText(v);
      row[col(ref)] = val;
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows;
}

/* ------------------------------------------------------ Office writing */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// XML 1.0 forbids most control characters.
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

export async function buildDocx(paragraphs: string[], title = "Document"): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  // No folder entries: some Office apps are picky about them.
  const add = (path: string, data: string) => zip.file(path, data, { createFolders: false });
  add(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
  );
  add(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
  );
  add(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(clean(title))}</dc:title><dc:creator>OmniConvert</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created></cp:coreProperties>`,
  );
  const body = paragraphs
    .map((p) => {
      const runs = clean(p)
        .split("\n")
        .map((line, i) => `${i ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(line).replace(/\t/g, '</w:t><w:tab/><w:t xml:space="preserve">')}</w:t>`)
        .join("");
      return `<w:p><w:r>${runs}</w:r></w:p>`;
    })
    .join("");
  add(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

export async function buildXlsx(rows: string[][]): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  // No folder entries: some Office apps are picky about them.
  const add = (path: string, data: string) => zip.file(path, data, { createFolders: false });
  const colName = (i: number) => {
    let s = "";
    for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  };
  const cell = (v: string, r: number, c: number) => {
    const ref = `${colName(c)}${r + 1}`;
    // Plain numbers stay numeric so formulas and sorting work in Excel.
    if (/^-?\d+(\.\d+)?$/.test(v.trim()) && v.trim().length < 16) return `<c r="${ref}"><v>${v.trim()}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(clean(v))}</t></is></c>`;
  };
  const sheet = rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v ?? "", r, c)).join("")}</row>`).join("");
  add(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
  );
  add(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  add(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  add(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
  );
  add(
    "xl/worksheets/sheet1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheet}</sheetData></worksheet>`,
  );
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/* -------------------------------------------------------------------- HEIC */

/** Decode an iPhone HEIC/HEIF photo into a PNG the rest of the pipeline can use. */
export async function decodeHeic(blob: Blob): Promise<Blob> {
  // The CSP build decodes in a worker with WebAssembly; no eval needed.
  const { heicTo } = await import("heic-to/csp");
  return heicTo({ blob, type: "image/png" });
}
