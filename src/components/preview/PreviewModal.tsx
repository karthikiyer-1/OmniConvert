import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, Copy, Info, Loader2, X } from "lucide-react";
import { origKey, outKey, useStore, FileItem } from "@/lib/store";
import { useFocusTrap, useStoredBlob } from "@/lib/hooks";
import { getParam, setParam } from "@/lib/router";
import { detectKind, isBrowserImage, isTextual, KIND_LABEL, outputsFor } from "@/lib/formats";
import { cn, formatBytes, formatCount, formatDateTime, formatDuration, formatSeconds } from "@/lib/utils";
import { t } from "@/lib/motion";
import { StatusBadge } from "../StatusBadge";
import { ProgressBar } from "../ProgressBar";
import { FormatSelect } from "../FormatSelect";
import { downloadItem } from "../FileCard";
import { openLibraryItem } from "../opener/OpenerPage";
import { navigate } from "@/lib/router";
import { ImageViewer } from "./ImageViewer";
import { MediaPlayer } from "./MediaPlayer";
import { TextViewer } from "./TextViewer";
import { ArchiveViewer, InfoCard, PdfViewer } from "./FallbackViews";

export function PreviewModal() {
  const previewId = useStore((s) => s.previewId);
  const items = useStore((s) => s.items);
  const open = useStore((s) => s.openPreview);
  const item = items.find((i) => i.id === previewId);
  const hydrated = useStore((s) => s.hydrated);
  const dialog = useRef<HTMLDivElement>(null);
  useFocusTrap(dialog, !!item);

  // Deep link: #/?file=<id> opens the preview; closing removes it.
  useEffect(() => {
    if (!hydrated) return;
    const id = getParam("file");
    if (id && useStore.getState().items.some((i) => i.id === id)) open(id);
  }, [hydrated, open]);
  useEffect(() => {
    if (hydrated) setParam("file", item ? item.id : null);
  }, [item?.id, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!previewId) return;
    const onKey = (e: KeyboardEvent) => {
      if (document.fullscreenElement) return;
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      if (e.key === "Escape") open(null);
      if (e.shiftKey) return; // Shift+arrows pan images
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
          className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/30 backdrop-blur-[20px] md:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, pointerEvents: "none", transition: t.fast }}
          transition={t.base}
          onClick={() => open(null)}
        >
          <motion.div
            ref={dialog}
            role="dialog"
            aria-modal
            aria-label={`Preview ${item.name}`}
            initial={{ opacity: 0, scale: 0.98, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8, transition: t.fast }}
            transition={t.slow}
            className="relative flex h-full w-full max-w-[1280px] flex-col overflow-hidden bg-surface shadow-modal md:h-[min(880px,92dvh)] md:rounded-card"
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
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

  useEffect(() => {
    setView(hasOutput ? "output" : "original");
  }, [item.id, hasOutput]);

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
        <Loader2 aria-hidden size={20} strokeWidth={1.75} className="animate-spin" />
        <p className="text-footnote">{item.status === "uploading" ? `Adding… ${item.progress}%` : "Opening…"}</p>
      </div>
    );
  } else if (!blob || !url) {
    viewer = <InfoCard kind={kind} name={name} message="This file’s contents are no longer stored in your browser. Add it again from your device to preview it." />;
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

  const download = () => downloadItem(item, showingOutput ? "output" : "original");

  return (
    <>
      {/* Title bar */}
      <div className="flex h-16 shrink-0 items-center gap-2 px-4 md:px-5" style={{ boxShadow: "0 1px 0 var(--hairline)" }}>
        <div className="flex items-center max-sm:hidden">
          <button className="icon-btn" disabled={idx <= 0} onClick={() => open(items[idx - 1].id)} aria-label="Previous file">
            <ChevronLeft aria-hidden size={18} strokeWidth={1.75} />
          </button>
          <button className="icon-btn" disabled={idx >= items.length - 1} onClick={() => open(items[idx + 1].id)} aria-label="Next file">
            <ChevronRight aria-hidden size={18} strokeWidth={1.75} />
          </button>
        </div>
        <div className="min-w-0 flex-1 px-1">
          <h2 className="truncate text-body font-semibold" translate="no">
            {name}
          </h2>
          <p className="truncate text-caption tabular-nums text-muted">
            {KIND_LABEL[kind]} · {formatBytes(showingOutput ? item.output!.size : item.size)}
            {!showingOutput && item.width && item.height ? ` · ${item.width} × ${item.height}` : ""}
            {!showingOutput && item.duration ? ` · ${formatDuration(item.duration)}` : ""}
          </p>
        </div>

        {hasOutput && (
          // CSS thumb on purpose: a framer `layoutId` here keeps the modal mounted after exit.
          <div className="segmented grid-cols-2 max-md:hidden" role="group" aria-label="Version">
            <span
              className="segmented-thumb"
              style={{ left: 2, width: "calc((100% - 4px) / 2)", transform: view === "output" ? "translateX(100%)" : "none" }}
            />
            {(["original", "output"] as const).map((v) => (
              <button key={v} className="segmented-item uppercase" aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "original" ? item.ext || "Original" : item.output!.ext}
              </button>
            ))}
          </div>
        )}

        <button
          className="btn-secondary ml-2"
          disabled={item.status === "uploading"}
          onClick={async () => {
            if (await openLibraryItem(item)) {
              open(null);
              navigate("open");
            }
          }}
        >
          Edit
        </button>
        <button className="btn-secondary max-sm:hidden" onClick={download}>
          Download
        </button>
        <button className={cn("icon-btn", showInfo && "bg-fg/[0.06] text-fg")} onClick={() => setShowInfo((v) => !v)} aria-label="Info" aria-pressed={showInfo}>
          <Info aria-hidden size={18} strokeWidth={1.75} />
        </button>
        <button className="icon-btn -mr-1" onClick={() => open(null)} aria-label="Close">
          <X aria-hidden size={18} strokeWidth={1.75} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${item.id}-${view}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t.fast}
            className="relative min-w-0 flex-1 bg-bg/60"
          >
            {viewer}
            {showingOutput && item.output!.simulated && (
              <div className="material pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-4 py-1.5 text-caption text-muted">
                Simulated {item.output!.ext.toUpperCase()} · showing the original
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {showInfo && (
            <motion.aside
              aria-label="File info"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={t.base}
              className="overflow-hidden bg-surface max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-10 max-lg:shadow-modal"
              style={{ boxShadow: "-1px 0 0 var(--hairline)" }}
            >
              <InfoPanel item={item} onRemove={() => remove(item.id)} onDownload={download} />
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

function Row({ k, v, mono }: { k: string; v?: React.ReactNode; mono?: boolean }) {
  if (v === undefined || v === "") return null;
  return (
    <div className="flex items-start justify-between gap-6 py-1.5">
      <dt className="shrink-0 text-footnote text-muted">{k}</dt>
      <dd className={cn("min-w-0 break-all text-right text-footnote", mono && "font-mono text-caption")}>{v}</dd>
    </div>
  );
}

function InfoPanel({ item, onRemove, onDownload }: { item: FileItem; onRemove: () => void; onDownload: () => void }) {
  const setTarget = useStore((s) => s.setTarget);
  const start = useStore((s) => s.start);
  const cancel = useStore((s) => s.cancel);
  const options = useMemo(() => outputsFor(item.kind, item.ext), [item.kind, item.ext]);
  const running = item.status === "converting" || item.status === "queued";
  const busy = running || item.status === "uploading";
  const [copied, setCopied] = useState(false);

  return (
    <div className="scroll-thin h-full w-[min(340px,100vw)] overflow-y-auto overscroll-contain px-6 py-6">
      {/* Convert */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="eyebrow">Convert</h3>
          <StatusBadge status={item.status} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-callout font-semibold uppercase">{item.ext || "—"}</span>
          <ChevronRight aria-hidden size={16} strokeWidth={1.75} className="text-subtle" />
          <FormatSelect size="sm" options={options} value={item.target} onChange={(e) => setTarget(item.id, e)} disabled={busy} />
        </div>
        <div className="mt-4 flex gap-2">
          {running ? (
            <button className="btn-secondary flex-1" onClick={() => cancel(item.id)}>
              Stop
            </button>
          ) : (
            <button className="btn-secondary flex-1 !bg-fg !text-bg hover:!bg-fg/85" disabled={busy || !item.target} onClick={() => start([item.id])}>
              {item.status === "ready" ? "Convert Again" : "Convert"}
            </button>
          )}
          <button className="btn-secondary sm:hidden" onClick={onDownload}>
            Download
          </button>
        </div>
        {running && (
          <div className="mt-4">
            <ProgressBar value={item.progress} muted={item.status === "queued"} />
            <p className="mt-1.5 flex justify-between gap-4 text-caption text-muted">
              <span className="truncate">{item.stage}</span>
              <span className="tabular-nums">{item.progress}%</span>
            </p>
          </div>
        )}
        {item.status === "failed" && item.error && <p className="mt-3 text-footnote text-danger">{item.error}</p>}
      </section>

      {item.output && (
        <section className="mt-10">
          <h3 className="eyebrow mb-2">Output</h3>
          <dl>
            <Row k="Name" v={item.output.name} />
            <Row k="Size" v={`${formatBytes(item.output.size)}${item.output.simulated ? "" : ` · ${sizeDelta(item.size, item.output.size)}`}`} />
            <Row k="Engine" v={item.output.simulated ? "Simulated" : "On this device"} />
            <Row k="Time" v={formatSeconds(item.output.durationMs / 1000)} />
            <Row k="Type" v={item.output.mime} mono />
          </dl>
          {item.output.note && <p className="mt-3 text-footnote text-muted">{item.output.note}</p>}
        </section>
      )}

      <section className="mt-10">
        <h3 className="eyebrow mb-2">Original</h3>
        <dl>
          <Row k="Name" v={item.name} />
          <Row k="Kind" v={KIND_LABEL[item.kind]} />
          <Row k="Type" v={item.mime || "unknown"} mono />
          <Row k="Size" v={`${formatBytes(item.size)} (${formatCount(item.size)}\u00A0bytes)`} />
          <Row k="Dimensions" v={item.width && item.height ? `${item.width} × ${item.height}` : undefined} />
          <Row k="Duration" v={item.duration ? formatDuration(item.duration) : undefined} />
          <Row k="Modified" v={formatDateTime(item.lastModified)} />
          <Row k="Added" v={formatDateTime(item.addedAt)} />
        </dl>
      </section>

      <section className="mt-10">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="eyebrow">SHA-256</h3>
          {item.sha256 && (
            <button
              className="icon-btn -mr-2 h-7 w-7"
              aria-label="Copy checksum"
              onClick={() =>
                navigator.clipboard.writeText(item.sha256!).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                })
              }
            >
              {copied ? <Check aria-hidden size={14} className="text-success" /> : <Copy aria-hidden size={14} strokeWidth={1.75} />}
            </button>
          )}
        </div>
        <p className="break-all font-mono text-caption leading-5 text-muted">
          {item.sha256 ?? (item.status === "uploading" ? "Calculating…" : "Not calculated: files over 256\u00A0MB are skipped.")}
        </p>
      </section>

      <button className="btn-text mt-10 -ml-3 text-danger hover:bg-danger/[0.06]" onClick={onRemove}>
        Remove File
      </button>
    </div>
  );
}
