/**
 * Real, in-browser converters. Each returns a Blob or throws; the engine
 * decides whether to fall back to a simulated stream.
 */
import { FileKind, isBrowserImage, languageFor, mimeFor } from "./formats";

export interface ConvertInput {
  blob: Blob;
  name: string;
  ext: string;
  kind: FileKind;
  target: string;
}

export async function convertReal(input: ConvertInput): Promise<Blob> {
  const { kind, ext, target } = input;
  if (kind === "image" && isBrowserImage(ext)) return convertImage(input.blob, target);
  if (kind === "video" && (target === "png" || target === "jpg")) return posterFrame(input.blob, target);
  if ((kind === "audio" || kind === "video") && target === "wav") return toWav(input.blob);
  if (kind === "text" || kind === "code" || kind === "spreadsheet") return convertText(input);
  if (kind === "archive" && ext === "zip" && target === "zip") return repackZip(input.blob);
  if (target === "zip") return zipSingle(input.blob, input.name);
  throw new Error(`No native converter for ${ext} → ${target}`);
}

/* ------------------------------------------------------------------ images */

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // Revoke after decode; the decoded bitmap stays valid for drawImage.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function canvasFor(img: HTMLImageElement, maxSide = 8192, opaque = false) {
  let w = img.naturalWidth || 512;
  let h = img.naturalHeight || 512;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  if (opaque) {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return { c, ctx, w, h };
}

function toBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob> {
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error("Canvas encode failed"))), type, q),
  );
}

async function convertImage(blob: Blob, target: string): Promise<Blob> {
  const img = await loadImage(blob);
  switch (target) {
    case "png":
      return toBlob(canvasFor(img).c, "image/png");
    case "jpg":
      return toBlob(canvasFor(img, 8192, true).c, "image/jpeg", 0.9);
    case "webp": {
      const out = await toBlob(canvasFor(img).c, "image/webp", 0.88);
      if (out.type !== "image/webp") throw new Error("WEBP encoding unsupported in this browser");
      return out;
    }
    case "bmp": {
      const { ctx, w, h } = canvasFor(img, 4096, true);
      return encodeBmp(ctx.getImageData(0, 0, w, h));
    }
    case "ico": {
      const { c } = canvasFor(img, 256);
      return encodeIco(await toBlob(c, "image/png"), c.width, c.height);
    }
    case "pdf": {
      const { c, w, h } = canvasFor(img, 4096, true);
      const jpg = new Uint8Array(await (await toBlob(c, "image/jpeg", 0.92)).arrayBuffer());
      return imagePdf(jpg, w, h);
    }
  }
  throw new Error(`Unsupported image target ${target}`);
}

function encodeBmp(data: ImageData): Blob {
  const { width: w, height: h } = data;
  const rowSize = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + rowSize * h;
  const buf = new ArrayBuffer(size);
  const v = new DataView(buf);
  v.setUint16(0, 0x4d42, true); // "BM"
  v.setUint32(2, size, true);
  v.setUint32(10, 54, true);
  v.setUint32(14, 40, true);
  v.setInt32(18, w, true);
  v.setInt32(22, h, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 24, true);
  v.setUint32(34, rowSize * h, true);
  v.setInt32(38, 2835, true);
  v.setInt32(42, 2835, true);
  const px = data.data;
  for (let y = 0; y < h; y++) {
    const row = 54 + (h - 1 - y) * rowSize;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = row + x * 3;
      v.setUint8(o, px[i + 2]);
      v.setUint8(o + 1, px[i + 1]);
      v.setUint8(o + 2, px[i]);
    }
  }
  return new Blob([buf], { type: "image/bmp" });
}

async function encodeIco(png: Blob, w: number, h: number): Promise<Blob> {
  const header = new DataView(new ArrayBuffer(22));
  header.setUint16(2, 1, true); // type: icon
  header.setUint16(4, 1, true); // count
  header.setUint8(6, w >= 256 ? 0 : w);
  header.setUint8(7, h >= 256 ? 0 : h);
  header.setUint16(10, 1, true);
  header.setUint16(12, 32, true);
  header.setUint32(14, png.size, true);
  header.setUint32(18, 22, true);
  return new Blob([header.buffer, png], { type: "image/x-icon" });
}

/* --------------------------------------------------------------------- PDF */

type Part = string | Uint8Array;

