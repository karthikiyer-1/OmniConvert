import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  ask: (o: ConfirmOptions) => Promise<boolean>;
  settle: (ok: boolean) => void;
}

/** Promise-based confirmation dialog, rendered once by <ConfirmDialog />. */
export const useConfirm = create<ConfirmState>()((set, get) => ({
  request: null,
  ask: (o) =>
    new Promise<boolean>((resolve) => {
      get().request?.resolve(false);
      set({ request: { ...o, resolve } });
    }),
  settle: (ok) => {
    get().request?.resolve(ok);
    set({ request: null });
  },
}));

export const confirmAction = (o: ConfirmOptions) => useConfirm.getState().ask(o);
