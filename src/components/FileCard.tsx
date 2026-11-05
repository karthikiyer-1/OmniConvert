import { forwardRef } from "react";
import { motion } from "framer-motion";
import { ArrowDown, RotateCcw, Square, X } from "lucide-react";
import { FileItem, origKey, outKey, useStore } from "@/lib/store";
import { getBlob } from "@/lib/db";
import { useStoredBlob } from "@/lib/hooks";
import { cn, downloadBlob, formatBytes } from "@/lib/utils";
import { t } from "@/lib/motion";
import { FileIcon } from "./FileIcon";
import { StatusBadge } from "./StatusBadge";
import { ProgressBar } from "./ProgressBar";

export async function downloadItem(item: FileItem, which: "output" | "original" = "output") {
  const useOut = which === "output" && item.output;
  const blob = await getBlob(useOut ? outKey(item.id) : origKey(item.id));
  if (!blob) {
    useStore.getState().toast({ tone: "error", title: "File not found", body: "It was cleared from browser storage" });
    return;
  }
  downloadBlob(blob, useOut ? item.output!.name : item.name);
}

function Thumb({ item }: { item: FileItem }) {
  const showImg = item.kind === "image" && item.status !== "uploading" && !["heic", "heif", "tiff", "tif"].includes(item.ext);
  const { url } = useStoredBlob(showImg ? origKey(item.id) : null, [item.status === "uploading"]);
  if (url)
    return (
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-fg/[0.05]">
        <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
      </div>
    );
  return <FileIcon kind={item.kind} size={44} />;
}

function Meta({ item }: { item: FileItem }) {
  if (item.output) {
    const pct = Math.round(((item.output.size - item.size) / Math.max(1, item.size)) * 100);
    return (
      <>
        {item.ext.toUpperCase()} → {item.output.ext.toUpperCase()} · {formatBytes(item.output.size)}
        {!item.output.simulated && pct !== 0 && (
          <span className={pct < 0 ? "text-success" : undefined}>
            {" "}
            ({pct < 0 ? "−" : "+"}
            {Math.abs(pct)}%)
          </span>
        )}
        {item.output.simulated && " · Simulated"}
      </>
    );
  }
  return (
    <>
      {formatBytes(item.size)}
      {item.target && ` · to ${item.target.toUpperCase()}`}
    </>
  );
}

const QuickAction = ({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) => (
  <button className="icon-btn h-8 w-8" title={label} aria-label={label} onClick={onClick}>
    {children}
  </button>
);

export const FileCard = forwardRef<HTMLLIElement, { item: FileItem }>(function FileCard({ item }, ref) {
  const openPreview = useStore((s) => s.openPreview);
  const remove = useStore((s) => s.remove);
  const cancel = useStore((s) => s.cancel);
  const retry = useStore((s) => s.retry);

  const busy = item.status === "uploading" || item.status === "queued" || item.status === "converting";

  return (
    <motion.li
      ref={ref}
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: t.fast }}
      transition={t.base}
      onClick={() => openPreview(item.id)}
      className="group relative cursor-pointer rounded-2xl px-3 py-3 transition-colors duration-200 ease-apple hover:bg-fg/[0.035]"
    >
      <div className="flex items-center gap-4">
        <Thumb item={item} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium" title={item.name}>
            {item.output ? item.output.name : item.name}
          </p>
          <p className="truncate text-footnote text-muted">
            <Meta item={item} />
          </p>
        </div>

        {/* Status, swapped for actions on hover (always shown on touch) */}
        <div className="relative flex shrink-0 items-center justify-end">
          <StatusBadge status={item.status} className="transition-opacity duration-200 lg:group-hover:opacity-0 max-lg:hidden" />
          <div
            className="flex items-center lg:absolute lg:right-0 lg:opacity-0 lg:transition-opacity lg:duration-200 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            {item.status === "ready" && (
              <QuickAction label="Download" onClick={() => downloadItem(item)}>
                <ArrowDown size={16} strokeWidth={1.75} />
              </QuickAction>
            )}
            {(item.status === "converting" || item.status === "queued") && (
              <QuickAction label="Stop" onClick={() => cancel(item.id)}>
                <Square size={11} fill="currentColor" strokeWidth={0} />
              </QuickAction>
            )}
            {(item.status === "failed" || item.status === "ready") && item.target && (
              <QuickAction label={item.status === "failed" ? "Try again" : "Convert again"} onClick={() => retry(item.id)}>
                <RotateCcw size={15} strokeWidth={1.75} />
              </QuickAction>
            )}
            <QuickAction label="Remove" onClick={() => remove(item.id)}>
              <X size={16} strokeWidth={1.75} />
            </QuickAction>
          </div>
        </div>
      </div>

      {busy && (
        <div className="mt-3 pl-[60px]">
          <ProgressBar value={item.status === "queued" ? 0 : item.progress} muted={item.status === "queued"} />
          <p className="mt-1.5 flex justify-between gap-4 text-caption text-muted">
            <span className="truncate">{item.status === "uploading" ? "Adding to library…" : item.stage}</span>
            {item.status !== "queued" && <span className="tabular-nums">{item.progress}%</span>}
          </p>
        </div>
      )}
      {item.status === "failed" && item.error && (
        <p className={cn("mt-1 pl-[60px] text-footnote text-danger")}>{item.error}</p>
      )}
      {item.status !== "failed" && !busy && (
        <StatusBadge status={item.status} className="mt-1 pl-[60px] lg:hidden" />
      )}
    </motion.li>
  );
});