function buildPdf(objects: Part[][]): Blob {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (p: Part) => {
    const bytes = typeof p === "string" ? enc.encode(p) : p;
    chunks.push(bytes);
    offset += bytes.length;
  };
  const xref: number[] = [];
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  objects.forEach((parts, i) => {
    xref.push(offset);
    push(`${i + 1} 0 obj\n`);
    parts.forEach(push);
    push("\nendobj\n");
  });
  const xrefAt = offset;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  xref.forEach((o) => push(`${o.toString().padStart(10, "0")} 00000 n \n`));
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`);
  return new Blob(chunks, { type: "application/pdf" });
}

function imagePdf(jpg: Uint8Array, w: number, h: number): Blob {
  // Fit to US Letter-ish at 72dpi while preserving aspect ratio.
  const scale = Math.min(1, 612 / w, 792 / h) || 1;
  const pw = Math.round(w * scale);
  const ph = Math.round(h * scale);
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  return buildPdf([
    ["<< /Type /Catalog /Pages 2 0 R >>"],
    ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`],
    [
      `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`,
      jpg,
      "\nendstream",
    ],
    [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`],
  ]);
}

export function textPdf(text: string, title: string): Blob {
  const W = 612,
    H = 792,
    M = 54,
    size = 9.5,
    lead = 12.5;
  const cols = Math.floor((W - 2 * M) / (size * 0.6));
  const rows = Math.floor((H - 2 * M - 24) / lead);
  const lines: string[] = [];
  for (const raw of text.replace(/\t/g, "    ").split(/\r?\n/)) {
    if (!raw.length) lines.push("");
    for (let i = 0; i < raw.length; i += cols) lines.push(raw.slice(i, i + cols));
  }
  const pages: string[][] = [];
  for (let i = 0; i < Math.max(lines.length, 1); i += rows) pages.push(lines.slice(i, i + rows));
  const esc = (s: string) =>
    s
      .replace(/[^\x20-\x7E]/g, "?")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

  const objs: Part[][] = [["<< /Type /Catalog /Pages 2 0 R >>"], [""], ["<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"], ["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"]];
  const kids: number[] = [];
  pages.forEach((pl, pi) => {
    const body = [
      "BT",
      `/F2 11 Tf ${M} ${H - M} Td (${esc(title)}) Tj`,
      "ET",
      "BT",
      `/F1 ${size} Tf ${lead} TL ${M} ${H - M - 26} Td`,
      ...pl.map((l) => `(${esc(l)}) '`),
      "ET",
      "BT",
      `/F1 8 Tf ${W - M - 60} ${M - 20} Td (Page ${pi + 1} / ${pages.length}) Tj`,
      "ET",
    ].join("\n");
    const pageId = objs.length + 1;
    kids.push(pageId);
    objs.push([`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`]);
    objs.push([`<< /Length ${body.length} >>\nstream\n${body}\nendstream`]);
  });
  objs[1] = [`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`];
  return buildPdf(objs);
}

/* ------------------------------------------------------------ audio/video */

async function toWav(blob: Blob): Promise<Blob> {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    return encodeWav(audio);
  } finally {
    ctx.close();
  }
}

function encodeWav(audio: AudioBuffer): Blob {
  const ch = Math.min(audio.numberOfChannels, 2);
  const rate = audio.sampleRate;
  const len = audio.length;
  const dataSize = len * ch * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, dataSize, true);
  const chans = Array.from({ length: ch }, (_, i) => audio.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

async function posterFrame(blob: Blob, target: string): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((res, rej) => {
      video.onloadedmetadata = () => res();
      video.onerror = () => rej(new Error("Video codec not supported by this browser"));
    });
    video.currentTime = Math.min(1, (video.duration || 2) / 3);
    await new Promise<void>((res) => (video.onseeked = () => res()));
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d")!.drawImage(video, 0, 0);
    return toBlob(c, target === "png" ? "image/png" : "image/jpeg", 0.92);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* -------------------------------------------------------------------- text */

export function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.length));
}

const csvCell = (v: unknown, d: string) => {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.includes(d) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function rowsToObjects(rows: string[][]) {
  const [head = [], ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h || `col${i + 1}`, r[i] ?? ""])));
}

