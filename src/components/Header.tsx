import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { HardDrive, Keyboard, Loader2, Moon, Sun } from "lucide-react";
import { useStore } from "@/lib/store";
import { formatBytes } from "@/lib/utils";
import { Logo } from "./Logo";

export function Header({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const items = useStore((s) => s.items);
  const converting = items.filter((i) => i.status === "converting").length;
  const queued = items.filter((i) => i.status === "queued").length;
  const uploading = items.filter((i) => i.status === "uploading").length;
  const busy = converting + queued + uploading > 0;
  const total = items.reduce((n, i) => n + i.size + (i.output?.size ?? 0), 0);
  const [quota, setQuota] = useState<number | null>(null);
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setQuota(e.quota ?? null)).catch(() => {});
  }, []);

  return (
    <header className="glass sticky top-0 z-40 border-x-0 border-t-0 !shadow-none">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-[15px] font-semibold tracking-[-0.01em]">
            Omni<span className="text-muted">Convert</span>
          </span>
        </div>

        <div className="flex-1" />

        {/* Live status badge */}
        <motion.div
          layout
          className="flex items-center gap-2 rounded-full border hairline bg-surface/60 py-1 pl-2 pr-3 text-[12px] font-medium"
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {busy ? (
              <motion.span
                key="busy"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-1.5 text-accent"
              >
                <Loader2 size={13} className="animate-spin" />
                {uploading > 0 && !converting
                  ? `Uploading ${uploading}`
                  : `Converting ${converting}${queued ? ` · ${queued} queued` : ""}`}
              </motion.span>
            ) : (
              <motion.span
                key="idle"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-center gap-1.5"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-40" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                <span className="text-muted">Engine ready</span>
              </motion.span>
            )}
          </AnimatePresence>
          <span className="hidden h-3 w-px bg-fg/15 sm:block" />
          <span className="hidden items-center gap-1 text-muted sm:flex" title="Stored locally in your browser">
            <HardDrive size={12} />
            {formatBytes(total)}
            {quota ? <span className="text-subtle"> / {formatBytes(quota, 0)}</span> : null}
          </span>
        </motion.div>

        <div className="relative hidden md:block">
          <button className="icon-btn" onClick={() => setShowKeys((v) => !v)} aria-label="Keyboard shortcuts">
            <Keyboard size={17} />
          </button>
          <AnimatePresence>
            {showKeys && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
                className="glass-strong absolute right-0 top-11 w-64 origin-top-right rounded-2xl p-3 text-[12.5px] shadow-float"
                onMouseLeave={() => setShowKeys(false)}
              >
                <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">Shortcuts</p>
                {[
                  ["Paste files", "⌘/Ctrl V"],
                  ["Open file picker", "⌘/Ctrl O"],
                  ["Start conversion", "⌘/Ctrl ↵"],
                  ["Close preview", "Esc"],
                  ["Previous / next file", "← →"],
                  ["Zoom in / out", "+ −"],
                  ["Play / pause", "Space"],
                ].map(([a, k]) => (
                  <div key={a} className="flex items-center justify-between rounded-lg px-1 py-1.5">
                    <span>{a}</span>
                    <span className="kbd">{k}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          className="icon-btn relative overflow-hidden"
          onClick={onToggleTheme}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
              animate={{ rotate: 0, scale: 1, opacity: 1 }}
              exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 26 }}
              className="flex"
            >
              {theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </header>
  );
}
