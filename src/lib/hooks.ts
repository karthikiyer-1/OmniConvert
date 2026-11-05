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
