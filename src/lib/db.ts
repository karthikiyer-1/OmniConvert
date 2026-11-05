/**
 * Tiny IndexedDB blob store. File *metadata* lives in localStorage (see
 * store.ts); the bytes live here because localStorage caps out at ~5 MB.
 */
const DB_NAME = "omniconvert";
const STORE = "blobs";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// In-memory fallback for private windows where IndexedDB is unavailable.
const mem = new Map<string, Blob>();

export async function putBlob(key: string, blob: Blob): Promise<void> {
  mem.set(key, blob);
  try {
    await tx("readwrite", (s) => s.put(blob, key));
  } catch {
    /* memory only */
  }
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  if (mem.has(key)) return mem.get(key);
  try {
    const b = await tx<Blob | undefined>("readonly", (s) => s.get(key));
    if (b) mem.set(key, b);
    return b;
  } catch {
    return undefined;
  }
}

export async function deleteBlob(key: string): Promise<void> {
  mem.delete(key);
  try {
    await tx("readwrite", (s) => s.delete(key));
  } catch {
    /* ignore */
  }
}

export async function clearBlobs(): Promise<void> {
  mem.clear();
  try {
    await tx("readwrite", (s) => s.clear());
  } catch {
    /* ignore */
  }
}
