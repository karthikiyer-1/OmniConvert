import { create } from "zustand";
import { uid } from "./utils";
import { useStore } from "./store";

/**
 * Browse panel state: tabs, each with its own back/forward stack.
 *
 * Pages are cross-origin iframes, so the app can't read where a page's own
 * links lead. Navigations made from the address bar are tracked exactly;
 * link clicks inside a page are detected (extra iframe `load` events) and
 * mark the tab as "drifted", so Back returns to the last known page.
 */

export interface BrowserTab {
  id: string;
  /** null = start page */
  history: string[];
  index: number;
  title: string;
  /** Bumped to force the iframe to reload / remount. */
  nav: number;
  loading: boolean;
  /** The page followed its own links since our last navigation. */
  drifted: boolean;
  blocked: null | { reason: string };
  note?: string;
}

export const MAX_TABS = 8;
const HISTORY_CAP = 50;
const RECENT_CAP = 12;

const blankTab = (): BrowserTab => ({
  id: uid(),
  history: [],
  index: -1,
  title: "New Tab",
  nav: 0,
  loading: false,
  drifted: false,
  blocked: null,
});

export const currentUrl = (t: BrowserTab | undefined) => (t && t.index >= 0 ? t.history[t.index] : null);

/* ---------------------------------------------------------- input parsing */

/** Google serves an embeddable results page when `igu=1` is set. */
const SEARCH = (q: string) => `https://www.google.com/search?igu=1&q=${encodeURIComponent(q)}`;
const GOOGLE_HOME = "https://www.google.com/webhp?igu=1";
const isGoogle = (h: string) => /^(www\.)?google\.[a-z.]+$/.test(h);

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
  if (host === "youtube.com" || host === "music.youtube.com") {
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/);
    if (m) return m[1];
  }
  return null;
}

/** Turn whatever was typed into a safe http(s) URL. */
export function resolveInput(raw: string): { url: string; note?: string } | null {
  const text = raw.trim();
  if (!text) return null;
  let candidate: string | null = null;
  if (/^https?:\/\//i.test(text)) candidate = text;
  else if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^localhost:\d/i.test(text)) candidate = null; // javascript:, data:, file: … → search
  else if (!/\s/.test(text) && (/^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(text) || /^localhost(:\d+)?(\/.*)?$/i.test(text)))
    candidate = `https://${text}`;
  if (!candidate) return { url: SEARCH(text) };
  try {
    return embeddable(new URL(candidate));
  } catch {
    return { url: SEARCH(text) };
  }
}

/**
 * Many services block framing on their normal pages but offer an official
 * embeddable version. Rewrite links to those versions.
 */
