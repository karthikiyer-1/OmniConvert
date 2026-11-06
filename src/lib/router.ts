import { useSyncExternalStore } from "react";

/**
 * Hash routing with query params: `#/open`, `#/?filter=ready&file=abc`.
 * Works on any static host (Vercel included) and keeps UI state deep-linkable.
 */
export type Route = "convert" | "open" | "browse" | "account";
const ROUTES: Route[] = ["convert", "open", "browse", "account"];

function parse() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const r = path.split("/")[0] as Route;
  return { route: ROUTES.includes(r) ? r : ("convert" as Route), params: new URLSearchParams(query) };
}

export const hrefFor = (route: Route, params?: Record<string, string>) => {
  const q = params ? new URLSearchParams(params).toString() : "";
  return `#/${route === "convert" ? "" : route}${q ? `?${q}` : ""}`;
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("hashchange", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("hashchange", cb);
  };
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, () => parse().route, () => "convert");
}

/** Read one query param from the hash; re-renders when it changes. */
export function useParam(key: string): string | null {
  return useSyncExternalStore(subscribe, () => parse().params.get(key), () => null);
}

export function getParam(key: string): string | null {
  return parse().params.get(key);
}

/** Update a query param in place (no new history entry, no scroll). */
export function setParam(key: string, value: string | null) {
  const { route, params } = parse();
  if (value === null || value === "") params.delete(key);
  else params.set(key, value);
  const next = hrefFor(route, Object.fromEntries(params));
  if (next !== (window.location.hash || "#/")) {
    history.replaceState(null, "", next);
    emit();
  }
}

export function navigate(route: Route) {
  if (parse().route !== route) window.location.hash = hrefFor(route).slice(1);
  window.scrollTo({ top: 0 });
}