function toYaml(v: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    return v
      .map((x) => {
        const inner = toYaml(x, indent + 1);
        return typeof x === "object" && x !== null ? `${pad}- ${inner.trimStart()}` : `${pad}- ${inner}`;
      })
      .join("\n");
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    if (!entries.length) return "{}";
    return entries
      .map(([k, x]) => {
        const key = /^[\w-]+$/.test(k) ? k : JSON.stringify(k);
        if (typeof x === "object" && x !== null && (Array.isArray(x) ? x.length : Object.keys(x).length))
          return `${pad}${key}:\n${toYaml(x, indent + 1)}`;
        return `${pad}${key}: ${toYaml(x, indent + 1)}`;
      })
      .join("\n");
  }
  if (typeof v === "string") return /^[\w .,/@-]*$/.test(v) && v.trim() === v && v !== "" ? v : JSON.stringify(v);
  return String(v);
}

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<style>
:root{color-scheme:light dark}
body{font:15px/1.6 -apple-system,BlinkMacSystemFont,Inter,sans-serif;max-width:920px;margin:40px auto;padding:0 20px;color:#1d1d1f;background:#fbfbfd}
@media(prefers-color-scheme:dark){body{color:#f5f5f7;background:#000}table td,table th{border-color:#333}pre{background:#1c1c1e}}
h1{font-size:22px;letter-spacing:-.02em}
pre{font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;background:#f2f2f7;padding:18px 20px;border-radius:14px;overflow:auto}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #e5e5ea;padding:6px 10px;text-align:left}th{font-weight:600}
.hljs-keyword,.hljs-literal{color:#ad3da4;font-weight:600}.hljs-string{color:#c41a16}.hljs-number{color:#1c00cf}.hljs-comment{color:#8e8e93;font-style:italic}.hljs-title,.hljs-name{color:#3f6e74}.hljs-attr,.hljs-property{color:#0b4f79}.hljs-built_in,.hljs-type{color:#5c2699}
</style></head><body><h1>${escHtml(title)}</h1>
${body}
<p style="color:#8e8e93;font-size:12px;margin-top:32px">Converted with OmniConvert</p></body></html>`;
}

async function convertText({ blob, name, ext, target }: ConvertInput): Promise<Blob> {
  const text = await blob.text();
  const delim = ext === "tsv" ? "\t" : ",";
  const tabular = ext === "csv" || ext === "tsv";
  const rows = tabular ? parseDelimited(text, delim) : null;
  const mk = (s: string) => new Blob([s], { type: `${mimeFor(target, "text/plain")};charset=utf-8` });

  switch (target) {
    case "txt":
      return mk(text);
    case "md":
      if (rows) {
        const [h = [], ...b] = rows;
        const line = (r: string[]) => `| ${h.map((_, i) => (r[i] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;
        return mk([line(h), `| ${h.map(() => "---").join(" | ")} |`, ...b.map(line)].join("\n") + "\n");
      }
      if (ext === "md") return mk(text);
      return mk(`# ${name}\n\n\`\`\`${languageFor(ext)}\n${text}\n\`\`\`\n`);
    case "json":
      if (rows) return mk(JSON.stringify(rowsToObjects(rows), null, 2));
      if (ext === "json") return mk(JSON.stringify(JSON.parse(text), null, 2));
      return mk(JSON.stringify({ name, content: text }, null, 2));
    case "yaml":
      return mk(toYaml(JSON.parse(text)) + "\n");
    case "csv":
    case "tsv": {
      const d = target === "tsv" ? "\t" : ",";
      if (rows) return mk(rows.map((r) => r.map((c) => csvCell(c, d)).join(d)).join("\n") + "\n");
      const data = JSON.parse(text);
      const arr: Record<string, unknown>[] = (Array.isArray(data) ? data : [data]).map((x) =>
        typeof x === "object" && x !== null ? x : { value: x },
      );
      const keys = [...new Set(arr.flatMap((o) => Object.keys(o)))];
      return mk([keys.join(d), ...arr.map((o) => keys.map((k) => csvCell(o[k], d)).join(d))].join("\n") + "\n");
    }
    case "html": {
      if (rows) {
        const [h = [], ...b] = rows;
        const t = `<table><thead><tr>${h.map((c) => `<th>${escHtml(c)}</th>`).join("")}</tr></thead><tbody>${b
          .map((r) => `<tr>${h.map((_, i) => `<td>${escHtml(r[i] ?? "")}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`;
        return mk(htmlPage(name, t));
      }
      let code = escHtml(text);
      try {
        const hljs = (await import("highlight.js/lib/common")).default;
        const lang = languageFor(ext);
        if (hljs.getLanguage(lang)) code = hljs.highlight(text, { language: lang }).value;
      } catch {
        /* plain */
      }
      return mk(htmlPage(name, `<pre><code class="hljs">${code}</code></pre>`));
    }
    case "pdf": {
      const body = rows
        ? (() => {
            const widths = rows[0].map((_, i) => Math.min(28, Math.max(...rows.map((r) => (r[i] ?? "").length))));
            return rows.map((r) => widths.map((w, i) => (r[i] ?? "").slice(0, w).padEnd(w)).join("  ")).join("\n");
          })()
        : text;
      return textPdf(body, name);
    }
  }
  throw new Error(`Unsupported text target ${target}`);
}

/* ---------------------------------------------------------------- archives */

async function repackZip(blob: Blob): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(blob);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
}

async function zipSingle(blob: Blob, name: string): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  zip.file(name, blob);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
}
