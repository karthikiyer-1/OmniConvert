export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const NBSP = "\u00A0";
const numberFmt = new Map<number, Intl.NumberFormat>();
const fmtNumber = (v: number, digits: number) => {
  if (!numberFmt.has(digits)) numberFmt.set(digits, new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }));
  return numberFmt.get(digits)!.format(v);
};

/** "1.2 MB" with a non-breaking space so the unit never wraps away. */
export function formatBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0${NBSP}B`;
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const v = bytes / 1024 ** i;
  return `${fmtNumber(v, i === 0 ? 0 : v < 10 ? digits : 0)}${NBSP}${units[i]}`;
}

export const formatCount = (n: number) => fmtNumber(n, 0);
export const formatDecimal = (n: number, digits = 1) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
/** "1.2 s" via Intl unit formatting. */
export const formatSeconds = (s: number) =>
  new Intl.NumberFormat(undefined, { style: "unit", unit: "second", unitDisplay: "narrow", maximumFractionDigits: 1 }).format(s);
/** Time stamp safe for file names, e.g. "10.42.07". */
export const fileStamp = (d = new Date()) =>
  new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .format(d)
    .replace(/[^\d]+/g, ".");

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ss = s.toString().padStart(2, "0");
  return h ? `${h}:${m.toString().padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
const dayFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export function timeAgo(ts: number): string {
  const d = (Date.now() - ts) / 1000;
  if (d < 45) return rtf.format(0, "second");
  if (d < 3600) return rtf.format(-Math.round(d / 60), "minute");
  if (d < 86400) return rtf.format(-Math.round(d / 3600), "hour");
  return dayFmt.format(ts);
}

export const formatDateTime = (ts: number) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(ts);
export const formatTime = (ts: number) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(ts);
export const formatDay = (ts: number) => new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(ts);
export const formatMonthYear = (ts: number) => new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(ts);

/** Pointer is a mouse/trackpad — used to limit autofocus to desktop. */
export const isFinePointer = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: fine)").matches;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function replaceExt(name: string, ext: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base}.${ext}`;
}

/** SHA-256 hex digest. Skips very large files to keep the UI responsive. */
export async function sha256(blob: Blob): Promise<string | undefined> {
  if (!crypto?.subtle || blob.size > 256 * 1024 * 1024) return undefined;
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
