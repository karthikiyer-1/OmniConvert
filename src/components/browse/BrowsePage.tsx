import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, ExternalLink, Lock, Plus, RotateCw, Search, ShieldOff, X } from "lucide-react";
import { currentUrl, hostOf, MAX_TABS, prettyUrl, resolveInput, useBrowser, type BrowserTab } from "@/lib/browser";
import { useStore } from "@/lib/store";
import { getParam, setParam, useRoute } from "@/lib/router";
import { cn, isFinePointer } from "@/lib/utils";
import { rise, t } from "@/lib/motion";

/* Sites known to allow embedding — shown on the start page. */
const SUGGESTIONS: { title: string; url: string; detail: string }[] = [
  { title: "Wikipedia", url: "https://en.m.wikipedia.org/wiki/Main_Page", detail: "The free encyclopedia" },
  { title: "OpenStreetMap", url: "https://www.openstreetmap.org/export/embed.html?bbox=-0.20%2C51.48%2C-0.04%2C51.54&layer=mapnik", detail: "Interactive world map" },
  { title: "Internet Archive", url: "https://archive.org", detail: "Books, music & the Wayback Machine" },
  { title: "Example Domain", url: "https://example.com", detail: "A simple test page" },
];

function Monogram({ url, size = 18, label }: { url: string | null; size?: number; label?: string }) {
  const letter = (label || hostOf(url) || "•").replace(/^Search: /, "").slice(0, 1).toUpperCase();
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-fg/[0.08] font-semibold text-muted"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.55) }}
    >
      {url ? letter : <Search size={Math.round(size * 0.55)} strokeWidth={2} />}
    </span>
  );
}

