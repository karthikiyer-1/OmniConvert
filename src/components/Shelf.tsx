import { useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { Archive, Inbox, Loader2, Search, Trash2, Sparkle } from "lucide-react";
import { useStore } from "@/lib/store";
import { downloadAllAsZip } from "@/lib/exportZip";
import { cn, formatBytes } from "@/lib/utils";
import { FileCard } from "./FileCard";

type Filter = "all" | "active" | "ready" | "failed";

export function Shelf() {
  const items = useStore((s) => s.items);
  const clearAll = useStore((s) => s.clearAll);
  const clearFinished = useStore((s) => s.clearFinished);
  const toast = useStore((s) => s.toast);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [zipping, setZipping] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const counts = useMemo(
    () => ({
      all: items.length,
      active: items.filter((i) => ["uploading", "pending", "queued", "converting"].includes(i.status)).length,
      ready: items.filter((i) => i.status === "ready").length,
      failed: items.filter((i) => i.status === "failed").length,
    }),
    [items],
  );

  const visible = items.filter((i) => {
    if (q && !i.name.toLowerCase().includes(q.toLowerCase())) return false;
    if (filter === "active") return ["uploading", "pending", "queued", "converting"].includes(i.status);
    if (filter === "ready") return i.status === "ready";
    if (filter === "failed") return i.status === "failed";
    return true;
  });

  const saved = items.reduce((n, i) => (i.output && !i.output.simulated ? n + (i.size - i.output.size) : n), 0);

  const exportZip = async () => {
    setZipping(0);
    try {
      const n = await downloadAllAsZip(items, (p) => setZipping(Math.round(p)));
      toast({ tone: "success", title: `Exported ${n} file${n > 1 ? "s" : ""} as ZIP` });
    } catch (e) {
      toast({ tone: "error", title: "Export failed", body: (e as Error).message });
    } finally {
      setZipping(null);
    }
  };

  return (
    <aside className="glass flex max-h-[calc(100dvh-88px)] min-h-[420px] flex-col overflow-hidden rounded-[22px] lg:sticky lg:top-[72px]">
      {/* Header */}
      <div className="border-b hairline px-4 pb-3 pt-4">
        <div className="flex items-center gap-2">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">File Shelf</h2>
          <span className="rounded-full bg-fg/[0.07] px-1.5 text-[11px] font-semibold text-muted">{items.length}</span>
          <div className="flex-1" />
          <AnimatePresence mode="wait" initial={false}>
            {confirmClear ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="flex items-center gap-1"
              >
                <button className="btn h-7 px-2 text-[12px] text-muted hover:bg-fg/[0.06]" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
                <button
                  className="btn h-7 bg-danger px-2.5 text-[12px] text-white hover:brightness-110"
                  onClick={() => {
                    clearAll();
                    setConfirmClear(false);
                    toast({ tone: "info", title: "Shelf cleared" });
                  }}
                >
                  Clear all
                </button>
              </motion.div>
            ) : (
              <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-0.5">
                <button
                  className="icon-btn"
                  title="Remove finished & failed"
                  onClick={clearFinished}
                  disabled={!counts.ready && !counts.failed}
                >
                  <Sparkle size={15} />
                </button>
                <button className="icon-btn hover:!text-danger" title="Clear all" onClick={() => setConfirmClear(true)} disabled={!items.length}>
                  <Trash2 size={15} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Segmented filter */}
        <LayoutGroup id="shelf-filter">
          <div className="mt-3 grid grid-cols-4 rounded-[10px] bg-fg/[0.06] p-[3px] text-[12px] font-medium">
            {(["all", "active", "ready", "failed"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn("relative rounded-[8px] py-1 capitalize transition-colors", filter === f ? "text-fg" : "text-muted hover:text-fg")}
              >
                {filter === f && (
                  <motion.span
                    layoutId="seg"
                    className="absolute inset-0 rounded-[8px] bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)] dark:bg-elevated"
                    transition={{ type: "spring", stiffness: 500, damping: 36 }}
                  />
                )}
                <span className="relative">
                  {f}
                  {counts[f] > 0 && f !== "all" && <span className="ml-1 text-[10.5px] text-subtle">{counts[f]}</span>}
                </span>
              </button>
            ))}
          </div>
        </LayoutGroup>

        {items.length > 4 && (
          <label className="mt-2.5 flex items-center gap-2 rounded-[10px] bg-fg/[0.05] px-2.5 py-1.5 text-[13px]">
            <Search size={14} className="text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search files"
              className="w-full bg-transparent outline-none placeholder:text-subtle"
            />
          </label>
        )}
      </div>

      {/* List */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {visible.length ? (
          <motion.ul layout className="space-y-1.5">
            <AnimatePresence initial={false} mode="popLayout">
              {visible.map((it) => (
                <FileCard key={it.id} item={it} />
              ))}
            </AnimatePresence>
          </motion.ul>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex h-full min-h-[260px] flex-col items-center justify-center px-6 text-center"
          >
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-fg/[0.05]">
              <Inbox size={26} className="text-subtle" strokeWidth={1.6} />
            </div>
            <p className="text-[14px] font-semibold">{items.length ? "Nothing here" : "Your shelf is empty"}</p>
            <p className="mt-1 max-w-[220px] text-[12.5px] text-muted">
              {items.length
                ? "No files match this filter."
                : "Uploaded, queued and converted files appear here — and survive a page refresh."}
            </p>
          </motion.div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t hairline p-3">
        <div className="mb-2 flex items-center justify-between px-1 text-[11.5px] text-muted">
          <span>
            {counts.ready} ready · {formatBytes(items.reduce((n, i) => n + (i.output?.size ?? 0), 0))}
          </span>
          {saved > 0 && <span className="font-medium text-success">Saved {formatBytes(saved)}</span>}
        </div>
        <button className="btn-primary h-10 w-full text-[13.5px]" disabled={!counts.ready || zipping !== null} onClick={exportZip}>
          {zipping !== null ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Compressing… {zipping}%
            </>
          ) : (
            <>
              <Archive size={15} /> Download All as ZIP
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
