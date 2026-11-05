import type React from "react";
import { useEffect, useState } from "react";
import { getBlob } from "./db";

/** Load a stored blob and expose it (and an object URL) for the component's lifetime. */
export function useStoredBlob(key: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<{ blob?: Blob; url?: string; loading: boolean }>({ loading: !!key });
  useEffect(() => {
    if (!key) {
      setState({ loading: false });
      return;
    }
    let url: string | undefined;
    let cancelled = false;
    setState({ loading: true });
    getBlob(key).then((blob) => {
      if (cancelled) return;
      if (!blob) return setState({ loading: false });
      url = URL.createObjectURL(blob);
      setState({ blob, url, loading: false });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);
  return state;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus management: moves focus into `ref` when active, keeps Tab
 * inside it, and returns focus to whatever was focused before on close.
 */
export function useFocusTrap(ref: React.RefObject<HTMLElement>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = () => el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    const t = window.setTimeout(() => first()?.focus({ preventScroll: true }), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !el) return;
      const nodes = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!nodes.length) return;
      const [a, b] = [nodes[0], nodes[nodes.length - 1]];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        b.focus();
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault();
        a.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [active, ref]);
}
