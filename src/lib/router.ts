import { useSyncExternalStore } from "react";

export type Route = "convert" | "open" | "account";
const ROUTES: Route[] = ["convert", "open", "account"];

function read(): Route {
  const r = window.location.hash.replace(/^#\/?/, "").split("/")[0] as Route;
  return ROUTES.includes(r) ? r : "convert";
}

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

/** Hash routing: works on any static host (Vercel included) with no server config. */
export function useRoute(): Route {
  return useSyncExternalStore(subscribe, read, () => "convert");
}

export function navigate(route: Route) {
  if (read() !== route) window.location.hash = route === "convert" ? "/" : `/${route}`;
  window.scrollTo({ top: 0 });
}
