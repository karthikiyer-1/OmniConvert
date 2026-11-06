/**
 * Saves the file list + history for whichever vault is active.
 *  - Guest: plain JSON in localStorage (same key/format as earlier versions).
 *  - Account: AES-GCM sealed JSON in IndexedDB, under the account's prefix.
 */
import { getVault, idbDelete, idbGet, idbKeys, idbPut, type Vault } from "./db";
import { isSealed, openJSON, sealJSON } from "./crypto";
import { useStore, type FileItem, type HistoryEvent } from "./store";
import { useBrowser } from "./browser";

const GUEST_KEY = "omniconvert-history";

type BrowserSnap = ReturnType<ReturnType<typeof useBrowser.getState>["snapshot"]>;

interface Snapshot {
  items: FileItem[];
  history: HistoryEvent[];
  /** Browse tabs + recent sites (encrypted along with everything else for accounts). */
  browser?: BrowserSnap;
}

const empty = (): Snapshot => ({ items: [], history: [] });

export async function loadVault(v: Vault = getVault()): Promise<Snapshot> {
  try {
    if (!v.key) {
      const raw = localStorage.getItem(GUEST_KEY);
      if (!raw) return empty();
      const parsed = JSON.parse(raw);
      return { items: parsed?.state?.items ?? [], history: parsed?.state?.history ?? [], browser: parsed?.state?.browser };
    }
    const sealed = await idbGet<unknown>("blobs", v.prefix + "meta");
    if (!sealed || !isSealed(sealed)) return empty();
    const data = await openJSON<Snapshot>(v.key, sealed);
    return { items: data.items ?? [], history: data.history ?? [], browser: data.browser };
  } catch {
    return empty();
  }
}

async function write(v: Vault, snap: Snapshot) {
  // Never persist transient UI fields.
  const items = snap.items.map((i) => ({ ...i, stage: undefined }));
  if (!v.key) {
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify({ state: { items, history: snap.history, browser: snap.browser }, version: 3 }));
    } catch {
      /* quota / private mode */
    }
    return;
  }
  await idbPut("blobs", v.prefix + "meta", await sealJSON(v.key, { items, history: snap.history, browser: snap.browser }));
}

let timer: number | undefined;
let pending: { vault: Vault; snap: Snapshot } | null = null;

/** Write any queued save immediately (call before switching vaults). */
export async function flush() {
  window.clearTimeout(timer);
  const p = pending;
  pending = null;
  if (p) await write(p.vault, p.snap);
}

/** Debounced auto-save, bound to the vault that was active when the change happened. */
export function startAutosave() {
  const schedule = () => {
    const s = useStore.getState();
    if (!s.hydrated) return;
    // Progress ticks change `items` many times a second; that's fine — debounced.
    pending = { vault: getVault(), snap: { items: s.items, history: s.history, browser: useBrowser.getState().snapshot() } };
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 400);
  };
  const a = useStore.subscribe((s, prev) => {
    if (s.items !== prev.items || s.history !== prev.history) schedule();
  });
  const b = useBrowser.subscribe((s, prev) => {
    // Only persist meaningful changes (not loading flags).
    const key = (x: typeof s) => JSON.stringify([x.activeId, x.recent, x.tabs.map((t) => [t.id, t.index, t.history, t.title])]);
    if (key(s) !== key(prev)) schedule();
  });
  return () => {
    a();
    b();
  };
}

/**
 * Delete stored files no longer referenced by the file list (e.g. the page
 * closed during an undo window). Runs in the background after loading.
 */
export async function sweepOrphans(items: FileItem[], v: Vault = getVault()) {
  try {
    const live = new Set(items.map((i) => i.id));
    const keys = (await idbKeys("blobs")).filter((k): k is string => typeof k === "string");
    const mine = keys.filter((k) => (v.prefix ? k.startsWith(v.prefix) : !k.startsWith("u:")));
    await Promise.all(
      mine
        .map((k) => [k, /(?:orig|out):(.+)$/.exec(k.slice(v.prefix.length))?.[1]] as const)
        .filter(([, id]) => id && !live.has(id))
        .map(([k]) => idbDelete("blobs", k)),
    );
  } catch {
    /* best effort */
  }
}
