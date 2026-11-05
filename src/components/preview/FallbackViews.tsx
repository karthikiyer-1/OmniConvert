import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ExternalLink, Folder, FileIcon as FileGlyph, Search } from "lucide-react";
import { FileKind, KIND_LABEL } from "@/lib/formats";
import { formatBytes } from "@/lib/utils";
import { FileIcon } from "../FileIcon";

/* --------------------------------------------------------------------- PDF */

export function PdfViewer({ url }: { url: string }) {
  return (
    <div className="relative h-full w-full bg-fg/[0.04]">
      <iframe src={`${url}#view=FitH&toolbar=1`} title="PDF preview" className="h-full w-full border-0" />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="glass-strong absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium shadow-float hover:text-accent"
      >
        <ExternalLink size={13} /> Open in new tab
      </a>
    </div>
  );
}

/* ----------------------------------------------------------------- Archive */

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

  if (error) return <InfoCard kind="archive" name={name} blob={blob} message={`Couldn't read archive: ${error}`} />;
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
      <div className="flex flex-wrap items-center gap-3 border-b hairline px-4 py-2.5">
        <FileIcon kind="archive" size={32} />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">
            {files.length} {files.length === 1 ? "file" : "files"} · {entries.length - files.length} {entries.length - files.length === 1 ? "folder" : "folders"}
          </p>
          <p className="text-[11.5px] text-muted">
            {formatBytes(total)} uncompressed · {formatBytes(blob.size)} packed
            {total > 0 && ` · ${Math.max(0, Math.round((1 - blob.size / total) * 100))}% compression`}
          </p>
        </div>
        <label className="ml-auto flex w-full items-center gap-2 rounded-[10px] bg-fg/[0.05] px-2.5 py-1.5 text-[12.5px] sm:w-56">
          <Search size={13} className="text-subtle" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter entries" className="w-full bg-transparent outline-none placeholder:text-subtle" />
        </label>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-2">
        {shown.slice(0, 3000).map((e, i) => {
          const depth = e.path.replace(/\/$/, "").split("/").length - 1;
          const base = e.path.replace(/\/$/, "").split("/").pop();
          return (
            <motion.div
              key={e.path}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: Math.min(i, 40) * 0.008 }}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] hover:bg-fg/[0.04]"
              style={{ paddingLeft: 8 + depth * 16 }}
            >
              {e.dir ? <Folder size={14} className="shrink-0 text-accent" fill="currentColor" fillOpacity={0.2} /> : <FileGlyph size={14} className="shrink-0 text-subtle" />}
              <span className={e.dir ? "font-medium" : ""}>{base}</span>
              <span className="ml-auto shrink-0 tabular-nums text-muted">{e.dir ? "—" : formatBytes(e.size ?? 0)}</span>
              <span className="hidden w-24 shrink-0 text-right text-[11px] text-subtle sm:block">{e.date.toLocaleDateString()}</span>
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
    <div className="scroll-thin flex h-full w-full flex-col items-center overflow-auto px-5 py-10">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
        <FileIcon kind={kind} ext={name.split(".").pop()} size={88} className="!rounded-[24px]" />
      </motion.div>
      <p className="mt-5 max-w-md break-all text-center text-[17px] font-semibold tracking-[-0.01em]">{name}</p>
      <p className="mt-1 text-center text-[13px] text-muted">
        {message ?? `Quick Look isn't available for this ${KIND_LABEL[kind].toLowerCase()} type — here's what we know about it.`}
      </p>
      {magic && (
        <span className="chip mt-3 bg-success/12 text-success">Signature: {magic}</span>
      )}
      {bytes && (
        <div className="glass mt-6 w-full max-w-xl overflow-hidden rounded-2xl">
          <p className="border-b hairline px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">Header bytes</p>
          <div className="scroll-thin overflow-x-auto p-4 font-mono text-[11.5px] leading-[1.7]">
            {Array.from({ length: Math.ceil(bytes.length / 16) }).map((_, row) => {
              const slice = [...bytes.slice(row * 16, row * 16 + 16)];
              return (
                <div key={row} className="flex gap-4 whitespace-pre">
                  <span className="text-subtle">{(row * 16).toString(16).padStart(6, "0")}</span>
                  <span className="text-fg/85">{slice.map((b) => b.toString(16).padStart(2, "0")).join(" ").padEnd(47)}</span>
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
