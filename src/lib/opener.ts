import { create } from "zustand";
import { detectKind, extOf, type FileKind } from "./formats";
import { uid } from "./utils";

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
  /** Force the text editor for any file ("Edit as text"). */
  asText: boolean;
  open: (blob: Blob, name: string, sourceId?: string) => void;
  setAsText: (v: boolean) => void;
  close: () => void;
}

export const useOpener = create<OpenerState>()((set) => ({
  file: null,
  asText: false,
  open: (blob, name, sourceId) =>
    set({
      file: { token: uid(), name, ext: extOf(name), kind: detectKind(name, blob.type), blob, sourceId },
      asText: false,
    }),
  setAsText: (asText) => set({ asText }),
  close: () => set({ file: null, asText: false }),
}));
