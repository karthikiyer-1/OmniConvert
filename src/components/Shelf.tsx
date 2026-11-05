import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";
import { useStore, type FileItem } from "@/lib/store";
import { downloadAllAsZip } from "@/lib/exportZip";
import { formatBytes } from "@/lib/utils";
import { t } from "@/lib/motion";
import { FileCard } from "./FileCard";

const FILTERS = ["all", "active", "ready", "failed"] as const;
type Filter = (typeof FILTERS)[number];
const LABEL: Record<Filter, string> = { all: "All", active: "Active", ready: "Ready", failed: "Failed" };
const ACTIVE = ["uploading", "pending", "queued", "converting"];

const matches = (f: Filter, i: FileItem) =>
  f === "all" ? true : f === "active" ? ACTIVE.includes(i.status) : i.status === f;

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
    () => Object.fromEntries(FILTERS.map((f) => [f, items.filter((i) => matches(f, i)).length])) as Record<Filter, number>,
    [items],
  );
  const visible = items.filter((i) => matches(filter, i) && (!q || i.name.toLowerCase().includes(q.toLowerCase())));
  const readyBytes = items.reduce((n, i) => n + (i.output?.size ?? 0), 0);

  const exportZip = async () => {
    setZipping(0);
    try {
      const n = await downloadAllAsZip(items, (p) => setZipping(Math.round(p)));
      toast({ tone: "success", title: `Downloaded ${n} file${n > 1 ? "s" : ""}` });
    } catch (e) {
      toast({ tone: "error", title: "Export failed", body: (e as Error).message });
    } finally {
      setZipping(null);
    }
  };

  return (
    <motion.aside
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...t.slow, delay: 0.15 }}
      className="surface flex max-h-[calc(100dvh-104px)] min-h-[480px] flex-col overflow-hidden lg:sticky lg:top-[76px]"
    >
      {/* Header */}
      <div className="px-6 pb-4 pt-6">
        <div className="flex items-baseline gap-2">
          <h2 className="font-display text-title font-semibold">Files</h2>
          {items.length > 0 && <span className="text-body text-subtle">{items.length}</span>}
          <div className="ml-auto flex items-center">
            {confirmClear ? (
              <>
                <button className="btn-text text-muted" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
                <button
                  className="btn-text text-danger hover:bg-danger/[0.06]"
                  onClick={() => {
                    clearAll();
                    setConfirmClear(false);
                  }}
                >
                  Remove all
                </button>
              </>
            ) : (
              <>
                {(counts.ready > 0 || counts.failed > 0) && (
                  <button className="btn-text" onClick={clearFinished}>
                    Clear finished
                  </button>
                )}
                {items.length > 0 && (
                  <button className="btn-text text-muted hover:text-fg" onClick={() => setConfirmClear(true)}>
                    Clear
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {items.length > 0 && (
          <div className="segmented mt-4 grid-cols-4" role="group" aria-label="Filter files">
            <span
              className="segmented-thumb"
              style={{ left: 2, width: "calc((100% - 4px) / 4)", transform: `translateX(${FILTERS.indexOf(filter) * 100}%)` }}
            />
            {FILTERS.map((f) => (
              <button key={f} className="segmented-item" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {LABEL[f]}
              </button>
            ))}
          </div>
        )}

        {items.length > 5 && (
          <label className="mt-3 flex h-9 items-center gap-2 rounded-[10px] bg-fg/[0.05] px-3 text-body">
            <Search size={15} strokeWidth={1.75} className="text-subtle" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="w-full bg-transparent outline-none placeholder:text-subtle"
            />
          </label>
        )}
      </div>

      {/* List */}
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {visible.length ? (
          <ul>
            <AnimatePresence initial={false} mode="popLayout">
              {visible.map((it) => (
                <FileCard key={it.id} item={it} />
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={t.base}
            className="flex h-full min-h-[280px] flex-col items-center justify-center px-8 text-center"
          >
            <p className="text-callout font-medium">{items.length ? `No ${LABEL[filter].toLowerCase()} files` : "No files yet"}</p>
            <p className="mt-2 max-w-[240px] text-footnote text-muted">
              {items.length
                ? "Try another filter."
                : "Files you add appear here, and stay after you refresh the page."}
            </p>
          </motion.div>
        )}
      </div>

      {/* Footer */}
      {counts.ready > 0 && (
        <div className="px-6 pb-6 pt-3">
          <button className="btn-primary w-full" disabled={zipping !== null} onClick={exportZip}>
            {zipping !== null ? `Compressing… ${zipping}%` : "Download All as ZIP"}
          </button>
          <p className="mt-3 text-center text-caption text-subtle">
            {counts.ready} converted · {formatBytes(readyBytes)}
          </p>
        </div>
      )}
    </motion.aside>
  );
}
