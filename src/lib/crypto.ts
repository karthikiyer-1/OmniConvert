/**
 * WebCrypto helpers for on-device accounts.
 *
 * Model: each account has a random 256-bit AES-GCM *data key* that encrypts
 * its files and history. The data key is stored only in wrapped (encrypted)
 * form, under a key derived from the password with PBKDF2-SHA-256. The
 * password itself is never stored; a wrong password fails AES-GCM's
 * authentication check when unwrapping.
 */

const subtle = () => {
  if (!globalThis.crypto?.subtle) throw new Error("This browser can’t encrypt data here. Open OmniConvert over HTTPS in an up-to-date browser.");
  return globalThis.crypto.subtle;
};

const enc = new TextEncoder();
const dec = new TextDecoder();

/** OWASP 2023 recommendation for PBKDF2-HMAC-SHA256. */
export const PBKDF2_ITERATIONS = 600_000;

export const randomBytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** Key-encryption key from a password. Non-extractable; can only wrap/unwrap. */
export async function deriveKek(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

export function newDataKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]) as Promise<CryptoKey>;
}

export async function wrapDataKey(dataKey: CryptoKey, kek: CryptoKey) {
  const iv = randomBytes(12);
  const wrapped = await subtle().wrapKey("raw", dataKey, kek, { name: "AES-GCM", iv });
  return { wrapped: toB64(wrapped), iv: toB64(iv) };
}

/** Throws if the password (and so the KEK) is wrong. */
export function unwrapDataKey(wrapped: string, iv: string, kek: CryptoKey, extractable = false): Promise<CryptoKey> {
  return subtle().unwrapKey(
    "raw",
    fromB64(wrapped),
    kek,
    { name: "AES-GCM", iv: fromB64(iv) },
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"],
  );
}

export interface Sealed {
  v: 1;
  iv: Uint8Array;
  data: ArrayBuffer;
  type?: string;
}

export async function seal(key: CryptoKey, data: ArrayBuffer, type?: string): Promise<Sealed> {
  const iv = randomBytes(12);
  return { v: 1, iv, data: await subtle().encrypt({ name: "AES-GCM", iv }, key, data), type };
}

export function open(key: CryptoKey, sealed: Sealed): Promise<ArrayBuffer> {
  return subtle().decrypt({ name: "AES-GCM", iv: sealed.iv }, key, sealed.data);
}

export const isSealed = (v: unknown): v is Sealed => !!v && typeof v === "object" && (v as Sealed).v === 1 && "iv" in (v as object);

export const sealJSON = (key: CryptoKey, value: unknown) => seal(key, enc.encode(JSON.stringify(value)).buffer as ArrayBuffer);
export const openJSON = async <T,>(key: CryptoKey, sealed: Sealed): Promise<T> => JSON.parse(dec.decode(await open(key, sealed)));
