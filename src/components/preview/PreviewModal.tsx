import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Cloud, Copy, Cpu, Download, Info, Loader2, Trash2, Wand2, X } from "lucide-react";
import { origKey, outKey, useStore, FileItem } from "@/lib/store";
import { useStoredBlob } from "@/lib/hooks";
import { detectKind, isBrowserImage, isTextual, KIND_LABEL, outputsFor } from "@/lib/formats";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { FileIcon } from "../FileIcon";
import { StatusBadge } from "../StatusBadge";
import { ProgressBar } from "../ProgressBar";
import { FormatSelect } from "../FormatSelect";
import { downloadItem } from "../FileCard";
import { ImageViewer } from "./ImageViewer";
import { MediaPlayer } from "./MediaPlayer";
import { TextViewer } from "./TextViewer";
import { ArchiveViewer, InfoCard, PdfViewer } from "./FallbackViews";

export function PreviewModal() {
  const previewId = useStore((s) => s.previewId);
  const items = useStore((s) => s.items);
  const open = useStore((s) => s.openPreview);
  const item = items.find((i) => i.id === previewId);

  useEffect(() => {
    if (!previewId) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.fullscreenElement) return;
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "Escape") open(null);
      const idx = items.findIndex((i) => i.id === previewId);
      if (e.key === "ArrowRight" && idx < items.length - 1) open(items[idx + 1].id);
      if (e.key === "ArrowLeft" && idx > 0) open(items[idx - 1].id);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [previewId, items, open]);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          key="backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-md sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, pointerEvents: "none", transition: { duration: 0.2 } }}
          onClick={() => open(null)}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-label={`Preview ${item.name}`}
            initial={{ opacity: 0, scale: 0.94, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12, transition: { duration: 0.18 } }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="glass-strong relative flex h-full w-full max-w-[1280px] flex-col overflow-hidden shadow-modal sm:h-[min(880px,92dvh)] sm:rounded-[24px]"
            onClick={(e) => e.stopPropagation()}
          >
            <PreviewBody item={item} items={items} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PreviewBody({ item, items }: { item: FileItem; items: FileItem[] }) {
  const open = useStore((s) => s.openPreview);
  const remove = useStore((s) => s.remove);
  const hasOutput = item.status === "ready" && !!item.output;
  const [view, setView] = useState<"output" | "original">(hasOutput ? "output" : "original");
  const [showInfo, setShowInfo] = useState(() => window.innerWidth >= 1024);

  useEffect(() => setView(hasOutput ? "output" : "original"), [item.id, hasOutput]);

  const showingOutput = view === "output" && hasOutput;
  const { blob, url, loading } = useStoredBlob(
    item.status === "uploading" ? null : showingOutput ? outKey(item.id) : origKey(item.id),
    [item.output?.finishedAt, item.status === "uploading"],
  );

  // Simulated outputs carry the source bytes, so preview them as the source type.
  const real = showingOutput && !item.output!.simulated;
  const name = showingOutput ? item.output!.name : item.name;
  const ext = real ? item.output!.ext : item.ext;
  const kind = real ? detectKind(item.output!.name, item.output!.mime) : item.kind;

  const idx = items.findIndex((i) => i.id === item.id);

  let viewer: React.ReactNode;
  if (item.status === "uploading" || loading) {
    viewer = (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted">
        <Loader2 size={24} className="animate-spin" />
        <p className="text-[13px]">{item.status === "uploading" ? `Uploading… ${item.progress}%` : "Opening…"}</p>
      </div>
    );
  } else if (!blob || !url) {
    viewer = <InfoCard kind={kind} name={name} message="The file's bytes are no longer in browser storage. Metadata is shown on the right." />;
  } else if (kind === "image" && isBrowserImage(ext)) {
    viewer = <ImageViewer key={url} url={url} name={name} />;
  } else if (kind === "video" || kind === "audio") {
    viewer = <MediaPlayer key={url} url={url} blob={blob} kind={kind} name={name} />;
  } else if (kind === "pdf") {
    viewer = <PdfViewer url={url} />;
  } else if (isTextual(kind, ext)) {
    viewer = <TextViewer key={url} blob={blob} ext={ext} />;
  } else if (kind === "archive" && ext === "zip") {
    viewer = <ArchiveViewer key={url} blob={blob} name={name} />;
  } else {
    viewer = <InfoCard kind={kind} name={name} blob={blob} />;
  }

  return (
    <>
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b hairline px-3 py-2.5 sm:px-4">
        <div className="flex items-center gap-1 max-sm:hidden">
          <button className="icon-btn" disabled={idx <= 0} onClick={() => open(items[idx - 1].id)} title="Previous (←)">
            <ChevronLeft size={18} />
          </button>
          <button className="icon-btn" disabled={idx >= items.length - 1} onClick={() => open(items[idx + 1].id)} title="Next (→)">
            <ChevronRight size={18} />
          </button>
        </div>
        <FileIcon kind={kind} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold">{name}</p>
          <p className="truncate text-[11.5px] text-muted">
            {KIND_LABEL[kind]} · {formatBytes(showingOutput ? item.output!.size : item.size)}
            {!showingOutput && item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
            {!showingOutput && item.duration ? ` · ${formatDuration(item.duration)}` : ""}
            <span className="max-sm:hidden"> · {idx + 1} of {items.length}</span>
          </p>
        </div>

        {hasOutput && (
          // Plain CSS pill: a framer `layoutId` here keeps the modal mounted after exit.
          <div className="relative grid grid-cols-2 rounded-[9px] bg-fg/[0.06] p-[3px] text-[12px] font-medium max-md:hidden">
            <span
              className="absolute bottom-[3px] left-[3px] top-[3px] w-[calc(50%-3px)] rounded-[7px] bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.12)] transition-transform duration-300 ease-[cubic-bezier(.3,1.3,.5,1)] dark:bg-elevated"
              style={{ transform: view === "output" ? "translateX(100%)" : "none" }}
            />
            {(["original", "output"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={cn("relative rounded-[7px] px-3 py-1 uppercase transition-colors", view === v ? "text-fg" : "text-muted hover:text-fg")}>
                {v === "original" ? item.ext || "Original" : item.output!.ext}
              </button>
            ))}
          </div>
        )}

        <button className="btn-tinted h-8 px-3 max-sm:hidden" onClick={() => downloadItem(item, showingOutput ? "output" : "original")}>
          <Download size={14} /> Download
        </button>
        <button className="icon-btn sm:hidden" onClick={() => downloadItem(item, showingOutput ? "output" : "original")} aria-label="Download">
          <Download size={17} />
        </button>
        <button className={cn("icon-btn", showInfo && "bg-fg/[0.08] text-fg")} onClick={() => setShowInfo((v) => !v)} title="File info">
          <Info size={17} />
        </button>
        <button className="icon-btn" onClick={() => open(null)} title="Close (Esc)">
          <X size={18} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${item.id}-${view}`}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.18 }}
            className="relative min-w-0 flex-1"
          >
            {viewer}
            {showingOutput && item.output!.simulated && (
              <div className="glass-strong pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium text-violet shadow-soft">
                <Cloud size={12} /> Simulated {item.output!.ext.toUpperCase()} — previewing source bytes
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {showInfo && (
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 38 }}
              className="overflow-hidden border-l hairline bg-surface/40 max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-10 max-lg:bg-elevated/95 max-lg:backdrop-blur-xl"
            >
              <InfoPanel item={item} onRemove={() => remove(item.id)} />
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function sizeDelta(from: number, to: number) {
  const pct = Math.round(((to - from) / Math.max(1, from)) * 100);
  return pct === 0 ? "same size" : `${pct < 0 ? "−" : "+"}${Math.abs(pct)}%`;
}

function InfoPanel({ item, onRemove }: { item: FileItem; onRemove: () => void }) {
  const setTarget = useStore((s) => s.setTarget);
  const start = useStore((s) => s.start);
  const cancel = useStore((s) => s.cancel);
  const options = useMemo(() => outputsFor(item.kind, item.ext), [item.kind, item.ext]);
  const busy = item.status === "converting" || item.status === "queued" || item.status === "uploading";
  const [copied, setCopied] = useState(false);

  const Row = ({ k, v, mono }: { k: string; v?: React.ReactNode; mono?: boolean }) =>
    v === undefined || v === "" ? null : (
      <div className="flex items-start justify-between gap-4 py-1.5 text-[12.5px]">
        <span className="shrink-0 text-muted">{k}</span>
        <span className={cn("min-w-0 break-all text-right font-medium", mono && "font-mono text-[11.5px]")}>{v}</span>
      </div>
    );

  return (
    <div className="scroll-thin h-full w-[min(320px,100vw)] overflow-y-auto p-4">
      {/* Convert / re-convert */}
      <section className="rounded-2xl bg-fg/[0.04] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">Convert</p>
          <StatusBadge status={item.status} />
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-fg/[0.07] px-2 py-1 text-[12px] font-semibold uppercase">{item.ext || "?"}</span>
          <ChevronRight size={14} className="text-subtle" />
          <FormatSelect size="sm" options={options} value={item.target} onChange={(e) => setTarget(item.id, e)} disabled={busy} />
          <div className="flex-1" />
          {item.status === "converting" || item.status === "queued" ? (
            <button className="btn-ghost h-8 px-2.5 text-[12px]" onClick={() => cancel(item.id)}>
              Stop
            </button>
          ) : (
            <button className="btn-primary h-8 px-3 text-[12px]" disabled={busy || !item.target} onClick={() => start([item.id])}>
              <Wand2 size={13} /> {item.status === "ready" ? "Again" : "Convert"}
            </button>
          )}
        </div>
        {(item.status === "converting" || item.status === "queued") && (
          <div className="mt-3">
            <ProgressBar value={item.progress} active={item.status === "converting"} />
            <p className="mt-1 flex justify-between text-[10.5px] text-muted">
              <span className="truncate">{item.stage}</span>
              <span className="tabular-nums">{item.progress}%</span>
            </p>
          </div>
        )}
        {item.status === "failed" && item.error && <p className="mt-2 text-[11.5px] text-danger">{item.error}</p>}
      </section>

      {item.output && (
        <section className="mt-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">Output</p>
          <div className="divide-y divide-[rgb(var(--line)/0.08)]">
            <Row k="File" v={item.output.name} />
            <Row k="Format" v={item.output.ext.toUpperCase()} />
            <Row k="Size" v={`${formatBytes(item.output.size)}${item.output.simulated ? "" : ` (${sizeDelta(item.size, item.output.size)})`}`} />
            <Row
              k="Engine"
              v={
                item.output.simulated ? (
                  <span className="inline-flex items-center gap-1 text-violet">
                    <Cloud size={12} /> Cloud (simulated)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-success">
                    <Cpu size={12} /> On-device
                  </span>
                )
              }
            />
            <Row k="Took" v={`${(item.output.durationMs / 1000).toFixed(1)} s`} />
            <Row k="MIME" v={item.output.mime} mono />
          </div>
          {item.output.note && <p className="mt-2 rounded-xl bg-violet/[0.08] px-3 py-2 text-[11.5px] leading-snug text-violet">{item.output.note}</p>}
        </section>
      )}

      <section className="mt-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">Source</p>
        <div className="divide-y divide-[rgb(var(--line)/0.08)]">
          <Row k="Name" v={item.name} />
          <Row k="Kind" v={KIND_LABEL[item.kind]} />
          <Row k="MIME type" v={item.mime || "unknown"} mono />
          <Row k="Size" v={`${formatBytes(item.size)} (${item.size.toLocaleString()} bytes)`} />
          <Row k="Dimensions" v={item.width && item.height ? `${item.width} × ${item.height} px` : undefined} />
          <Row k="Megapixels" v={item.width && item.height ? (((item.width * item.height) / 1e6).toFixed(2) + " MP") : undefined} />
          <Row k="Duration" v={item.duration ? formatDuration(item.duration) : undefined} />
          <Row k="Modified" v={new Date(item.lastModified).toLocaleString()} />
          <Row k="Added" v={new Date(item.addedAt).toLocaleString()} />
        </div>
      </section>

      <section className="mt-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-subtle">Integrity</p>
        <div className="rounded-xl bg-fg/[0.04] p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] text-muted">SHA-256</span>
            {item.sha256 && (
              <button
                className="icon-btn h-6 w-6"
                title="Copy checksum"
                onClick={() =>
                  navigator.clipboard.writeText(item.sha256!).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  })
                }
              >
                {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              </button>
            )}
          </div>
          <p className="mt-1 break-all font-mono text-[10.5px] leading-relaxed text-fg/80">
            {item.sha256 ?? (item.status === "uploading" ? "Computing…" : "Not computed (file too large)")}
          </p>
        </div>
      </section>

      <button className="btn mt-5 w-full text-danger hover:bg-danger/10" onClick={onRemove}>
        <Trash2 size={14} /> Remove from shelf
      </button>
    </div>
  );
}
