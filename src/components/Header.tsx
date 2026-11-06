import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Command, Moon, Sun } from "lucide-react";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { hrefFor, useRoute, type Route } from "@/lib/router";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";
import { t } from "@/lib/motion";
import { Logo } from "./Logo";

const SHORTCUTS: [string, string][] = [
  ["Paste files", "⌘\u00A0V"],
  ["Choose files", "⌘\u00A0O"],
  ["Convert", "⌘\u00A0↵"],
  ["Close preview", "Esc"],
  ["Previous / next", "←\u00A0→"],
  ["Zoom", "+\u00A0−"],
  ["Play / pause", "Space"],
];

const NAV: [Route, string][] = [
  ["convert", "Convert"],
  ["open", "Open"],
  ["browse", "Browse"],
];

export function Header({ theme, onToggleTheme }: { theme: "light" | "dark"; onToggleTheme: () => void }) {
  const route = useRoute();
  const user = useAuth((s) => s.user);
  const authStatus = useAuth((s) => s.status);
  const items = useStore((s) => s.items);
  const converting = items.filter((i) => i.status === "converting").length;
  const queued = items.filter((i) => i.status === "queued").length;
  const uploading = items.filter((i) => i.status === "uploading").length;
  const total = items.reduce((n, i) => n + i.size + (i.output?.size ?? 0), 0);
  const [showKeys, setShowKeys] = useState(false);
  const keysRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showKeys) return;
    const close = (e: MouseEvent) => !keysRef.current?.contains(e.target as Node) && setShowKeys(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setShowKeys(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [showKeys]);

  const status = converting
    ? `Converting ${converting}${queued ? ` · ${queued} waiting` : ""}`
    : uploading
      ? `Adding ${uploading} file${uploading > 1 ? "s" : ""}…`
      : items.length
        ? `${items.length} file${items.length > 1 ? "s" : ""} · ${formatBytes(total)}`
        : "Ready";
  const busy = converting + uploading > 0;

  return (
    <header
      className="material sticky top-0 z-40"
      style={{ boxShadow: "0 1px 0 var(--hairline)", paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="safe-x mx-auto flex h-[52px] max-w-[1200px] items-center gap-2 max-sm:!px-4 sm:gap-4 md:!px-10">
        <a href="#/" className="flex items-center gap-2.5 rounded-lg" aria-label="OmniConvert home" translate="no">
          <Logo size={22} />
          <span className="font-display text-[17px] font-semibold tracking-[-0.02em] max-sm:hidden">OmniConvert</span>
        </a>

        <nav className="flex items-center gap-0.5 sm:ml-2 sm:gap-1 md:ml-6" aria-label="Sections">
          {NAV.map(([r, label]) => (
            <a
              key={r}
              href={hrefFor(r)}
              aria-current={route === r ? "page" : undefined}
              className={cn(
                "rounded-full px-2.5 py-1.5 text-footnote transition-colors duration-200 sm:px-3",
                route === r ? "bg-fg/[0.06] font-medium text-fg" : "text-muted hover:bg-fg/[0.04] hover:text-fg",
              )}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="flex-1" />

        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={status}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t.fast}
            className="hidden items-center gap-2 text-footnote tabular-nums text-muted sm:flex"
            role="status"
            aria-live="polite"
          >
            {busy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
            {status}
          </motion.span>
        </AnimatePresence>

        <div ref={keysRef} className="relative hidden md:block">
          <button className="icon-btn" onClick={() => setShowKeys((v) => !v)} aria-label="Keyboard shortcuts" aria-expanded={showKeys}>
            <Command aria-hidden size={16} strokeWidth={1.75} />
          </button>
          <AnimatePresence>
            {showKeys && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4, transition: t.fast }}
                transition={t.base}
                className="absolute right-0 top-12 w-64 origin-top-right rounded-2xl bg-elevated p-2 shadow-popover"
                role="dialog"
                aria-label="Keyboard shortcuts"
              >
                <p className="eyebrow px-3 pb-1 pt-2">Keyboard</p>
                {SHORTCUTS.map(([label, key]) => (
                  <div key={label} className="flex items-center justify-between px-3 py-2 text-footnote">
                    <span>{label}</span>
                    <span className="kbd">{key}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button className="icon-btn" onClick={onToggleTheme} aria-label={`Use ${theme === "dark" ? "light" : "dark"} appearance`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ opacity: 0, rotate: -30 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 30 }}
              transition={t.fast}
              className="flex"
            >
              {theme === "dark" ? <Moon aria-hidden size={16} strokeWidth={1.75} /> : <Sun aria-hidden size={16} strokeWidth={1.75} />}
            </motion.span>
          </AnimatePresence>
        </button>

        {authStatus !== "loading" &&
          (user ? (
            <a
              href={hrefFor("account")}
              aria-label={`Account: ${user.name}`}
              title={user.email}
              className={cn(
                "-mr-1 flex h-8 w-8 items-center justify-center rounded-full bg-fg text-[13px] font-semibold text-bg transition duration-200 ease-apple hover:bg-fg/85 active:scale-95",
                route === "account" && "ring-2 ring-accent ring-offset-2 ring-offset-bg",
              )}
            >
              {user.name.slice(0, 1).toUpperCase()}
            </a>
          ) : (
            <a className="btn-secondary -mr-1 h-8 shrink-0 px-3 sm:px-3.5" href={hrefFor("account")}>
              Sign In
            </a>
          ))}
      </div>
    </header>
  );
}
