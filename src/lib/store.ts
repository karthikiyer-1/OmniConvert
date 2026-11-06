import { create } from "zustand";
import { detectKind, extFromMime, extOf, FileKind, mimeFor, outputsFor } from "./formats";
import { clearBlobs, deleteBlob, getBlob, putBlob } from "./db";
import { convertReal } from "./converters";
import { fileStamp, replaceExt, sha256, sleep, uid } from "./utils";

export type Status = "uploading" | "pending" | "queued" | "converting" | "ready" | "failed";

export interface OutputInfo {
  name: string;
  ext: string;
  size: number;
  mime: string;
  simulated: boolean;
  note?: string;
  finishedAt: number;
  durationMs: number;
}

export interface FileItem {
  id: string;
  name: string;
  ext: string;
  size: number;
  mime: string;
  kind: FileKind;
  addedAt: number;
  lastModified: number;
  sha256?: string;
  width?: number;
  height?: number;
  duration?: number;
  status: Status;
  progress: number;
  stage?: string;
  target?: string;
  output?: OutputInfo;
  error?: string;
  /** Order in which the item entered the conversion queue. */
  seq?: number;
}

export type HistoryType = "added" | "converted" | "failed" | "removed" | "edited" | "cleared" | "signed-in" | "account-created" | "visited";

export interface HistoryEvent {
  id: string;
  at: number;
  type: HistoryType;
  name: string;
  detail?: string;
}

export interface Toast {
  id: string;
  title: string;
  body?: string;
  tone: "info" | "success" | "error";
  action?: { label: string; run: () => void };
}

interface State {
  items: FileItem[];
  history: HistoryEvent[];
  /** False until the active vault (guest or account) has been loaded. */
  hydrated: boolean;
  hydrate: (data: { items: FileItem[]; history: HistoryEvent[] }) => void;
  log: (type: HistoryType, name: string, detail?: string) => void;
  clearHistory: () => void;
  toasts: Toast[];
  previewId: string | null;
  addFiles: (files: File[]) => void;
  update: (id: string, patch: Partial<FileItem>) => void;
  setTarget: (id: string, ext: string) => void;
  setTargetForPending: (ext: string) => number;
  start: (ids?: string[]) => void;
  cancel: (id: string) => void;
  retry: (id: string) => void;
  remove: (id: string) => void;
  clearAll: () => void;
  clearFinished: () => void;
  openPreview: (id: string | null) => void;
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: string) => void;
}

export const origKey = (id: string) => `orig:${id}`;
export const outKey = (id: string) => `out:${id}`;

const MAX_CONCURRENT = 2;
let seqCounter = Date.now();
const controllers = new Map<string, AbortController>();

const HISTORY_LIMIT = 500;

