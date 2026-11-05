import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Cloud, Cpu } from "lucide-react";
import type { OutputFormat } from "@/lib/formats";
import { cn } from "@/lib/utils";

export function FormatSelect({
  options,
  value,
  onChange,
  placeholder = "Choose…",
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
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, up: false });
  const current = options.find((o) => o.ext === value);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const w = 288;
      const h = Math.min(360, 64 + Math.ceil(options.length / 2) * 52);
      const up = r.bottom + h + 12 > window.innerHeight && r.top > h;
      setPos({
        top: up ? r.top - h - 6 : r.bottom + 6,
        left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)),
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
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
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
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-[9px] border hairline bg-surface/80 font-semibold text-fg shadow-[0_1px_1px_rgb(0_0_0/0.04)] transition hover:bg-surface active:scale-[0.97] disabled:opacity-40",
          size === "sm" ? "h-7 px-2 text-[11.5px]" : "h-9 px-3 text-[13px]",
          open && "ring-4 ring-accent/20",
        )}
      >
        {current ? current.label : <span className="text-muted">{placeholder}</span>}
        <ChevronDown size={size === "sm" ? 12 : 14} className={cn("text-muted transition-transform", open && "rotate-180")} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={pop}
              initial={{ opacity: 0, scale: 0.95, y: pos.up ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
              transition={{ type: "spring", stiffness: 520, damping: 34 }}
              style={{ top: pos.top, left: pos.left, transformOrigin: pos.up ? "bottom left" : "top left" }}
              className="glass-strong scroll-thin fixed z-[80] max-h-[360px] w-72 overflow-auto rounded-2xl p-1.5 shadow-float"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="px-2.5 pb-1.5 pt-1 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">
                Convert to
              </p>
              <div className="grid grid-cols-2 gap-1">
                {options.map((o) => (
                  <button
                    key={o.ext}
                    onClick={() => {
                      onChange(o.ext);
                      setOpen(false);
                    }}
                    className={cn(
                      "relative flex flex-col items-start rounded-xl px-2.5 py-2 text-left transition hover:bg-fg/[0.06]",
                      o.ext === value && "bg-accent/10 hover:bg-accent/15",
                    )}
                  >
                    <span className="flex w-full items-center gap-1 text-[13px] font-semibold">
                      {o.label}
                      {o.ext === value && <Check size={13} className="ml-auto text-accent" strokeWidth={3} />}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-muted">
                      {o.real ? (
                        <Cpu size={10} className="text-success" />
                      ) : (
                        <Cloud size={10} className="text-violet" />
                      )}
                      {o.hint ?? (o.real ? "On-device" : "Cloud")}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-3 border-t hairline px-2.5 pb-1 pt-2 text-[10.5px] text-subtle">
                <span className="flex items-center gap-1">
                  <Cpu size={10} className="text-success" /> On-device
                </span>
                <span className="flex items-center gap-1">
                  <Cloud size={10} className="text-violet" /> Cloud stream (simulated)
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
