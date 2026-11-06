import { getBlob } from "./db";
import { FileItem, outKey } from "./store";
import { downloadBlob } from "./utils";

/** Bundle every converted output into one ZIP, de-duplicating names. */
export async function downloadAllAsZip(items: FileItem[], onProgress?: (pct: number) => void) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const used = new Map<string, number>();
  let added = 0;
  for (const it of items) {
    if (it.status !== "ready" || !it.output) continue;
    const blob = await getBlob(outKey(it.id));
    if (!blob) continue;
    let name = it.output.name;
    const n = used.get(name) ?? 0;
    used.set(name, n + 1);
    if (n) name = name.replace(/(\.[^.]+)$/, ` (${n})$1`);
    zip.file(name, blob, { date: new Date(it.output.finishedAt) });
    added++;
  }
  if (!added) throw new Error("Nothing’s been converted yet. Convert a file first.");
  const out = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, (m) =>
    onProgress?.(m.percent),
  );
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  downloadBlob(out, `OmniConvert-${stamp}.zip`);
  return added;
}
