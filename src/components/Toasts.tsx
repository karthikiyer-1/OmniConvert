import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { t } from "@/lib/motion";

/** Inverted HUD-style notifications, bottom centre. */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout="position"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: t.fast }}
            transition={t.base}
            className="pointer-events-auto flex max-w-md items-center gap-3 rounded-full bg-fg py-2.5 pl-4 pr-2 text-bg shadow-modal"
          >
            {toast.tone === "error" ? (
              <X size={15} strokeWidth={2.5} className="shrink-0 text-danger" />
            ) : toast.tone === "success" ? (
              <Check size={15} strokeWidth={2.5} className="shrink-0" />
            ) : (
              <Info size={15} strokeWidth={2} className="shrink-0 opacity-70" />
            )}
            <p className="min-w-0 truncate text-footnote">
              <span className="font-medium">{toast.title}</span>
              {toast.body && <span className="opacity-60"> · {toast.body}</span>}
            </p>
            <button
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-50 transition-opacity hover:opacity-100"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
