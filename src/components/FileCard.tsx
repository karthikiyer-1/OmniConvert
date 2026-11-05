import { forwardRef } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Download, Eye, RotateCcw, Square, X, Cloud } from "lucide-react";
import { FileItem, origKey, outKey, useStore } from "@/lib/store";
import { getBlob } from "@/lib/db";
import { useStoredBlob } from "@/lib/hooks";
import { cn, downloadBlob, formatBytes, timeAgo } from "@/lib/utils";
import { FileIcon } from "./FileIcon";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";

export async function downloadItem(item: FileItem, which: "output" | "original" = "output") {
  const useOut = which === "output" && item.output;
  const blob = await getBlob(useOut ? outKey(item.id) : origKey(item.id));
  if (!blob) {
    useStore.getState().toast({ tone: "error", title: "File data not found", body: "It may have been cleared from browser storage." });
    return;
  }
  downloadBlob(blob, useOut ? item.output!.name : item.name);
}

function Thumb({ item }: { item: FileItem }) {
  const showImg = item.kind === "image" && item.status !== "uploading" && !["heic", "heif", "tiff", "tif"].includes(item.ext);
  const { url } = useStoredBlob(showImg ? origKey(item.id) : null, [item.status === "uploading"]);
  if (url)
    return (
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[11px] bg-fg/[0.05] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.1)]">
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      </div>
    );
  return <FileIcon kind={item.kind} ext={item.ext} size={44} />;
}

export const FileCard = forwardRef<HTMLLIElement, { item: FileItem }>(function FileCard({ item }, ref) {
  const openPreview = useStore((s) => s.openPreview);
  const remove = useStore((s) => s.remove);
  const cancel = useStore((s) => s.cancel);
  const retry = useStore((s) => s.retry);

  const busy = item.status === "uploading" || item.status === "queued" || item.status === "converting";
  const delta = item.output && !item.output.simulated ? (item.output.size - item.size) / Math.max(1, item.size) : null;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <motion.li
      ref={ref}
      layout
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, x: 30, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      onClick={() => openPreview(item.id)}
      className={cn(
        "group relative cursor-pointer rounded-[14px] border border-transparent p-2.5 transition-colors hover:border-[rgb(var(--line)/0.1)] hover:bg-surface/70",
        item.status === "failed" && "bg-danger/[0.04]",
      )}
    >
      <div className="flex items-start gap-3">
        <Thumb item={item} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13px] font-semibold leading-5" title={item.name}>
              {item.output ? item.output.name : item.name}
            </p>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-muted">
            {item.output ? (
              <>
                <span className="uppercase">{item.ext}</span>
                <ArrowRight size={10} />
                <span className="font-semibold uppercase text-fg/80">{item.output.ext}</span>
                <span className="opacity-40">·</span>
                <span>{formatBytes(item.output.size)}</span>
                {delta !== null && Math.abs(delta) >= 0.01 && (
                  <span className={cn("font-medium", delta < 0 ? "text-success" : "text-warning")}>
                    {delta < 0 ? "−" : "+"}
                    {Math.abs(Math.round(delta * 100))}%
                  </span>
                )}
                {item.output.simulated && (
                  <span title={item.output.note} className="inline-flex items-center gap-0.5 text-violet">
                    <Cloud size={10} /> sim
                  </span>
                )}
              </>
            ) : (
              <>
                <span>{formatBytes(item.size)}</span>
                {item.target && (
                  <>
                    <span className="opacity-40">·</span>
                    <span className="uppercase">{item.ext}</span>
                    <ArrowRight size={10} />
                    <span className="uppercase">{item.target}</span>
                  </>
                )}
                {!busy && (
                  <>
                    <span className="opacity-40">·</span>
                    <span>{timeAgo(item.addedAt)}</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        <StatusBadge status={item.status} className="mt-0.5" />
      </div>

      {busy && (
        <div className="mt-2.5 pl-14">
          <ProgressBar value={item.status === "queued" ? 0 : item.progress} active={item.status !== "queued"} />
          <div className="mt-1 flex items-center justify-between text-[10.5px] text-muted">
            <span className="truncate">{item.status === "uploading" ? "Uploading to local vault…" : item.stage}</span>
            <span className="tabular-nums">{item.status === "queued" ? "" : `${item.progress}%`}</span>
          </div>
        </div>
      )}
      {item.status === "failed" && item.error && <p className="mt-1.5 pl-14 text-[11px] leading-snug text-danger">{item.error}</p>}

      {/* Quick actions */}
      <div
        className="mt-1.5 flex items-center justify-end gap-0.5 lg:absolute lg:bottom-2 lg:right-2 lg:mt-0 lg:rounded-[10px] lg:bg-surface/90 lg:p-0.5 lg:opacity-0 lg:shadow-soft lg:backdrop-blur lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
        onClick={stop}
      >
        <button className="icon-btn h-7 w-7" title="Preview" onClick={() => openPreview(item.id)}>
          <Eye size={14} />
        </button>
        {item.status === "ready" && (
          <button className="icon-btn h-7 w-7 !text-accent" title="Download converted file" onClick={() => downloadItem(item)}>
            <Download size={14} />
          </button>
        )}
        {(item.status === "converting" || item.status === "queued") && (
          <button className="icon-btn h-7 w-7" title="Stop" onClick={() => cancel(item.id)}>
            <Square size={12} fill="currentColor" />
          </button>
        )}
        {(item.status === "failed" || item.status === "ready") && item.target && (
          <button className="icon-btn h-7 w-7" title={item.status === "failed" ? "Retry" : "Convert again"} onClick={() => retry(item.id)}>
            <RotateCcw size={14} />
          </button>
        )}
        <button className="icon-btn h-7 w-7 hover:!text-danger" title="Remove" onClick={() => remove(item.id)}>
          <X size={15} />
        </button>
      </div>
    </motion.li>
  );
});
