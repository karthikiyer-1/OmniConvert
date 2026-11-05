import { useStore } from "@/lib/store";
import { downloadBlob } from "@/lib/utils";

export function editedName(name: string, ext?: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/ \(edited\)$/, "");
  const e = ext ?? name.split(".").pop() ?? "bin";
  return `${base} (edited).${e}`;
}

/** Add an edited copy to the Files list (and the account history). */
export function saveToFiles(blob: Blob, name: string, detail?: string) {
  const s = useStore.getState();
  s.addFiles([new File([blob], name, { type: blob.type, lastModified: Date.now() })]);
  s.log("edited", name, detail);
}

export function download(blob: Blob, name: string) {
  downloadBlob(blob, name);
}