function embeddable(u: URL): { url: string; note?: string } {
  const host = u.hostname.toLowerCase();
  const yt = youtubeId(u);
  if (yt && /^[\w-]{6,}$/.test(yt)) {
    const start = u.searchParams.get("t")?.replace(/s$/, "");
    return {
      url: `https://www.youtube-nocookie.com/embed/${yt}${start && /^\d+$/.test(start) ? `?start=${start}` : ""}`,
      note: "Opened in YouTube’s embeddable player",
    };
  }
  // Google Maps → the embed endpoint.
  if ((isGoogle(host) && u.pathname.startsWith("/maps")) || host === "maps.google.com") {
    const place = u.pathname.match(/\/maps\/(?:place|search)\/([^/]+)/)?.[1];
    const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const q = u.searchParams.get("q") ?? (place ? decodeURIComponent(place.replace(/\+/g, " ")) : at ? `${at[1]},${at[2]}` : "");
    if (u.searchParams.get("output") === "embed") return { url: u.toString() };
    return { url: `https://maps.google.com/maps?q=${encodeURIComponent(q || "world")}&output=embed`, note: "Opened in Google Maps’ embeddable view" };
  }
  // Google Search / home → embeddable mode.
  if (isGoogle(host) && (u.pathname === "/" || u.pathname === "/webhp" || u.pathname === "/search")) {
    const q = u.searchParams.get("q");
    return { url: q ? SEARCH(q) : GOOGLE_HOME };
  }
  // Google Docs / Sheets / Slides / Drive files → preview mode.
  const doc = host === "docs.google.com" && u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([\w-]+)/);
  if (doc) return { url: `https://docs.google.com/${doc[1]}/d/${doc[2]}/preview`, note: "Opened in Google’s preview mode (view only)" };
  const drive = host === "drive.google.com" && u.pathname.match(/^\/file\/d\/([\w-]+)/);
  if (drive) return { url: `https://drive.google.com/file/d/${drive[1]}/preview`, note: "Opened in Google Drive’s preview mode" };
  // Vimeo / Spotify → their players.
  const vimeo = /(^|\.)vimeo\.com$/.test(host) && host !== "player.vimeo.com" && u.pathname.match(/^\/(\d+)/);
  if (vimeo) return { url: `https://player.vimeo.com/video/${vimeo[1]}`, note: "Opened in Vimeo’s player" };
  const spotify = host === "open.spotify.com" && u.pathname.match(/^\/(?:intl-\w+\/)?(track|album|playlist|episode|show|artist)\/(\w+)/);
  if (spotify) return { url: `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}`, note: "Opened in Spotify’s player" };
  return { url: u.toString() };
}

const FRIENDLY: Record<string, string> = {
  "maps.google.com": "Google Maps",
  "docs.google.com": "Google Docs",
  "drive.google.com": "Google Drive",
  "www.youtube-nocookie.com": "YouTube",
  "player.vimeo.com": "Vimeo",
  "open.spotify.com": "Spotify",
};

export function hostOf(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (isGoogle(u.hostname) && u.pathname === "/search" && u.searchParams.get("q")) return `Search: ${u.searchParams.get("q")}`;
    if (isGoogle(u.hostname)) return "Google";
    const friendly = FRIENDLY[u.hostname];
    if (friendly) return friendly;
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "en.wikipedia.org/wiki/Apple" — for the unfocused address bar. */
export function prettyUrl(url: string | null): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    // Searches show the words, like Safari does; embed flags stay out of sight.
    if (isGoogle(u.hostname) && u.pathname === "/search" && u.searchParams.get("q")) return u.searchParams.get("q")!;
    if (isGoogle(u.hostname) && u.pathname === "/webhp") return "google.com";
    if (u.hostname === "maps.google.com" && u.searchParams.get("output") === "embed")
      return `Google Maps · ${u.searchParams.get("q") ?? ""}`.replace(/ · $/, "");
    u.searchParams.delete("igu");
    const path = u.pathname === "/" && !u.search ? "" : decodeURI(u.pathname);
    return u.host.replace(/^www\./, "") + path + u.search;
  } catch {
    return url;
  }
}

/* ------------------------------------------------------------------ store */

interface Persisted {
  tabs: { id: string; history: string[]; index: number; title: string }[];
  activeId: string;
  recent: { url: string; title: string }[];
}

interface BrowserState {
  tabs: BrowserTab[];
  activeId: string;
  recent: { url: string; title: string }[];
  newTab: (url?: string) => string | null;
  closeTab: (id: string) => void;
  activate: (id: string) => void;
  go: (id: string, url: string, note?: string) => void;
  back: (id: string) => void;
  forward: (id: string) => void;
  reload: (id: string) => void;
  stop: (id: string) => void;
  patch: (id: string, p: Partial<BrowserTab>) => void;
  remember: (url: string, title: string) => void;
  forgetRecent: () => void;
  hydrate: (p?: Partial<Persisted>) => void;
  snapshot: () => Persisted;
}

const first = blankTab();

