/**
 * Saves the file list + history for whichever vault is active.
 *  - Guest: plain JSON in localStorage (same key/format as earlier versions).
 *  - Account: AES-GCM sealed JSON in IndexedDB, under the account's prefix.
 */
import { getVault, idbGet, idbPut, type Vault } from "./db";
import { isSealed, openJSON, sealJSON } from "./crypto";
import { useStore, type FileItem, type HistoryEvent } from "./store";

const GUEST_KEY = "omniconvert-history";

interface Snapshot {
  items: FileItem[];
  history: HistoryEvent[];
}

const empty = (): Snapshot => ({ items: [], history: [] });

export async function loadVault(v: Vault = getVault()): Promise<Snapshot> {
  try {
    if (!v.key) {
      const raw = localStorage.getItem(GUEST_KEY);
      if (!raw) return empty();
      const parsed = JSON.parse(raw);
      return { items: parsed?.state?.items ?? [], history: parsed?.state?.history ?? [] };
    }
    const sealed = await idbGet<unknown>("blobs", v.prefix + "meta");
    if (!sealed || !isSealed(sealed)) return empty();
    const data = await openJSON<Snapshot>(v.key, sealed);
    return { items: data.items ?? [], history: data.history ?? [] };
  } catch {
    return empty();
  }
}

async function write(v: Vault, snap: Snapshot) {
  // Never persist transient UI fields.
  const items = snap.items.map((i) => ({ ...i, stage: undefined }));
  if (!v.key) {
    try {
      localStorage.setItem(GUEST_KEY, JSON.stringify({ state: { items, history: snap.history }, version: 2 }));
    } catch {
      /* quota / private mode */
    }
    return;
  }
  await idbPut("blobs", v.prefix + "meta", await sealJSON(v.key, { items, history: snap.history }));
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
  return useStore.subscribe((s, prev) => {
    if (!s.hydrated) return;
    if (s.items === prev.items && s.history === prev.history) return;
    // Progress ticks change `items` many times a second; that's fine — debounced.
    pending = { vault: getVault(), snap: { items: s.items, history: s.history } };
    window.clearTimeout(timer);
    timer = window.setTimeout(flush, 400);
  });
}
