/**
 * On-device accounts.
 *
 * Security model
 * - The password is never stored. PBKDF2-SHA-256 (600k iterations, random
 *   16-byte salt) turns it into a key-encryption key (KEK).
 * - Each account has a random AES-256-GCM data key. Only the KEK-wrapped copy
 *   is stored. Signing in = unwrapping it; a wrong password fails the GCM tag.
 * - Everything the account saves (file contents, file list, history) is
 *   encrypted with the data key before it touches IndexedDB.
 * - "Stay signed in" stores the unwrapped data key as a *non-extractable*
 *   CryptoKey in IndexedDB: the browser can use it, but no script can read
 *   its bytes. It expires after 30 days. Without it, the key lives only in
 *   memory and a reload signs you out.
 * - Limits: accounts live on this device/browser only, and a forgotten
 *   password cannot be recovered (by design: nobody else holds the key).
 */
import { create } from "zustand";
import {
  deriveKek,
  fromB64,
  newDataKey,
  PBKDF2_ITERATIONS,
  randomBytes,
  toB64,
  unwrapDataKey,
  wrapDataKey,
} from "./crypto";
import { deleteNamespace, getBlob, idbDelete, idbGet, idbPut, idbValues, putBlob, setVault } from "./db";
import { flush, loadVault, sweepOrphans } from "./persistence";
import { commitPendingDeletions, origKey, outKey, useStore } from "./store";
import { useBrowser } from "./browser";
import { uid } from "./utils";

interface AccountRecord {
  id: string;
  email: string;
  name: string;
  salt: string;
  iterations: number;
  wrapped: string;
  iv: string;
  createdAt: number;
  lastSignInAt?: number;
}

interface SessionRecord {
  userId: string;
  key: CryptoKey;
  expiresAt: number;
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: number;
  lastSignInAt?: number;
  remembered: boolean;
}

const SESSION_KEY = "current";
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;

export const MIN_PASSWORD = 8;

const toUser = (a: AccountRecord, remembered: boolean): User => ({
  id: a.id,
  email: a.email,
  name: a.name,
  createdAt: a.createdAt,
  lastSignInAt: a.lastSignInAt,
  remembered,
});

const normEmail = (e: string) => e.trim().toLowerCase();
const accountKey = (email: string) => `acct:${normEmail(email)}`;
const prefixFor = (id: string) => `u:${id}:`;

async function findAccount(email: string) {
  return idbGet<AccountRecord>("accounts", accountKey(email));
}

/** Throttle repeated wrong passwords (per email, survives reloads). */
const attempts = {
  read(email: string): { n: number; until: number } {
    try {
      return JSON.parse(localStorage.getItem(`omni-attempts:${normEmail(email)}`) || "") || { n: 0, until: 0 };
    } catch {
      return { n: 0, until: 0 };
    }
  },
  write(email: string, v: { n: number; until: number }) {
    try {
      localStorage.setItem(`omni-attempts:${normEmail(email)}`, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  },
  clear(email: string) {
    try {
      localStorage.removeItem(`omni-attempts:${normEmail(email)}`);
    } catch {
      /* ignore */
    }
  },
};

export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= MIN_PASSWORD) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < MIN_PASSWORD) score = Math.min(score, 1);
  const s = score as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: ["Too short", "Weak", "Fair", "Good", "Strong"][s] };
}

/** Ask the browser's password manager to save the credentials (Chromium). */
function offerToSavePassword(email: string, password: string, name: string) {
  const PC = (window as unknown as { PasswordCredential?: new (d: object) => Credential }).PasswordCredential;
  if (!PC || !navigator.credentials?.store) return;
  navigator.credentials.store(new PC({ id: email, password, name })).catch(() => {});
}

