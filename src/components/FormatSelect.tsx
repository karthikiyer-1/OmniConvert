import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import type { OutputFormat } from "@/lib/formats";
import { cn } from "@/lib/utils";
import { t } from "@/lib/motion";

const MENU_W = 248;

/** Pill trigger + macOS-style menu, portalled so scroll containers never clip it. */
export function FormatSelect({
  options,
  value,
  onChange,
  placeholder = "Choose",
  size = "md",
  disabled,
}: {
  options: OutputFormat[];
  value?: string;
  onChange: (ext: string) => void;
  placeholder?: string;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, up: false });
  const current = options.find((o) => o.ext === value);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const h = Math.min(400, 52 + options.length * 40);
      const up = r.bottom + h + 16 > window.innerHeight && r.top > h;
      setPos({
        top: up ? r.top - h - 8 : r.bottom + 8,
        left: Math.max(16, Math.min(r.left, window.innerWidth - MENU_W - 16)),
        up,
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled || !options.length}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full bg-fg/[0.06] font-medium text-fg transition duration-200 ease-apple hover:bg-fg/[0.1] disabled:opacity-30",
          size === "sm" ? "h-8 pl-3 pr-2 text-footnote" : "h-10 pl-4 pr-3 text-body",
          open && "bg-fg/[0.1]",
        )}
      >
        {current ? current.label : <span className="text-muted">{placeholder}</span>}
        <ChevronDown size={size === "sm" ? 14 : 16} strokeWidth={2} className={cn("text-subtle transition-transform duration-400 ease-apple", open && "rotate-180")} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menu}
              role="listbox"
              initial={{ opacity: 0, y: pos.up ? 4 : -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: t.fast }}
              transition={t.base}
              style={{ top: pos.top, left: pos.left, width: MENU_W }}
              className="scroll-thin fixed z-[80] max-h-[400px] overflow-auto rounded-2xl bg-elevated p-1.5 shadow-popover"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="eyebrow px-3 pb-1.5 pt-2">Convert to</p>
              {options.map((o) => {
                const selected = o.ext === value;
                return (
                  <button
                    key={o.ext}
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(o.ext);
                      setOpen(false);
                    }}
                    className="group flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-left transition-colors duration-150 hover:bg-fg/[0.05]"
                  >
                    <span className="flex w-4 justify-center text-accent">{selected && <Check size={14} strokeWidth={2.5} />}</span>
                    <span className="text-body font-medium">{o.label}</span>
                    <span className="ml-auto truncate pl-2 text-caption text-subtle">{o.real ? o.hint ?? "" : "Simulated"}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
