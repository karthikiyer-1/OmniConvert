/**
 * Format knowledge base: detects what a file is and which output formats make
 * sense for it. `real` marks conversions the browser performs for real; the
 * rest run through the simulated conversion stream.
 */

export type FileKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "document"
  | "spreadsheet"
  | "text"
  | "code"
  | "archive"
  | "font"
  | "other";

export interface OutputFormat {
  ext: string;
  label: string;
  /** Converted for real in the browser (vs. simulated stream). */
  real: boolean;
  hint?: string;
}

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  tiff: "image/tiff",
  tif: "image/tiff",
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  opus: "audio/opus",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  epub: "application/epub+zip",
  pages: "application/vnd.apple.pages",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  key: "application/vnd.apple.keynote",
  txt: "text/plain",
  md: "text/markdown",
  log: "text/plain",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  json: "application/json",
  yaml: "application/yaml",
  yml: "application/yaml",
  toml: "application/toml",
  js: "text/javascript",
  mjs: "text/javascript",
  jsx: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  css: "text/css",
  scss: "text/x-scss",
  py: "text/x-python",
  rb: "text/x-ruby",
  go: "text/x-go",
  rs: "text/x-rust",
  java: "text/x-java",
  kt: "text/x-kotlin",
  swift: "text/x-swift",
  c: "text/x-c",
  h: "text/x-c",
  cpp: "text/x-c++",
  cs: "text/x-csharp",
  php: "application/x-php",
  sh: "application/x-sh",
  sql: "application/sql",
  zip: "application/zip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
  gz: "application/gzip",
  tgz: "application/gzip",
  dmg: "application/x-apple-diskimage",
  iso: "application/x-iso9660-image",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
};

const KIND_BY_EXT: Record<string, FileKind> = {};
const assign = (kind: FileKind, exts: string) =>
  exts.split(" ").forEach((e) => (KIND_BY_EXT[e] = kind));
assign("image", "png jpg jpeg webp gif bmp ico svg avif heic heif tiff tif");
assign("video", "mp4 m4v mov webm mkv avi");
assign("audio", "mp3 wav ogg oga m4a aac flac opus");
assign("pdf", "pdf");
assign("document", "doc docx odt rtf epub pages ppt pptx key");
assign("spreadsheet", "xls xlsx ods csv tsv");
assign("text", "txt md log");
assign("code", "html htm xml json yaml yml toml js mjs jsx ts tsx css scss py rb go rs java kt swift c h cpp cs php sh sql");
assign("archive", "zip rar 7z tar gz tgz dmg iso");
assign("font", "ttf otf woff woff2");

export function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export function mimeFor(ext: string, fallback = "application/octet-stream"): string {
  return MIME[ext] ?? fallback;
}

/** Map well-known MIME types back to an extension (for pasted, nameless blobs). */
export function extFromMime(mime: string): string {
  const exact = Object.entries(MIME).find(([, m]) => m === mime);
  if (exact) return exact[0] === "jpeg" ? "jpg" : exact[0];
  const sub = mime.split("/")[1]?.split(/[+;]/)[0];
  return sub || "bin";
}

export function detectKind(name: string, mime: string): FileKind {
  const ext = extOf(name);
  if (KIND_BY_EXT[ext]) return KIND_BY_EXT[ext];
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/")) return "text";
  return "other";
}

