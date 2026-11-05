import { create } from "zustand";
import { detectKind, extOf, type FileKind } from "./formats";
import { uid } from "./utils";
import { confirmAction } from "./confirm";

export interface OpenFile {
  /** Changes every time a file is opened, so editors remount cleanly. */
  token: string;
  name: string;
  ext: string;
  kind: FileKind;
  blob: Blob;
  /** Set when opened from the Files list. */
  sourceId?: string;
}

interface OpenerState {
  file: OpenFile | null;
  /** True while the open file has unsaved edits. */
  dirty: boolean;
  setDirty: (v: boolean) => void;
  /** Force the text editor for any file ("Edit as text"). */
  asText: boolean;
  open: (blob: Blob, name: string, sourceId?: string) => Promise<boolean>;
  setAsText: (v: boolean) => void;
  close: () => Promise<boolean>;
}

const discardOk = () =>
  confirmAction({
    title: "Discard Your Changes?",
    message: "Your edits to this file haven’t been saved. Save to Files or download first to keep them.",
    confirmLabel: "Discard",
    destructive: true,
  });

export const useOpener = create<OpenerState>()((set, get) => ({
  file: null,
  dirty: false,
  asText: false,
  setDirty: (dirty) => {
    if (get().dirty !== dirty) set({ dirty });
  },
  open: async (blob, name, sourceId) => {
    if (get().dirty && !(await discardOk())) return false;
    set({
      file: { token: uid(), name, ext: extOf(name), kind: detectKind(name, blob.type), blob, sourceId },
      asText: false,
      dirty: false,
    });
    return true;
  },
  setAsText: (asText) => set({ asText }),
  close: async () => {
    if (get().dirty && !(await discardOk())) return false;
    set({ file: null, asText: false, dirty: false });
    return true;
  },
}));
