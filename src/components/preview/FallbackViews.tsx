import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Folder, FileIcon as FileGlyph, Search } from "lucide-react";
import { FileKind, KIND_LABEL } from "@/lib/formats";
import { cn, formatBytes } from "@/lib/utils";
import { FileIcon } from "../FileIcon";

/* --------------------------------------------------------------------- PDF */

export function PdfViewer({ url }: { url: string }) {
  return (
    <div className="relative h-full w-full">
      <iframe src={`${url}#view=FitH&toolbar=1`} title="PDF document" className="h-full w-full border-0" />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="material absolute bottom-6 right-6 flex items-center gap-1.5 rounded-full px-4 py-2 text-footnote font-medium shadow-popover transition-opacity hover:opacity-80"
      >
        <ExternalLink aria-hidden size={13} /> Open in new tab
      </a>
    </div>
  );
}

/* ----------------------------------------------------------------- Archive */

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

interface Entry {
  path: string;
  dir: boolean;
  size?: number;
  date: Date;
}

export function ArchiveViewer({ blob, name }: { blob: Blob; name: string }) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    import("jszip")
      .then(({ default: JSZip }) => JSZip.loadAsync(blob))
      .then((zip) => {
        if (cancelled) return;
        const list: Entry[] = [];
        zip.forEach((path, f) => {
          // `_data.uncompressedSize` is internal but stable in JSZip 3.
          const size = (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;
          list.push({ path, dir: f.dir, size, date: f.date });
        });
        // Many zips omit explicit directory entries — synthesize them.
        const dirs = new Set(list.filter((e) => e.dir).map((e) => e.path));
        for (const e of [...list]) {
          const parts = e.path.replace(/\/$/, "").split("/");
          for (let i = 1; i < parts.length; i++) {
            const d = parts.slice(0, i).join("/") + "/";
            if (!dirs.has(d)) {
              dirs.add(d);
              list.push({ path: d, dir: true, date: e.date });
            }
          }
        }
        list.sort((a, b) => a.path.localeCompare(b.path));
        setEntries(list);
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [blob]);

  const shown = useMemo(() => entries?.filter((e) => e.path.toLowerCase().includes(q.toLowerCase())) ?? [], [entries, q]);

  if (error) return <InfoCard kind="archive" name={name} blob={blob} message={`Couldn’t read this archive (${error}). It may be damaged or password-protected.`} />;
  if (!entries)
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );

  const files = entries.filter((e) => !e.dir);
  const total = files.reduce((n, e) => n + (e.size ?? 0), 0);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-4 px-6 py-4" style={{ boxShadow: "0 1px 0 var(--hairline)" }}>
        <FileIcon kind="archive" size={40} />
        <div className="min-w-0">
          <p className="text-body font-semibold">
            {files.length} {files.length === 1 ? "file" : "files"} · {entries.length - files.length} {entries.length - files.length === 1 ? "folder" : "folders"}
          </p>
          <p className="text-footnote text-muted">
            {formatBytes(total)} uncompressed · {formatBytes(blob.size)} packed
            {total > 0 && ` · ${Math.max(0, Math.round((1 - blob.size / total) * 100))}% compression`}
          </p>
        </div>
        <label className="ml-auto flex h-9 w-full items-center gap-2 rounded-[10px] bg-fg/[0.05] px-3 text-footnote focus-within:ring-2 focus-within:ring-accent/50 sm:w-60">
          <Search aria-hidden size={13} className="text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter entries…" name="archive-filter" autoComplete="off" spellCheck={false} aria-label="Filter entries" className="w-full bg-transparent outline-none placeholder:text-subtle" />
        </label>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-3 py-3">
        {shown.slice(0, 3000).map((e, i) => {
          const depth = e.path.replace(/\/$/, "").split("/").length - 1;
          const base = e.path.replace(/\/$/, "").split("/").pop();
          return (
            <motion.div
              key={e.path}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: Math.min(i, 30) * 0.01 }}
              className="cv-row flex items-center gap-3 rounded-xl px-3 py-2 text-footnote transition-colors hover:bg-fg/[0.035]"
              style={{ paddingLeft: 12 + depth * 20 }}
            >
              {e.dir ? <Folder aria-hidden size={15} strokeWidth={1.5} className="shrink-0 text-muted" /> : <FileGlyph aria-hidden size={15} strokeWidth={1.5} className="shrink-0 text-subtle" />}
              <span className={cn("min-w-0 truncate", e.dir && "font-medium")} translate="no">{base}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted">{e.dir ? "—" : formatBytes(e.size ?? 0)}</span>
              <span className="hidden w-24 shrink-0 text-right text-caption text-subtle sm:block">{dateFmt.format(e.date)}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------- Unsupported / info */

const MAGIC: [string, string][] = [
  ["89504e47", "PNG image"],
  ["ffd8ff", "JPEG image"],
  ["47494638", "GIF image"],
  ["25504446", "PDF document"],
  ["504b0304", "ZIP container (also DOCX/XLSX/PPTX/EPUB)"],
  ["52617221", "RAR archive"],
  ["377abcaf", "7-Zip archive"],
  ["1f8b", "GZIP stream"],
  ["494433", "MP3 (ID3 tag)"],
  ["4f676753", "OGG container"],
  ["664c6143", "FLAC audio"],
  ["52494646", "RIFF (WAV/AVI/WEBP)"],
  ["1a45dfa3", "Matroska / WebM"],
  ["0061736d", "WebAssembly"],
  ["7f454c46", "ELF executable"],
  ["4d5a", "Windows executable"],
  ["cafebabe", "Java class / Mach-O fat"],
  ["d0cf11e0", "Legacy MS Office (OLE)"],
  ["774f4632", "WOFF2 font"],
  ["774f4646", "WOFF font"],
  ["00010000", "TrueType font"],
  ["4f54544f", "OpenType font"],
];

export function InfoCard({ kind, name, blob, message }: { kind: FileKind; name: string; blob?: Blob; message?: string }) {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);

  useEffect(() => {
    blob?.slice(0, 256).arrayBuffer().then((b) => setBytes(new Uint8Array(b)));
  }, [blob]);

  const hex = bytes ? [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("") : "";
  let magic = MAGIC.find(([sig]) => hex.startsWith(sig))?.[1];
  if (!magic && hex.slice(8, 16) === "66747970") magic = "ISO-BMFF (MP4/MOV/HEIC/M4A)";

  return (
    <div className="scroll-thin flex h-full w-full flex-col items-center overflow-auto px-6 py-16">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="flex flex-col items-center">
        <FileIcon kind={kind} size={96} />
        <p className="mt-8 max-w-md break-all text-center font-display text-title font-semibold" translate="no">{name}</p>
        <p className="mt-2 max-w-sm text-center text-body text-muted">
          {message ?? `There’s no preview for this ${KIND_LABEL[kind].toLowerCase()} type, but here’s what’s inside.`}
        </p>
        {magic && <p className="mt-4 text-footnote text-subtle">Detected: {magic}</p>}
      </motion.div>
      {bytes && (
        <div className="mt-12 w-full max-w-xl">
          <p className="eyebrow mb-3">First 256 bytes</p>
          <div className="scroll-thin overflow-x-auto rounded-2xl bg-fg/[0.03] p-5 font-mono text-caption leading-6">
            {Array.from({ length: Math.ceil(bytes.length / 16) }).map((_, row) => {
              const slice = [...bytes.slice(row * 16, row * 16 + 16)];
              return (
                <div key={row} className="flex gap-5 whitespace-pre">
                  <span className="text-subtle">{(row * 16).toString(16).padStart(6, "0")}</span>
                  <span>{slice.map((b) => b.toString(16).padStart(2, "0")).join(" ").padEnd(47)}</span>
                  <span className="text-muted">{slice.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "·")).join("")}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