interface AuthState {
  status: "loading" | "guest" | "user";
  user: User | null;
  restore: () => Promise<void>;
  signUp: (p: { name: string; email: string; password: string; remember: boolean; importGuest: boolean }) => Promise<void>;
  signIn: (p: { email: string; password: string; remember: boolean }) => Promise<void>;
  signOut: (opts?: { forget?: boolean }) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

async function enterVault(prefix: string, key: CryptoKey | null) {
  commitPendingDeletions();
  await flush();
  setVault({ prefix, key });
  const data = await loadVault();
  useStore.getState().hydrate(data);
  useBrowser.getState().hydrate(data.browser);
  void sweepOrphans(data.items);
}

export const useAuth = create<AuthState>()((set, get) => ({
  status: "loading",
  user: null,

  restore: async () => {
    try {
      const s = await idbGet<SessionRecord>("sessions", SESSION_KEY);
      if (s && s.expiresAt > Date.now()) {
        const acct = (await idbValues<AccountRecord>("accounts")).find((a) => a.id === s.userId);
        if (acct) {
          await enterVault(prefixFor(acct.id), s.key);
          set({ status: "user", user: toUser(acct, true) });
          return;
        }
      }
      if (s) await idbDelete("sessions", SESSION_KEY);
    } catch {
      /* fall through to guest */
    }
    await enterVault("", null);
    set({ status: "guest", user: null });
  },

  signUp: async ({ name, email, password, remember, importGuest }) => {
    email = normEmail(email);
    name = name.trim();
    if (!name) throw new Error("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter an email like name@example.com.");
    if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
    if (await findAccount(email)) throw new Error("An account with this email already exists on this device. Sign in instead.");

    const salt = randomBytes(16);
    const kek = await deriveKek(password, salt);
    const dataKey = await newDataKey();
    const { wrapped, iv } = await wrapDataKey(dataKey, kek);
    // From here on use a non-extractable copy of the data key.
    const key = await unwrapDataKey(wrapped, iv, kek);
    const acct: AccountRecord = {
      id: uid() + uid(),
      email,
      name,
      salt: toB64(salt),
      iterations: PBKDF2_ITERATIONS,
      wrapped,
      iv,
      createdAt: Date.now(),
      lastSignInAt: Date.now(),
    };
    await idbPut("accounts", accountKey(email), acct);

    // Optionally carry the guest's files into the new, encrypted account.
    const guest = useStore.getState();
    let carried = { items: [] as typeof guest.items, history: [] as typeof guest.history, blobs: [] as [string, Blob][] };
    if (importGuest) {
      const items = guest.items.filter((i) => i.status !== "uploading");
      const blobs: [string, Blob][] = [];
      for (const it of items) {
        for (const k of [origKey(it.id), outKey(it.id)]) {
          const b = await getBlob(k);
          if (b) blobs.push([k, b]);
        }
      }
      carried = { items, history: guest.history, blobs };
    }

    commitPendingDeletions();
    await flush();
    setVault({ prefix: prefixFor(acct.id), key });
    for (const [k, b] of carried.blobs) await putBlob(k, b);
    useStore.getState().hydrate({ items: carried.items, history: carried.history });
    if (!importGuest) useBrowser.getState().hydrate();
    useStore.getState().log("account-created", name);
    if (importGuest && carried.items.length) {
      // The files now live (encrypted) in the account; remove the plain guest copies.
      await deleteNamespace("");
      try {
        localStorage.removeItem("omniconvert-history");
      } catch {
        /* ignore */
      }
    }
    if (remember) await idbPut("sessions", SESSION_KEY, { userId: acct.id, key, expiresAt: Date.now() + REMEMBER_MS });
    if (remember) offerToSavePassword(email, password, name);
    set({ status: "user", user: toUser(acct, remember) });
  },

  signIn: async ({ email, password, remember }) => {
    email = normEmail(email);
    const a = attempts.read(email);
    if (a.until > Date.now()) {
      throw new Error(`Too many attempts. Wait ${Math.ceil((a.until - Date.now()) / 1000)} seconds, then try again.`);
    }
    const acct = await findAccount(email);
    // Same message for unknown email and wrong password; always pay the KDF cost.
    let key: CryptoKey | null = null;
    try {
      const kek = await deriveKek(password, acct ? fromB64(acct.salt) : randomBytes(16), acct?.iterations ?? PBKDF2_ITERATIONS);
      if (acct) key = await unwrapDataKey(acct.wrapped, acct.iv, kek);
    } catch {
      key = null;
    }
    if (!acct || !key) {
      const n = a.n + 1;
      attempts.write(email, n >= MAX_ATTEMPTS ? { n: 0, until: Date.now() + LOCK_MS } : { n, until: 0 });
      throw new Error(
        n >= MAX_ATTEMPTS ? "Too many attempts. Wait 30 seconds, then try again." : "That email and password don’t match an account on this device. Check them and try again, or create an account.",
      );
    }
    attempts.clear(email);
    acct.lastSignInAt = Date.now();
    await idbPut("accounts", accountKey(email), acct);
    await enterVault(prefixFor(acct.id), key);
    useStore.getState().log("signed-in", acct.name);
    if (remember) {
      await idbPut("sessions", SESSION_KEY, { userId: acct.id, key, expiresAt: Date.now() + REMEMBER_MS });
      offerToSavePassword(email, password, acct.name);
    } else await idbDelete("sessions", SESSION_KEY);
    set({ status: "user", user: toUser(acct, remember) });
  },

  signOut: async () => {
    await idbDelete("sessions", SESSION_KEY).catch(() => {});
    // Stop Chromium from silently re-filling the account.
    navigator.credentials?.preventSilentAccess?.().catch(() => {});
    await enterVault("", null);
    set({ status: "guest", user: null });
  },

  changePassword: async (current, next) => {
    const user = get().user;
    if (!user) throw new Error("You’re signed out. Sign in again, then retry.");
    if (next.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
    const acct = await findAccount(user.email);
    if (!acct) throw new Error("This account isn’t on this device anymore. Sign out and sign in again.");
    let dataKey: CryptoKey;
    try {
      // Extractable only for the instant it takes to re-wrap.
      dataKey = await unwrapDataKey(acct.wrapped, acct.iv, await deriveKek(current, fromB64(acct.salt), acct.iterations), true);
    } catch {
      throw new Error("Your current password is incorrect.");
    }
    const salt = randomBytes(16);
    const { wrapped, iv } = await wrapDataKey(dataKey, await deriveKek(next, salt));
    await idbPut("accounts", accountKey(user.email), { ...acct, salt: toB64(salt), iterations: PBKDF2_ITERATIONS, wrapped, iv });
    if (user.remembered) offerToSavePassword(user.email, next, user.name);
  },

  deleteAccount: async (password) => {
    const user = get().user;
    if (!user) return;
    const acct = await findAccount(user.email);
    if (!acct) return;
    try {
      await unwrapDataKey(acct.wrapped, acct.iv, await deriveKek(password, fromB64(acct.salt), acct.iterations));
    } catch {
      throw new Error("That password is incorrect.");
    }
    await enterVault("", null);
    await deleteNamespace(prefixFor(acct.id));
    await idbDelete("accounts", accountKey(user.email));
    await idbDelete("sessions", SESSION_KEY).catch(() => {});
    set({ status: "guest", user: null });
  },
}));
