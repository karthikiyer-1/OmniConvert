import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Cpu, Cloud, FolderOpen, Sparkles, UploadCloud, Wand2, X, ClipboardPaste } from "lucide-react";
import { isStageable, useStore } from "@/lib/store";
import { KIND_COLOR, KIND_LABEL, outputsFor, OutputFormat, FileKind } from "@/lib/formats";
import { cn, formatBytes } from "@/lib/utils";
import { FileIcon } from "./FileIcon";
import { FormatSelect } from "./FormatSelect";
import { StatusBadge } from "./StatusBadge";

export interface WorkspaceHandle {
  openPicker: () => void;
}

const spring = { type: "spring", stiffness: 380, damping: 30 } as const;

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

  // "Convert from" summary + the union of valid targets across the batch.
  const { fromLabel, fromKind, options, common } = useMemo(() => {
    const pending = staged;
    const exts = [...new Set(pending.map((i) => i.ext || "file"))];
    const kinds = [...new Set(pending.map((i) => i.kind))];
    const map = new Map<string, OutputFormat>();
    pending.forEach((i) => outputsFor(i.kind, i.ext).forEach((o) => map.has(o.ext) || map.set(o.ext, o)));
    const targets = [...new Set(pending.map((i) => i.target))];
    return {
      fromLabel: !pending.length ? "Auto-detect" : exts.length === 1 ? exts[0].toUpperCase() : `${exts.length} formats`,
      fromKind: (kinds.length === 1 ? kinds[0] : null) as FileKind | null,
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
    <section className="flex min-w-0 flex-col gap-4">
      <div className="px-1 pt-2">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.05 }}
          className="text-[28px] font-semibold leading-tight tracking-[-0.025em] sm:text-[34px]"
        >
          Convert anything.{" "}
          <span className="bg-gradient-to-r from-[#0A84FF] via-[#5E5CE6] to-[#BF5AF2] bg-clip-text text-transparent">
            Preview everything.
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.1 }}
          className="mt-1.5 max-w-xl text-[14.5px] text-muted"
        >
          Images, video, audio, documents, data and archives — 200+ format pairs. Files stay on your device.
        </motion.p>
      </div>

      {/* Dropzone */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, scale: drag ? 1.012 : 1 }}
        transition={spring}
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
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        className={cn(
          "glass group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[22px] px-6 py-12 text-center outline-none transition-colors focus-visible:ring-4 focus-visible:ring-accent/25 sm:py-16",
          drag && "!bg-accent/[0.07]",
        )}
      >
        {/* Animated dashed border */}
        <svg className={cn("pointer-events-none absolute inset-0 h-full w-full", drag && "ants")} aria-hidden>
          <rect
            x="7"
            y="7"
            rx="16"
            style={{ width: "calc(100% - 14px)", height: "calc(100% - 14px)", transition: "stroke .25s" }}
            fill="none"
            stroke={drag ? "rgb(var(--accent))" : "rgb(var(--line) / 0.22)"}
            strokeWidth={drag ? 2 : 1.5}
            strokeDasharray="8 8"
          />
        </svg>

        {/* Soft glow */}
        <div
          className={cn(
            "pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-r from-[#5AC8FA]/25 via-[#0A84FF]/20 to-[#BF5AF2]/25 blur-3xl transition-opacity duration-500",
            drag ? "opacity-100" : "opacity-50 group-hover:opacity-80",
          )}
        />

        <motion.div
          animate={drag ? { y: -6, scale: 1.08, rotate: 0 } : { y: 0, scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 15 }}
          className="relative mb-5"
        >
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-gradient-to-br from-[#5AC8FA] via-[#0A84FF] to-[#5E5CE6] shadow-[0_12px_32px_-8px_rgb(10_132_255/0.55)]">
            <UploadCloud size={34} className="text-white" strokeWidth={1.8} />
          </div>
          {/* Floating format bubbles */}
          {(["image", "video", "pdf", "audio"] as FileKind[]).map((k, i) => (
            <motion.div
              key={k}
              className="absolute"
              style={{ left: [-46, 84, -40, 80][i], top: [-10, -14, 46, 44][i] }}
              animate={drag ? { scale: 1.15, opacity: 1 } : { y: [0, -5, 0], opacity: 0.9 }}
              transition={drag ? spring : { duration: 3 + i * 0.4, repeat: Infinity, ease: "easeInOut", delay: i * 0.3 }}
            >
              <FileIcon kind={k} size={30} className="shadow-soft backdrop-blur" />
            </motion.div>
          ))}
        </motion.div>

        <p className="relative text-[17px] font-semibold tracking-[-0.01em]">
          {drag ? "Release to add files" : "Drop files here"}
        </p>
        <p className="relative mt-1 text-[13.5px] text-muted">
          or <span className="font-medium text-accent">browse your device</span> · multiple files supported
        </p>
        <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2 text-[11.5px] text-subtle">
          <span className="flex items-center gap-1.5">
            <ClipboardPaste size={12} /> Paste with <span className="kbd">⌘V</span>
          </span>
          <span className="opacity-40">•</span>
          <span className="flex items-center gap-1.5">
            <FolderOpen size={12} /> Open with <span className="kbd">⌘O</span>
          </span>
        </div>
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

      {/* Conversion bar */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.08 }}
        className="glass rounded-[18px] p-3 sm:p-4"
      >
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          <span className="text-[13px] font-medium text-muted">Convert from</span>
          <span
            className="inline-flex h-9 items-center gap-2 rounded-[9px] px-3 text-[13px] font-semibold"
            style={{
              background: fromKind ? `${KIND_COLOR[fromKind]}1f` : "rgb(var(--fg) / 0.06)",
              color: fromKind ? KIND_COLOR[fromKind] : undefined,
            }}
          >
            <Sparkles size={13} />
            {fromLabel}
            {fromKind && <span className="font-medium opacity-70">· {KIND_LABEL[fromKind]}</span>}
          </span>
          <ArrowRight size={16} className="text-subtle" />
          <span className="text-[13px] font-medium text-muted">to</span>
          <FormatSelect
            options={options}
            value={common}
            placeholder={staged.length ? "Mixed" : "Format"}
            disabled={!staged.length}
            onChange={(ext) => {
              const n = setTargetForPending(ext);
              if (n < staged.length)
                toast({
                  tone: "info",
                  title: `${ext.toUpperCase()} applied to ${n} of ${staged.length} files`,
                  body: "Other files don't support this format — pick their target individually.",
                });
            }}
          />
          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
            <motion.button
              whileTap={{ scale: 0.96 }}
              className="btn-primary h-10 w-full px-5 text-[14px] sm:w-auto"
              disabled={!startable.length}
              onClick={() => start()}
            >
              <Wand2 size={16} />
              Start Conversion
              {startable.length > 0 && (
                <span className="ml-0.5 rounded-full bg-white/25 px-1.5 text-[11.5px] font-semibold">{startable.length}</span>
              )}
            </motion.button>
          </div>
        </div>

        {/* Staged batch */}
        <AnimatePresence initial={false}>
          {staged.length > 0 ? (
            <motion.ul
              key="list"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="scroll-thin mt-3 max-h-[300px] space-y-1 overflow-y-auto border-t hairline pt-3"
            >
              <AnimatePresence initial={false}>
                {staged.map((it) => {
                  const opts = outputsFor(it.kind, it.ext);
                  const fmt = opts.find((o) => o.ext === it.target);
                  return (
                    <motion.li
                      key={it.id}
                      layout
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 12, height: 0, marginTop: 0 }}
                      transition={spring}
                      className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-fg/[0.04]"
                    >
                      <FileIcon kind={it.kind} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{it.name}</p>
                        <p className="text-[11.5px] text-muted">
                          {formatBytes(it.size)} · {KIND_LABEL[it.kind]}
                          {it.status === "uploading" && ` · ${it.progress}%`}
                        </p>
                      </div>
                      {it.status === "uploading" ? (
                        <StatusBadge status="uploading" />
                      ) : (
                        <span className="hidden items-center gap-1 text-[11px] text-subtle sm:flex" title={fmt?.real ? "Converted on-device" : "Simulated cloud stream"}>
                          {fmt?.real ? <Cpu size={11} className="text-success" /> : <Cloud size={11} className="text-violet" />}
                        </span>
                      )}
                      <ArrowRight size={13} className="shrink-0 text-subtle" />
                      <FormatSelect size="sm" options={opts} value={it.target} onChange={(ext) => setTarget(it.id, ext)} />
                      <button className="icon-btn h-7 w-7" onClick={() => remove(it.id)} aria-label={`Remove ${it.name}`}>
                        <X size={14} />
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </motion.ul>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-3 grid grid-cols-2 gap-2 border-t hairline pt-3 sm:grid-cols-4"
            >
              {(
                [
                  ["image", "PNG → WEBP · HEIC · JPG"],
                  ["video", "MP4 → GIF · WEBM · MP3"],
                  ["pdf", "PDF → DOCX · TXT"],
                  ["spreadsheet", "CSV → JSON · XLSX"],
                ] as [FileKind, string][]
              ).map(([k, hint]) => (
                <div key={k} className="flex items-center gap-2.5 rounded-xl bg-fg/[0.03] px-2.5 py-2">
                  <FileIcon kind={k} size={28} />
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold">{KIND_LABEL[k]}</p>
                    <p className="truncate text-[10.5px] text-muted">{hint}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        {items.some((i) => isStageable(i) && i.status !== "pending") && staged.length === 0 && (
          <p className="mt-3 text-center text-[11.5px] text-subtle">
            Tip: open any finished file in the shelf to re-convert it to another format.
          </p>
        )}
      </motion.div>
    </section>
  );
});
