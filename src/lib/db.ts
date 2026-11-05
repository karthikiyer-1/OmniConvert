/**
 * IndexedDB storage.
 *
 * - `blobs`: file contents. Guests write plain blobs (keys `orig:<id>`);
 *   signed-in users write AES-GCM sealed records under `u:<userId>:…`.
 * - `accounts`: on-device account records (salt + wrapped data key, no password).
 * - `sessions`: the "stay signed in" record — a non-extractable CryptoKey,
 *   which IndexedDB can store but script can never read the raw bytes of.
 */
import { isSealed, open, seal } from "./crypto";

const DB_NAME = "omniconvert";
export type StoreName = "blobs" | "accounts" | "sessions";

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of ["blobs", "accounts", "sessions"]) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function req<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const r = fn(d.transaction(store, mode).objectStore(store));
        r.onsuccess = () => resolve(r.result as T);
        r.onerror = () => reject(r.error);
      }),
  );
}

export const idbGet = <T,>(store: StoreName, key: string) => req<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbPut = (store: StoreName, key: string, value: unknown) => req<void>(store, "readwrite", (s) => s.put(value, key));
export const idbDelete = (store: StoreName, key: string) => req<void>(store, "readwrite", (s) => s.delete(key));
export const idbKeys = (store: StoreName) => req<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys());
export const idbValues = <T,>(store: StoreName) => req<T[]>(store, "readonly", (s) => s.getAll());

/* -------------------------------------------------------------- the vault */

export interface Vault {
  /** "" for guest; "u:<id>:" for an account. */
  prefix: string;
  /** Present only for signed-in accounts. */
  key: CryptoKey | null;
}

let vault: Vault = { prefix: "", key: null };
// Decrypted blobs for the current vault only; cleared on every switch.
const mem = new Map<string, Blob>();

export const getVault = () => vault;
export function setVault(v: Vault) {
  vault = v;
  mem.clear();
}

const inNamespace = (k: IDBValidKey, prefix: string) =>
  typeof k === "string" && (prefix ? k.startsWith(prefix) : !k.startsWith("u:"));

export async function putBlob(key: string, blob: Blob): Promise<void> {
  const v = vault;
  const full = v.prefix + key;
  mem.set(full, blob);
  try {
    const value = v.key ? await seal(v.key, await blob.arrayBuffer(), blob.type) : blob;
    await idbPut("blobs", full, value);
  } catch {
    /* IndexedDB unavailable (private mode): memory only */
  }
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const v = vault;
  const full = v.prefix + key;
  if (mem.has(full)) return mem.get(full);
  try {
    const raw = await idbGet<unknown>("blobs", full);
    if (!raw) return undefined;
    let blob: Blob;
    if (isSealed(raw)) {
      if (!v.key) return undefined;
      blob = new Blob([await open(v.key, raw)], { type: raw.type ?? "" });
    } else blob = raw as Blob;
    if (vault === v) mem.set(full, blob);
    return blob;
  } catch {
    return undefined;
  }
}

export async function deleteBlob(key: string): Promise<void> {
  const full = vault.prefix + key;
  mem.delete(full);
  try {
    await idbDelete("blobs", full);
  } catch {
    /* ignore */
  }
}

/** Delete every file in the current vault (keeps its metadata record). */
export async function clearBlobs(): Promise<void> {
  const { prefix } = vault;
  mem.clear();
  await deleteNamespace(prefix, [prefix + "meta"]);
}

export async function deleteNamespace(prefix: string, keep: string[] = []): Promise<void> {
  try {
    const keys = await idbKeys("blobs");
    await Promise.all(
      keys.filter((k) => inNamespace(k, prefix) && !keep.includes(k as string)).map((k) => idbDelete("blobs", k as string)),
    );
  } catch {
    /* ignore */
  }
}
