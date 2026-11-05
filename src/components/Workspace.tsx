import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, ArrowUp, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { KIND_LABEL, outputsFor, OutputFormat } from "@/lib/formats";
import { cn, formatBytes } from "@/lib/utils";
import { rise, t } from "@/lib/motion";
import { FileIcon } from "./FileIcon";
import { FormatSelect } from "./FormatSelect";

export interface WorkspaceHandle {
  openPicker: () => void;
}

const CAPABILITIES: [string, string][] = [
  ["Images", "PNG, JPG, WEBP, HEIC, ICO"],
  ["Video", "MP4, WEBM, GIF, poster frames"],
  ["Audio", "WAV, MP3, FLAC, M4A"],
  ["Documents & data", "PDF, CSV, JSON, YAML, ZIP"],
];

export const Workspace = forwardRef<WorkspaceHandle>(function Workspace(_, ref) {
  const items = useStore((s) => s.items);
  const addFiles = useStore((s) => s.addFiles);
  const setTarget = useStore((s) => s.setTarget);
  const setTargetForPending = useStore((s) => s.setTargetForPending);
  const start = useStore((s) => s.start);
  const remove = useStore((s) => s.remove);
  const toast = useStore((s) => s.toast);
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const depth = useRef(0);

  useImperativeHandle(ref, () => ({ openPicker: () => inputRef.current?.click() }));

  const staged = items.filter((i) => i.status === "pending" || i.status === "uploading");
  const startable = staged.filter((i) => i.status === "pending" && i.target);

  // "From" summary plus the union of valid targets across the batch.
  const { from, options, common } = useMemo(() => {
    const exts = [...new Set(staged.map((i) => i.ext || "file"))];
    const map = new Map<string, OutputFormat>();
    staged.forEach((i) => outputsFor(i.kind, i.ext).forEach((o) => map.has(o.ext) || map.set(o.ext, o)));
    const targets = [...new Set(staged.map((i) => i.target))];
    return {
      from: !staged.length ? "Auto-detected" : exts.length === 1 ? exts[0].toUpperCase() : `${exts.length} formats`,
      options: [...map.values()],
      common: targets.length === 1 ? targets[0] : undefined,
    };
  }, [staged]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      depth.current = 0;
      setDrag(false);
      const files = [...e.dataTransfer.files];
      if (files.length) addFiles(files);
    },
    [addFiles],
  );

  return (
    <section className="flex min-w-0 flex-col gap-6">
      {/* Dropzone */}
      <motion.div
        {...rise}
        transition={{ ...t.slow, delay: 0.05 }}
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current++;
          setDrag(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setDrag(false);
        }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Add files"
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        className={cn(
          "surface group relative flex min-h-[360px] cursor-pointer flex-col items-center justify-center px-8 py-16 text-center outline-none transition-colors duration-400 ease-apple",
          drag && "!bg-accent/[0.04]",
        )}
      >
        {/* Drop target outline — only visible while dragging */}
        <div
          className={cn(
            "pointer-events-none absolute inset-4 rounded-[20px] border-[1.5px] border-dashed border-accent/50 transition-opacity duration-400 ease-apple",
            drag ? "opacity-100" : "opacity-0",
          )}
        />

        <div
          className={cn(
            "mb-8 flex h-16 w-16 items-center justify-center rounded-full transition-all duration-400 ease-apple",
            drag ? "-translate-y-1 bg-accent text-white" : "bg-fg/[0.05] text-fg group-hover:-translate-y-0.5",
          )}
        >
          <ArrowUp size={26} strokeWidth={1.75} />
        </div>

        <p className="font-display text-title font-semibold">{drag ? "Release to add" : "Drop files here"}</p>
        <p className="mt-2 text-callout text-muted">
          or <span className="text-accent transition-opacity group-hover:opacity-80">choose files</span> from your device
        </p>
        <p className="mt-10 flex items-center gap-2 text-footnote text-subtle">
          Paste with <span className="kbd">⌘ V</span>
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            if (files.length) addFiles(files);
            e.target.value = "";
          }}
        />
      </motion.div>

      {/* Conversion panel */}
      <motion.div {...rise} transition={{ ...t.slow, delay: 0.1 }} className="surface p-6 md:p-8">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div>
            <p className="text-footnote text-muted">From</p>
            <p className="mt-1 font-display text-lead font-semibold">{from}</p>
          </div>
          <ArrowRight size={20} strokeWidth={1.5} className="mb-1.5 text-subtle" />
          <div>
            <p className="mb-1 text-footnote text-muted">To</p>
            <FormatSelect
              options={options}
              value={common}
              placeholder={staged.length ? "Mixed" : "Format"}
              disabled={!staged.length}
              onChange={(ext) => {
                const n = setTargetForPending(ext);
                if (n < staged.length)
                  toast({ tone: "info", title: `${ext.toUpperCase()} set for ${n} of ${staged.length}`, body: "Others don't support it" });
              }}
            />
          </div>
          <div className="w-full sm:ml-auto sm:w-auto">
            <button className="btn-primary w-full sm:w-auto" disabled={!startable.length} onClick={() => start()}>
              Convert{startable.length > 1 ? ` ${startable.length} files` : ""}
            </button>
          </div>
        </div>

        <AnimatePresence initial={false} mode="wait">
          {staged.length > 0 ? (
            <motion.ul
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={t.base}
              className="scroll-thin -mx-3 mt-8 max-h-[336px] overflow-y-auto"
            >
              <AnimatePresence initial={false}>
                {staged.map((it) => {
                  const opts = outputsFor(it.kind, it.ext);
                  return (
                    <motion.li
                      key={it.id}
                      layout="position"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, height: 0, transition: t.fast }}
                      transition={t.base}
                      className="flex items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors duration-200 hover:bg-fg/[0.03]"
                    >
                      <FileIcon kind={it.kind} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-medium">{it.name}</p>
                        <p className="text-footnote text-muted">
                          {it.status === "uploading" ? `Adding… ${it.progress}%` : `${KIND_LABEL[it.kind]} · ${formatBytes(it.size)}`}
                        </p>
                      </div>
                      <FormatSelect size="sm" options={opts} value={it.target} onChange={(ext) => setTarget(it.id, ext)} />
                      <button className="icon-btn" onClick={() => remove(it.id)} aria-label={`Remove ${it.name}`}>
                        <X size={16} strokeWidth={1.75} />
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          ) : (
            <motion.dl
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={t.base}
              className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 md:grid-cols-4"
            >
              {CAPABILITIES.map(([title, formats]) => (
                <div key={title}>
                  <dt className="text-footnote font-semibold">{title}</dt>
                  <dd className="mt-1 text-footnote text-muted">{formats}</dd>
                </div>
              ))}
            </motion.dl>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
});