export const useStore = create<State>()((set, get) => ({
      items: [],
      history: [],
      hydrated: false,
      toasts: [],
      previewId: null,

      hydrate: ({ items, history }) => {
        controllers.forEach((c) => c.abort());
        controllers.clear();
        set({ items: normalize(items), history, hydrated: true, previewId: null });
      },

      log: (type, name, detail) =>
        set((s) => ({ history: [{ id: uid(), at: Date.now(), type, name, detail }, ...s.history].slice(0, HISTORY_LIMIT) })),

      clearHistory: () => set({ history: [] }),

      addFiles: (files) => {
        if (!files.length) return;
        const fresh: FileItem[] = files.map((file) => {
          let name = file.name;
          if (!name || name === "image.png" || !extOf(name)) {
            const ext = extFromMime(file.type || "application/octet-stream");
            name = `${name ? name.replace(/\.[^.]+$/, "") : "Pasted"} ${fileStamp()}.${ext}`;
          }
          const ext = extOf(name);
          const kind = detectKind(name, file.type);
          return {
            id: uid(),
            name,
            ext,
            size: file.size,
            mime: file.type || mimeFor(ext),
            kind,
            addedAt: Date.now(),
            lastModified: file.lastModified || Date.now(),
            status: "uploading",
            progress: 0,
            target: defaultTarget(kind, ext),
          };
        });
        set((s) => ({ items: [...fresh, ...s.items] }));
        fresh.forEach((item, i) => ingest(item, files[i]));
        fresh.forEach((item) => get().log("added", item.name));
        get().toast({
          tone: "info",
          title: files.length === 1 ? `Added ${fresh[0].name}` : `Added ${files.length} files`,
        });
      },

      update: (id, patch) =>
        set((s) => ({ items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) })),

      setTarget: (id, ext) => get().update(id, { target: ext }),

      setTargetForPending: (ext) => {
        let n = 0;
        set((s) => ({
          items: s.items.map((it) => {
            if (!isStageable(it)) return it;
            if (!outputsFor(it.kind, it.ext).some((o) => o.ext === ext)) return it;
            n++;
            return { ...it, target: ext };
          }),
        }));
        return n;
      },

      start: (ids) => {
        const targets = get().items.filter(
          (it) => (ids ? ids.includes(it.id) : it.status === "pending") && it.target && it.status !== "uploading",
        );
        if (!targets.length) return;
        set((s) => ({
          items: s.items.map((it) =>
            targets.some((t) => t.id === it.id)
              ? { ...it, status: "queued", seq: ++seqCounter, progress: 0, stage: "Waiting for a worker…", error: undefined, output: undefined }
              : it,
          ),
        }));
        targets.forEach((t) => deleteBlob(outKey(t.id)));
        pump();
      },

      cancel: (id) => {
        controllers.get(id)?.abort();
        controllers.delete(id);
        get().update(id, { status: "pending", progress: 0, stage: undefined });
      },

      retry: (id) => get().start([id]),

      remove: (id) => {
        const index = get().items.findIndex((it) => it.id === id);
        const gone = get().items[index];
        if (!gone) return;
        controllers.get(id)?.abort();
        controllers.delete(id);
        set((s) => ({
          items: s.items.filter((it) => it.id !== id),
          previewId: s.previewId === id ? null : s.previewId,
        }));
        pump();
        const name = gone.output?.name ?? gone.name;
        get().log("removed", name);
        // Keep the bytes for a few seconds so the removal can be undone.
        const token = scheduleBlobDeletion([id]);
        get().toast({
          tone: "info",
          title: `Removed ${name}`,
          action: {
            label: "Undo",
            run: () => {
              if (!cancelBlobDeletion(token)) return;
              set((s) => {
                const items = [...s.items];
                items.splice(Math.min(index, items.length), 0, normalize([gone])[0]);
                // The removal never happened, so drop it from the history too.
                const i = s.history.findIndex((h) => h.type === "removed" && h.name === name);
                return { items, history: i < 0 ? s.history : s.history.filter((_, j) => j !== i) };
              });
            },
          },
        });
      },

      clearAll: () => {
        controllers.forEach((c) => c.abort());
        controllers.clear();
        const n = get().items.length;
        set({ items: [], previewId: null });
        clearBlobs();
        if (n) get().log("cleared", `${n} file${n > 1 ? "s" : ""}`);
      },

      clearFinished: () => {
        const before = get().items;
        const done = before.filter((it) => it.status === "ready" || it.status === "failed");
        if (!done.length) return;
        set((s) => ({ items: s.items.filter((it) => !done.includes(it)) }));
        const token = scheduleBlobDeletion(done.map((d) => d.id));
        get().toast({
          tone: "info",
          title: `Cleared ${done.length} finished file${done.length > 1 ? "s" : ""}`,
          action: {
            label: "Undo",
            run: () => {
              if (!cancelBlobDeletion(token)) return;
              // Put each file back at its original position.
              set((s) => {
                const items = [...s.items];
                done.forEach((d) => items.splice(Math.min(before.indexOf(d), items.length), 0, d));
                return { items };
              });
            },
          },
        });
      },

      openPreview: (id) => set({ previewId: id }),

      toast: (t) => {
        const id = uid();
        set((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
        setTimeout(() => get().dismissToast(id), t.action ? 7000 : t.tone === "error" ? 6000 : 3200);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/* ------------------------------------------------- deferred blob deletion */

const UNDO_MS = 7000;
const pendingDeletes = new Map<string, { timer: number; ids: string[] }>();

function deleteNow(ids: string[]) {
  ids.forEach((id) => {
    deleteBlob(origKey(id));
    deleteBlob(outKey(id));
  });
}

function scheduleBlobDeletion(ids: string[]): string {
  const token = uid();
  const timer = window.setTimeout(() => {
    pendingDeletes.delete(token);
    deleteNow(ids);
  }, UNDO_MS);
  pendingDeletes.set(token, { timer, ids });
  return token;
}

/** Returns false if the window already closed. */
function cancelBlobDeletion(token: string): boolean {
  const p = pendingDeletes.get(token);
  if (!p) return false;
  window.clearTimeout(p.timer);
  pendingDeletes.delete(token);
  return true;
}

/** Finish pending deletions now — call before switching vaults. */
export function commitPendingDeletions() {
  pendingDeletes.forEach((p) => {
    window.clearTimeout(p.timer);
    deleteNow(p.ids);
  });
  pendingDeletes.clear();
}

/** Work in flight when the page closed (or the account switched) can't resume mid-stream. */
function normalize(items: FileItem[]): FileItem[] {
  return items.map((it) => {
    if (it.status === "uploading") return { ...it, status: "failed", progress: 0, stage: undefined, error: "Adding was interrupted. Remove it and add the file again." };
    if (it.status === "queued" || it.status === "converting") return { ...it, status: "pending", progress: 0, stage: undefined, error: undefined };
    return it;
  });
}

function defaultTarget(kind: FileKind, ext: string) {
  const opts = outputsFor(kind, ext);
  return (opts.find((o) => o.real) ?? opts[0])?.ext;
}

export function isStageable(it: FileItem) {
  return it.status === "pending" || it.status === "failed" || it.status === "ready";
}

/* --------------------------------------------------------------- ingest */

async function ingest(item: FileItem, file: File) {
  const { update } = useStore.getState();
  const alive = () => useStore.getState().items.some((i) => i.id === item.id);
  try {
    // Real work (store + hash + probe) runs while the bar animates, so small
    // files still get a visible, satisfying upload.
    const work = Promise.all([putBlob(origKey(item.id), file), sha256(file), probe(item.kind, file)]);
    const total = Math.min(1600, 450 + file.size / 40000);
    const t0 = performance.now();
    let done = false;
    work.finally(() => (done = true));
    while (alive()) {
      const p = Math.min(1, (performance.now() - t0) / total);
      update(item.id, { progress: Math.round((done ? p : Math.min(p, 0.9)) * 100) });
      if (p >= 1 && done) break;
      await sleep(60);
    }
    const [, hash, meta] = await work;
    if (!alive()) return;
    update(item.id, { status: "pending", progress: 0, sha256: hash, ...meta });
  } catch (e) {
    update(item.id, { status: "failed", error: `Couldn’t read this file (${(e as Error).message}). Try adding it again.` });
  }
}

async function probe(kind: FileKind, file: Blob): Promise<Partial<FileItem>> {
  try {
    if (kind === "image") {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return { width: img.naturalWidth, height: img.naturalHeight };
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    if (kind === "video" || kind === "audio") {
      const url = URL.createObjectURL(file);
      try {
        const el = document.createElement(kind === "video" ? "video" : "audio");
        el.preload = "metadata";
        el.src = url;
        await new Promise<void>((res, rej) => {
          el.onloadedmetadata = () => res();
          el.onerror = () => rej();
          setTimeout(rej, 4000);
        });
        const v = el as HTMLVideoElement;
        return {
          duration: Number.isFinite(el.duration) ? el.duration : undefined,
          width: v.videoWidth || undefined,
          height: v.videoHeight || undefined,
        };
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  } catch {
    /* metadata is best-effort */
  }
  return {};
}

/* ------------------------------------------------------- conversion engine */

function pump() {
  const { items } = useStore.getState();
  const active = items.filter((i) => i.status === "converting").length;
  const waiting = items.filter((i) => i.status === "queued").sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  waiting.slice(0, Math.max(0, MAX_CONCURRENT - active)).forEach((it) => runJob(it.id));
}

class Cancelled extends Error {}

async function runJob(id: string) {
  const store = useStore.getState();
  const item = store.items.find((i) => i.id === id);
  if (!item || !item.target) return;
  const ctrl = new AbortController();
  controllers.set(id, ctrl);
  const update = (patch: Partial<FileItem>) => {
    if (ctrl.signal.aborted) throw new Cancelled();
    useStore.getState().update(id, patch);
  };
  const t0 = performance.now();
  const target = item.target;
  const fmt = outputsFor(item.kind, item.ext).find((o) => o.ext === target);

  // Animate `progress` from a→b over ms, checking for cancellation.
  const ramp = async (a: number, b: number, ms: number, stage: string, until?: () => boolean) => {
    const start = performance.now();
    for (;;) {
      const k = Math.min(1, (performance.now() - start) / ms);
      const eased = 1 - Math.pow(1 - k, 2.2);
      update({ progress: Math.round(a + (b - a) * eased), stage });
      if (k >= 1 && (!until || until())) return;
      if (k >= 1) await sleep(120);
      else await sleep(50 + Math.random() * 70);
    }
  };

  try {
    update({ status: "converting", progress: 0, stage: "Connecting to engine…" });
    const source = await getBlob(origKey(id));
    if (!source) throw new Error("The original file is missing. Add it again from your device.");

    // Simulated streams scale with size; real ones finish when the work does.
    const workMs = Math.min(9000, 1400 + item.size / 900_000);
    await ramp(0, 12, 380, `Uploading ${item.ext.toUpperCase() || "file"} to worker…`);
    await ramp(12, 26, 420, "Analyzing streams & metadata…");

    let output: Blob | undefined;
    let simulated = !fmt?.real;
    let note: string | undefined;

    if (fmt?.real) {
      let finished = false;
      let failure: unknown;
      const job = convertReal({ blob: source, name: item.name, ext: item.ext, kind: item.kind, target })
        .then((b) => (output = b))
        .catch((e) => (failure = e))
        .finally(() => (finished = true));
      await ramp(26, 88, Math.min(workMs, 2600), `Encoding ${target.toUpperCase()}…`, () => finished);
      await job;
      if (failure) {
        // JSON/CSV parse errors are user-data problems: fail loudly.
        if (failure instanceof SyntaxError) throw new Error(`The file isn’t valid (${failure.message}). Fix it in the Open tab, then convert again.`);
        simulated = true;
        note = `Native encoder unavailable (${(failure as Error).message}). Used the cloud fallback stream.`;
        update({ stage: "Falling back to cloud worker…" });
        await sleep(700);
      }
    }

    if (simulated) {
      let hiccups = 0;
      const chunks = 4;
      for (let c = 0; c < chunks; c++) {
        const from = 26 + ((88 - 26) * c) / chunks;
        const to = 26 + ((88 - 26) * (c + 1)) / chunks;
        await ramp(from, to, workMs / chunks, `Transcoding to ${target.toUpperCase()} · segment ${c + 1}/${chunks}`);
        if (Math.random() < (hiccups ? 0.25 : 0.1)) {
          hiccups++;
          if (hiccups > 3) throw new Error("The conversion service timed out after 3 attempts. Try again in a moment.");
          update({ stage: `Stream interrupted — retrying (${hiccups}/3)…` });
          await sleep(900 + hiccups * 400);
          c--; // replay the segment
        }
      }
      // Demo output: the source bytes re-labelled with the target type.
      output = new Blob([source], { type: mimeFor(target) });
      note = note ?? "Simulated conversion — the output contains the original bytes.";
    }

    await ramp(88, 97, 420, "Optimizing output…");
    await ramp(97, 100, 220, "Finalizing…");
    await putBlob(outKey(id), output!);

    const durationMs = Math.round(performance.now() - t0);
    useStore.getState().log("converted", item.name, `${item.ext.toUpperCase()} → ${target.toUpperCase()}${simulated ? " (simulated)" : ""}`);
    update({
      status: "ready",
      progress: 100,
      stage: undefined,
      output: {
        name: replaceExt(item.name, target === "gz" ? "tar.gz" : target),
        ext: target,
        size: output!.size,
        mime: output!.type || mimeFor(target),
        simulated,
        note,
        finishedAt: Date.now(),
        durationMs,
      },
    });
  } catch (e) {
    if (e instanceof Cancelled || ctrl.signal.aborted) return;
    useStore.getState().update(id, { status: "failed", stage: undefined, error: (e as Error).message });
    useStore.getState().log("failed", item.name, (e as Error).message);
    useStore.getState().toast({
      tone: "error",
      title: `Couldn’t convert ${item.name}`,
      body: (e as Error).message,
      action: { label: "Retry", run: () => useStore.getState().retry(id) },
    });
  } finally {
    controllers.delete(id);
    const s = useStore.getState();
    pump();
    const busy = s.items.some((i) => i.status === "queued" || i.status === "converting");
    if (!busy && !ctrl.signal.aborted) {
      const ready = s.items.filter((i) => i.status === "ready" && i.output && i.output.finishedAt > Date.now() - 60_000);
      if (ready.length) s.toast({ tone: "success", title: "Conversion complete", body: `${ready.length} file${ready.length > 1 ? "s" : ""} ready to download` });
    }
  }
}
