import { getBlob } from "./db";
import { FileItem, outKey } from "./store";
import { downloadBlob, sleep } from "./utils";

/**
 * Save every converted file as its own download (no ZIP).
 * Downloads are spaced out slightly so browsers don't drop any; the first
 * time, the browser may ask to allow multiple downloads from this site.
 */
export async function downloadAllSeparately(items: FileItem[], onProgress?: (done: number, total: number) => void) {
  const ready = items.filter((it) => it.status === "ready" && it.output);
  if (!ready.length) throw new Error("Nothing’s been converted yet. Convert a file first.");
  const used = new Map<string, number>();
  let saved = 0;
  for (const [i, it] of ready.entries()) {
    const blob = await getBlob(outKey(it.id));
    if (blob) {
      // Same name twice? Add " (1)", " (2)"… so nothing overwrites.
      let name = it.output!.name;
      const n = used.get(name) ?? 0;
      used.set(name, n + 1);
      if (n) name = name.replace(/(\.[^.]+)?$/, ` (${n})$1`);
      downloadBlob(blob, name);
      saved++;
    }
    onProgress?.(i + 1, ready.length);
    if (i < ready.length - 1) await sleep(350);
  }
  if (!saved) throw new Error("The converted files are no longer stored. Convert them again.");
  return saved;
}