/** Can the browser decode this image natively (for canvas-based conversion)? */
export function isBrowserImage(ext: string): boolean {
  return ["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "svg", "avif"].includes(ext);
}

const f = (ext: string, label: string, real: boolean, hint?: string): OutputFormat => ({
  ext,
  label,
  real,
  hint,
});

export function outputsFor(kind: FileKind, ext: string): OutputFormat[] {
  let list: OutputFormat[] = [];
  switch (kind) {
    case "image": {
      const decodable = isBrowserImage(ext);
      list = [
        f("png", "PNG", decodable, "Lossless"),
        f("jpg", "JPG", decodable, "Small, photo"),
        f("webp", "WEBP", decodable, "Modern web"),
        f("bmp", "BMP", decodable, "Uncompressed"),
        f("ico", "ICO", decodable, "Favicon 256px"),
        f("pdf", "PDF", decodable, "Single page"),
        f("heic", "HEIC", false, "Apple High Efficiency"),
        f("avif", "AVIF", false, "Next-gen"),
        f("tiff", "TIFF", false, "Print"),
        f("gif", "GIF", false),
      ];
      break;
    }
    case "video":
      list = [
        f("png", "PNG", true, "Poster frame"),
        f("jpg", "JPG", true, "Poster frame"),
        f("gif", "GIF", false, "Animated"),
        f("webm", "WEBM", false, "VP9"),
        f("mp4", "MP4", false, "H.264"),
        f("mov", "MOV", false, "QuickTime"),
        f("mp3", "MP3", false, "Extract audio"),
        f("wav", "WAV", true, "Extract audio"),
      ];
      break;
    case "audio":
      list = [
        f("wav", "WAV", true, "PCM 16-bit"),
        f("mp3", "MP3", false, "320 kbps"),
        f("m4a", "M4A", false, "AAC"),
        f("ogg", "OGG", false, "Vorbis"),
        f("flac", "FLAC", false, "Lossless"),
        f("opus", "OPUS", false),
      ];
      break;
    case "pdf":
      list = [
        f("docx", "DOCX", false, "Word"),
        f("txt", "TXT", false, "Plain text"),
        f("png", "PNG", false, "Page images"),
        f("jpg", "JPG", false, "Page images"),
        f("html", "HTML", false),
        f("epub", "EPUB", false),
      ];
      break;
    case "document":
      list = [
        f("pdf", "PDF", false),
        f("docx", "DOCX", false),
        f("txt", "TXT", false),
        f("odt", "ODT", false),
        f("html", "HTML", false),
        f("md", "Markdown", false),
      ];
      break;
    case "spreadsheet": {
      const textual = ext === "csv" || ext === "tsv";
      list = [
        f("json", "JSON", textual, "Array of rows"),
        f("csv", "CSV", textual),
        f("tsv", "TSV", textual),
        f("html", "HTML", textual, "Table"),
        f("md", "Markdown", textual, "Table"),
        f("pdf", "PDF", textual),
        f("xlsx", "XLSX", false, "Excel"),
      ];
      break;
    }
    case "text":
    case "code":
      list = [
        f("pdf", "PDF", true),
        f("html", "HTML", true, "Highlighted page"),
        f("md", "Markdown", true),
        f("txt", "TXT", true),
        f("json", "JSON", true, "Wrapped string"),
        f("docx", "DOCX", false),
      ];
      if (ext === "json") list.unshift(f("csv", "CSV", true, "Flatten array"), f("yaml", "YAML", true));
      break;
    case "archive":
      list = [
        f("zip", "ZIP", ext === "zip", "Re-pack"),
        f("tar", "TAR", false),
        f("7z", "7Z", false),
        f("gz", "TAR.GZ", false),
      ];
      break;
    case "font":
      list = [
        f("woff2", "WOFF2", false),
        f("woff", "WOFF", false),
        f("ttf", "TTF", false),
        f("otf", "OTF", false),
      ];
      break;
    default:
      list = [f("zip", "ZIP", true, "Compress"), f("txt", "TXT", false, "Hex dump")];
  }
  // Never suggest converting to the same format (except re-pack).
  return list.filter((o) => o.ext !== ext || kind === "archive").filter((o, i, a) => a.findIndex((x) => x.ext === o.ext) === i);
}

export const KIND_LABEL: Record<FileKind, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  pdf: "PDF",
  document: "Document",
  spreadsheet: "Spreadsheet",
  text: "Text",
  code: "Code",
  archive: "Archive",
  font: "Font",
  other: "File",
};

const HLJS_LANG: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  cs: "csharp",
  h: "c",
  sh: "bash",
  yml: "yaml",
  htm: "xml",
  html: "xml",
  svg: "xml",
  md: "markdown",
  toml: "ini",
};
export function languageFor(ext: string): string {
  return HLJS_LANG[ext] ?? ext;
}

/** Files whose bytes can be shown as text in the reader. */
export function isTextual(kind: FileKind, ext: string): boolean {
  return kind === "text" || kind === "code" || ext === "csv" || ext === "tsv" || ext === "svg";
}
