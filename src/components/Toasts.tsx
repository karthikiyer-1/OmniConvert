import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useStore } from "@/lib/store";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[60] flex flex-col items-center gap-2 px-4 sm:left-auto sm:right-4 sm:items-end">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = t.tone === "success" ? CheckCircle2 : t.tone === "error" ? XCircle : Info;
          const color = t.tone === "success" ? "text-success" : t.tone === "error" ? "text-danger" : "text-accent";
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -16, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.95, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl px-4 py-3 shadow-float"
            >
              <Icon size={18} className={`mt-0.5 shrink-0 ${color}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[12px] text-muted">{t.body}</p>}
              </div>
              <button className="icon-btn -mr-2 -mt-1 h-7 w-7" onClick={() => dismiss(t.id)} aria-label="Dismiss">
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