export const useBrowser = create<BrowserState>()((set, get) => ({
  tabs: [first],
  activeId: first.id,
  recent: [],

  newTab: (url) => {
    if (get().tabs.length >= MAX_TABS) return null;
    const t = blankTab();
    set((s) => ({ tabs: [...s.tabs, t], activeId: t.id }));
    if (url) get().go(t.id, url);
    return t.id;
  },

  closeTab: (id) =>
    set((s) => {
      const i = s.tabs.findIndex((t) => t.id === id);
      const rest = s.tabs.filter((t) => t.id !== id);
      if (!rest.length) {
        const t = blankTab();
        return { tabs: [t], activeId: t.id };
      }
      const activeId = s.activeId === id ? rest[Math.min(i, rest.length - 1)].id : s.activeId;
      return { tabs: rest, activeId };
    }),

  activate: (id) => set({ activeId: id }),

  go: (id, url, note) => {
    // Typed / chosen navigations go into the (encrypted, for accounts) history.
    let detail: string | undefined;
    try {
      const u = new URL(url);
      detail = isGoogle(u.hostname) || u.hostname === "maps.google.com" ? undefined : (decodeURI(u.pathname) + u.search).replace(/^\/$/, "") || undefined;
    } catch {
      /* ignore */
    }
    useStore.getState().log("visited", hostOf(url), detail);
    get().patch(id, {
      ...(() => {
        const t = get().tabs.find((x) => x.id === id)!;
        const history = [...t.history.slice(0, t.index + 1), url].slice(-HISTORY_CAP);
        return { history, index: history.length - 1 };
      })(),
      title: hostOf(url),
      nav: Date.now(),
      loading: true,
      drifted: false,
      blocked: null,
      note,
    });
  },

  back: (id) => {
    const t = get().tabs.find((x) => x.id === id);
    if (!t) return;
    // After in-page link clicks, Back first returns to the page we opened.
    if (t.drifted) return get().patch(id, { nav: Date.now(), loading: true, drifted: false, blocked: null });
    if (t.index <= 0) {
      if (t.index === 0) get().patch(id, { index: -1, title: "New Tab", loading: false, blocked: null, note: undefined });
      return;
    }
    get().patch(id, { index: t.index - 1, title: hostOf(t.history[t.index - 1]), nav: Date.now(), loading: true, blocked: null, note: undefined });
  },

  forward: (id) => {
    const t = get().tabs.find((x) => x.id === id);
    if (!t || t.index >= t.history.length - 1) return;
    get().patch(id, { index: t.index + 1, title: hostOf(t.history[t.index + 1]), nav: Date.now(), loading: true, drifted: false, blocked: null, note: undefined });
  },

  reload: (id) => get().patch(id, { nav: Date.now(), loading: true, drifted: false, blocked: null }),
  stop: (id) => get().patch(id, { loading: false }),

  patch: (id, p) => set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...p } : t)) })),

  remember: (url, title) =>
    set((s) => ({ recent: [{ url, title }, ...s.recent.filter((r) => r.url !== url)].slice(0, RECENT_CAP) })),
  forgetRecent: () => set({ recent: [] }),

  hydrate: (p) => {
    const tabs = (p?.tabs ?? []).filter((t) => Array.isArray(t.history)).slice(0, MAX_TABS).map((t) => ({
      ...blankTab(),
      ...t,
      index: Math.min(t.index, t.history.length - 1),
      nav: Date.now(),
      loading: t.index >= 0,
    }));
    if (!tabs.length) tabs.push(blankTab());
    set({
      tabs,
      activeId: tabs.some((t) => t.id === p?.activeId) ? p!.activeId! : tabs[0].id,
      recent: (p?.recent ?? []).slice(0, RECENT_CAP),
    });
  },

  snapshot: () => {
    const s = get();
    return {
      tabs: s.tabs.map(({ id, history, index, title }) => ({ id, history, index, title })),
      activeId: s.activeId,
      recent: s.recent,
    };
  },
}));
