import { useEffect, useRef, useCallback } from "react";

export function useResizeObserver(
  callback: (entry: ResizeObserverEntry) => void
) {
  const ref = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        callbackRef.current(entry);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