export function BrowsePage() {
  const tabs = useBrowser((s) => s.tabs);
  const activeId = useBrowser((s) => s.activeId);
  const active = tabs.find((x) => x.id === activeId) ?? tabs[0];
  const route = useRoute();
  const hydrated = useStore((s) => s.hydrated);
  const addressRef = useRef<HTMLInputElement>(null);

  // Deep link: #/browse?url=… opens that page once data has loaded.
  const opened = useRef(false);
  useEffect(() => {
    if (!hydrated || opened.current) return;
    opened.current = true;
    const u = getParam("url");
    const r = u ? resolveInput(u) : null;
    if (r && r.url !== currentUrl(active)) useBrowser.getState().go(active.id, r.url, r.note);
  }, [hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the URL in sync with the active tab while on this page.
  const url = currentUrl(active);
  useEffect(() => {
    if (route === "browse" && hydrated) setParam("url", url);
  }, [route, url, hydrated]);

  // Focus the address bar on an empty tab (desktop only).
  useEffect(() => {
    if (route === "browse" && !url && isFinePointer()) addressRef.current?.focus();
  }, [route, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div {...rise} transition={t.base} className="py-6 md:py-8">
      <h1 className="sr-only">Browse</h1>
      <div className="surface flex h-[calc(100dvh-52px-48px)] min-h-[560px] flex-col overflow-hidden md:h-[calc(100dvh-52px-64px)]">
        <TabStrip tabs={tabs} activeId={active.id} />
        <Toolbar tab={active} addressRef={addressRef} />
        <div className="relative min-h-0 flex-1 bg-bg/60">
          {tabs.map((tab) => (
            <TabView key={tab.id} tab={tab} hidden={tab.id !== active.id} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------------- tab strip */

function TabStrip({ tabs, activeId }: { tabs: BrowserTab[]; activeId: string }) {
  const { activate, closeTab, newTab } = useBrowser.getState();
  const toast = useStore((s) => s.toast);
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 px-2" style={{ boxShadow: "0 1px 0 var(--hairline)" }}>
      <div role="group" aria-label="Tabs" className="scroll-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overscroll-contain py-1">
        <AnimatePresence initial={false}>
          {tabs.map((tab) => {
            const isActive = tab.id === activeId;
            return (
              <motion.div
                key={tab.id}
                layout="position"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: t.fast }}
                transition={t.base}
                className={cn(
                  "group relative flex h-9 w-[200px] min-w-[120px] shrink items-center rounded-xl transition-colors duration-200",
                  isActive ? "bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_0.5px_rgb(0_0_0/0.06)] dark:bg-fg/[0.1]" : "hover:bg-fg/[0.05]",
                )}
              >
                <button
                  type="button"
                  onClick={() => activate(tab.id)}
                  aria-current={isActive ? "page" : undefined}
                  className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-xl pl-3 pr-1 text-left focus-visible:outline-offset-[-2px]"
                  title={currentUrl(tab) ?? "New Tab"}
                >
                  <Monogram url={currentUrl(tab)} label={tab.title !== "New Tab" ? tab.title : undefined} />
                  <span className={cn("truncate text-footnote", isActive ? "font-medium text-fg" : "text-muted")} translate="no">
                    {tab.title}
                  </span>
                  {tab.loading && <span className="ml-auto h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />}
                </button>
                <button
                  type="button"
                  onClick={() => closeTab(tab.id)}
                  aria-label={`Close ${tab.title}`}
                  className={cn(
                    "mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted transition-opacity duration-200 hover:bg-fg/[0.08] hover:text-fg focus-visible:opacity-100",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100 max-lg:opacity-100",
                  )}
                >
                  <X aria-hidden size={13} strokeWidth={2} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label="New tab"
        title="New tab"
        onClick={() => {
          if (!newTab()) toast({ tone: "info", title: `You can have up to ${MAX_TABS} tabs`, body: "Close one to open another" });
        }}
      >
        <Plus aria-hidden size={18} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ toolbar */

function Toolbar({ tab, addressRef }: { tab: BrowserTab; addressRef: React.RefObject<HTMLInputElement> }) {
  const { back, forward, reload, stop, go } = useBrowser.getState();
  const url = currentUrl(tab);
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const secure = url?.startsWith("https://");
  const canBack = tab.index >= 0 || tab.drifted;
  const canForward = tab.index < tab.history.length - 1;

  useEffect(() => setDraft(null), [tab.id, url]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const r = resolveInput(draft ?? "");
    if (!r) return;
    go(tab.id, r.url, r.note);
    setDraft(null);
    addressRef.current?.blur();
  };

  return (
    <div className="relative flex h-14 shrink-0 items-center gap-1 px-2 md:gap-2 md:px-3" style={{ boxShadow: "0 1px 0 var(--hairline)" }}>
      <button type="button" className="icon-btn" disabled={!canBack} onClick={() => back(tab.id)} aria-label="Back" title="Back">
        <ArrowLeft aria-hidden size={18} strokeWidth={1.75} />
      </button>
      <button type="button" className="icon-btn" disabled={!canForward} onClick={() => forward(tab.id)} aria-label="Forward" title="Forward">
        <ArrowRight aria-hidden size={18} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="icon-btn max-sm:hidden"
        disabled={!url}
        onClick={() => (tab.loading ? stop(tab.id) : reload(tab.id))}
        aria-label={tab.loading ? "Stop loading" : "Reload"}
        title={tab.loading ? "Stop" : "Reload"}
      >
        {tab.loading ? <X aria-hidden size={18} strokeWidth={1.75} /> : <RotateCw aria-hidden size={16} strokeWidth={1.75} />}
      </button>

      <form onSubmit={submit} role="search" className="min-w-0 flex-1">
        <label className="flex h-10 items-center gap-2 rounded-full bg-fg/[0.05] px-4 transition-[box-shadow,background-color] duration-200 focus-within:bg-surface focus-within:ring-2 focus-within:ring-accent/50 dark:focus-within:bg-fg/[0.08]">
          {editing || !url ? (
            <Search aria-hidden size={15} strokeWidth={1.75} className="shrink-0 text-subtle" />
          ) : secure ? (
            <Lock aria-hidden size={14} strokeWidth={2} className="shrink-0 text-muted" />
          ) : (
            <ShieldOff aria-hidden size={14} strokeWidth={2} className="shrink-0 text-danger" />
          )}
          <span className="sr-only">Address or search</span>
          <input
            ref={addressRef}
            type="text"
            inputMode="url"
            name="address"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="Search or enter address…"
            value={editing ? draft! : prettyUrl(url)}
            onFocus={(e) => {
              setDraft(url ?? "");
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => setDraft(null)}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setDraft(null);
                e.currentTarget.blur();
              }
            }}
            className={cn("w-full min-w-0 bg-transparent text-body outline-none placeholder:text-subtle focus-visible:outline-none", !editing && url && "text-center max-md:text-left")}
            translate="no"
          />
        </label>
      </form>

      {url ? (
        <a
          className="icon-btn"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in a new browser tab"
          title="Open in a new browser tab"
        >
          <ExternalLink aria-hidden size={16} strokeWidth={1.75} />
        </a>
      ) : (
        <span className="h-9 w-9 shrink-0" aria-hidden />
      )}

      {/* Loading bar along the toolbar's bottom edge (transform-only). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden" aria-hidden>
        <AnimatePresence>
          {tab.loading && (
            <motion.div
              key={tab.nav}
              className="h-full w-full origin-left bg-accent"
              initial={{ scaleX: 0.04, opacity: 1 }}
              animate={{ scaleX: 0.85, transition: { duration: 6, ease: [0.16, 1, 0.3, 1] } }}
              exit={{ scaleX: 1, opacity: 0, transition: { duration: 0.35 } }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- tab view */

function TabView({ tab, hidden }: { tab: BrowserTab; hidden: boolean }) {
  const url = currentUrl(tab);
  const patch = useBrowser((s) => s.patch);
  const remember = useBrowser((s) => s.remember);
  const loads = useRef(0);

  // Ask the server whether this page allows embedding, and fetch its title.
  useEffect(() => {
    if (!url) return;
    loads.current = 0;
    const ctrl = new AbortController();
    fetch(`/api/frame-check?url=${encodeURIComponent(url)}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: { embeddable: boolean | null; reason?: string; title?: string } | null) => {
        if (!res) return;
        if (res.embeddable === false) patch(tab.id, { blocked: { reason: res.reason ?? "blocked" }, loading: false });
        if (res.title) patch(tab.id, { title: res.title });
        remember(url, res.title || hostOf(url));
      })
      .catch(() => {
        /* offline / API unavailable: just try to load it */
      });
    // Give up on the spinner if a page never finishes loading.
    const timer = window.setTimeout(() => patch(tab.id, { loading: false }), 20000);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [url, tab.nav, tab.id, patch, remember]);

  if (!url)
    return (
      <div hidden={hidden} className="absolute inset-0 overflow-y-auto">
        <StartPage tabId={tab.id} />
      </div>
    );

  // Never give a same-origin page script + same-origin together (it could escape the sandbox).
  const sameOrigin = (() => {
    try {
      return new URL(url).origin === window.location.origin;
    } catch {
      return false;
    }
  })();

  return (
    <div hidden={hidden} className="absolute inset-0">
      {tab.blocked ? (
        <Blocked url={url} tab={tab} />
      ) : (
        <iframe
          key={`${tab.id}:${tab.nav}`}
          src={url}
          title={tab.title || hostOf(url)}
          className="h-full w-full border-0 bg-white"
          sandbox={`allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation${sameOrigin ? "" : " allow-same-origin"}`}
          allow="fullscreen; autoplay; encrypted-media; picture-in-picture; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => {
            loads.current += 1;
            // First load = the page we asked for; later loads = links clicked inside it.
            patch(tab.id, loads.current === 1 ? { loading: false } : { loading: false, drifted: true });
          }}
        />
      )}
      <AnimatePresence>
        {tab.note && !tab.blocked && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={t.base}
            className="material pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full px-4 py-1.5 text-caption text-muted shadow-popover"
          >
            {tab.note}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function Blocked({ url, tab }: { url: string; tab: BrowserTab }) {
  const back = useBrowser((s) => s.back);
  const host = hostOf(url);
  return (
    <motion.div {...rise} transition={t.slow} className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-full bg-fg/[0.05] text-muted">
        <ShieldOff aria-hidden size={26} strokeWidth={1.5} />
      </div>
      <h2 className="text-balance font-display text-title font-semibold">
        <span translate="no">{host}</span> Can’t Be Shown Here
      </h2>
      <p className="mt-3 max-w-[420px] text-pretty text-body text-muted">
        This site doesn’t allow other websites to display it, and your browser enforces that. Open it in a new browser tab instead.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a className="btn-primary" href={url} target="_blank" rel="noopener noreferrer">
          Open in New Tab
          <ExternalLink aria-hidden size={15} strokeWidth={2} />
        </a>
        <button type="button" className="btn-secondary h-11 px-5 text-body" onClick={() => back(tab.id)}>
          Go Back
        </button>
      </div>
    </motion.div>
  );
}

function StartPage({ tabId }: { tabId: string }) {
  const go = useBrowser((s) => s.go);
  const recent = useBrowser((s) => s.recent);
  const forgetRecent = useBrowser((s) => s.forgetRecent);

  const Tile = ({ title, url, detail }: { title: string; url: string; detail: string }) => (
    <li>
      <button
        type="button"
        onClick={() => go(tabId, url)}
        className="flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-colors duration-200 hover:bg-fg/[0.04]"
      >
        <Monogram url={url} size={40} label={title} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-medium" translate="no">
            {title}
          </span>
          <span className="block truncate text-footnote text-muted">{detail}</span>
        </span>
      </button>
    </li>
  );

  return (
    <div className="mx-auto w-full max-w-[880px] px-6 py-12 md:py-20">
      <motion.h2 {...rise} transition={t.slow} className="text-balance font-display text-headline font-semibold">
        Browse the Web.
      </motion.h2>
      <motion.p {...rise} transition={{ ...t.slow, delay: 0.05 }} className="mt-4 max-w-[520px] text-pretty text-lead text-muted">
        Type an address or a search above. Pages open right here, in tabs. YouTube links play in its embeddable player.
      </motion.p>

      <motion.div {...rise} transition={{ ...t.slow, delay: 0.1 }} className="mt-12 grid gap-10 md:grid-cols-2">
        <section aria-labelledby={`sugg-${tabId}`}>
          <h3 id={`sugg-${tabId}`} className="eyebrow mb-2">
            Suggestions
          </h3>
          <ul className="-mx-3">
            {SUGGESTIONS.map((s) => (
              <Tile key={s.url} {...s} />
            ))}
          </ul>
        </section>
        <section aria-labelledby={`recent-${tabId}`}>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 id={`recent-${tabId}`} className="eyebrow">
              Recently Visited
            </h3>
            {recent.length > 0 && (
              <button type="button" className="btn-text -mr-3 h-7 text-muted hover:text-fg" onClick={forgetRecent}>
                Clear
              </button>
            )}
          </div>
          {recent.length ? (
            <ul className="-mx-3">
              {recent.slice(0, 6).map((r) => (
                <Tile key={r.url} title={r.title} url={r.url} detail={prettyUrl(r.url)} />
              ))}
            </ul>
          ) : (
            <p className="py-3 text-footnote text-muted">Sites you open will show up here.</p>
          )}
        </section>
      </motion.div>
      <p className="mt-16 text-pretty text-caption text-subtle">
        Some sites, like Google and GitHub, don’t allow being shown inside other websites. When that happens, open them in a new browser tab.
      </p>
    </div>
  );
}
