import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, X } from "lucide-react";
import { useStore } from "@/lib/store";
import { t } from "@/lib/motion";

/** Inverted HUD-style notifications, bottom centre, announced politely. */
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4"
      style={{ bottom: "max(24px, calc(env(safe-area-inset-bottom) + 12px))" }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout="position"
            role={toast.tone === "error" ? "alert" : "status"}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, transition: t.fast }}
            transition={t.base}
            className="pointer-events-auto flex min-h-11 max-w-[min(480px,100%)] items-center gap-3 rounded-full bg-fg py-2 pl-4 pr-2 text-bg shadow-modal"
          >
            {toast.tone === "error" ? (
              <X aria-hidden size={15} strokeWidth={2.5} className="shrink-0 text-danger" />
            ) : toast.tone === "success" ? (
              <Check aria-hidden size={15} strokeWidth={2.5} className="shrink-0" />
            ) : (
              <Info aria-hidden size={15} strokeWidth={2} className="shrink-0 opacity-70" />
            )}
            <p className="min-w-0 truncate text-footnote" title={toast.body ? `${toast.title} · ${toast.body}` : toast.title}>
              <span className="font-medium">{toast.title}</span>
              {toast.body && <span className="opacity-60"> · {toast.body}</span>}
            </p>
            {toast.action && (
              <button
                className="shrink-0 rounded-full bg-bg/15 px-3 py-1 text-footnote font-semibold transition-colors hover:bg-bg/25 focus-visible:outline-bg"
                onClick={() => {
                  toast.action!.run();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-50 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-bg"
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X aria-hidden size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
