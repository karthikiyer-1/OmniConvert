import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useConfirm } from "@/lib/confirm";
import { useFocusTrap } from "@/lib/hooks";
import { t } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function ConfirmDialog() {
  const request = useConfirm((s) => s.request);
  const settle = useConfirm((s) => s.settle);
  const panel = useRef<HTMLDivElement>(null);
  useFocusTrap(panel, !!request);

  return (
    <AnimatePresence>
      {request && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center overscroll-contain bg-black/30 p-6 backdrop-blur-[20px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, pointerEvents: "none", transition: t.fast }}
          transition={t.base}
          onClick={() => settle(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              settle(false);
            }
          }}
        >
          <motion.div
            ref={panel}
            role="alertdialog"
            aria-modal
            aria-labelledby="confirm-title"
            aria-describedby={request.message ? "confirm-message" : undefined}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: t.fast }}
            transition={t.base}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] rounded-[24px] bg-elevated p-6 text-center shadow-modal"
          >
            <h2 id="confirm-title" className="text-balance font-display text-callout font-semibold">
              {request.title}
            </h2>
            {request.message && (
              <p id="confirm-message" className="mt-2 text-pretty text-footnote text-muted">
                {request.message}
              </p>
            )}
            <div className="mt-6 flex gap-2">
              <button className="btn-secondary h-11 flex-1" onClick={() => settle(false)} data-autofocus>
                {request.cancelLabel ?? "Cancel"}
              </button>
              <button
                className={cn(
                  "btn h-11 flex-1 px-4 text-body",
                  request.destructive ? "bg-danger text-white hover:bg-danger/85" : "bg-fg text-bg hover:bg-fg/85",
                )}
                onClick={() => settle(true)}
              >
                {request.confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
