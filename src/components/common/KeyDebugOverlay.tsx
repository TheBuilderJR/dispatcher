import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearKeyDebugEntries,
  getCurrentKeyDebugGeneration,
  getKeyDebugEntries,
  subscribeKeyDebug,
  type KeyDebugEntry,
} from "../../lib/keyDebug";

const KEY_DEBUG_WIDTH_STORAGE_KEY = "dispatcher.keydebug.width";

function readStoredWidth(): number {
  if (typeof window === "undefined") return 640;
  const raw = window.localStorage.getItem(KEY_DEBUG_WIDTH_STORAGE_KEY);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : 640;
}

function formatTime(entry: KeyDebugEntry): string {
  return `${entry.timestamp}.${String(entry.timestampMs % 1000).padStart(3, "0")}`;
}

export function KeyDebugOverlay() {
  const [entries, setEntries] = useState<KeyDebugEntry[]>(() => getKeyDebugEntries());
  const [generation, setGeneration] = useState(() => getCurrentKeyDebugGeneration());
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [width, setWidth] = useState(() => readStoredWidth());
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => subscribeKeyDebug(setEntries), []);
  useEffect(() => {
    window.localStorage.setItem(KEY_DEBUG_WIDTH_STORAGE_KEY, String(width));
  }, [width]);

  const visibleEntries = useMemo(
    () => [...entries].filter((entry) => entry.generation === generation).reverse().slice(0, 18),
    [entries, generation]
  );

  const handleClear = () => {
    setGeneration(clearKeyDebugEntries());
    setEntries([]);
    setCopyState("idle");
  };

  const handleCopy = async () => {
    const text = [
      `Key Debug G${generation}`,
      ...visibleEntries.map((entry) => `${formatTime(entry)}\n${entry.source}\n${entry.detail}`),
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const handleResizeMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    resizeRef.current = { startX: e.clientX, startWidth: width };

    const onMouseMove = (moveEvent: MouseEvent) => {
      const state = resizeRef.current;
      if (!state) return;
      const nextWidth = Math.max(360, Math.min(window.innerWidth - 24, state.startWidth + (state.startX - moveEvent.clientX)));
      setWidth(nextWidth);
    };

    const onMouseUp = () => {
      resizeRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div className="key-debug-overlay" style={{ width: `${width}px` }}>
      <div className="key-debug-resize-handle" onMouseDown={handleResizeMouseDown} />
      <div className="key-debug-header">
        <strong>{`Key Debug G${generation}`}</strong>
        <div className="key-debug-actions">
          <button type="button" onClick={handleCopy}>
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
          </button>
          <button type="button" onClick={handleClear}>Clear</button>
        </div>
      </div>
      <div className="key-debug-list">
        {visibleEntries.length === 0 ? (
          <div className="key-debug-empty">No events yet</div>
        ) : (
          visibleEntries.map((entry) => (
            <div key={entry.id} className="key-debug-entry">
              <span className="key-debug-time">{formatTime(entry)}</span>
              <span className="key-debug-source">{entry.source}</span>
              <span className="key-debug-detail">{entry.detail}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
