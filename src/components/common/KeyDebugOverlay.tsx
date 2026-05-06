import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearKeyDebugEntries,
  getCurrentKeyDebugGeneration,
  getKeyDebugEntries,
  subscribeKeyDebug,
  type KeyDebugEntry,
} from "../../lib/keyDebug";
import {
  clearScreenshotDebugEntries,
  getCurrentScreenshotDebugGeneration,
  getScreenshotDebugEntries,
  subscribeScreenshotDebug,
  type ScreenshotDebugEntry,
} from "../../lib/screenshotDebug";
import { findLayoutKeyForTerminal } from "../../lib/layoutUtils";
import { useLayoutStore } from "../../stores/useLayoutStore";
import { useTerminalStore } from "../../stores/useTerminalStore";

const KEY_DEBUG_WIDTH_STORAGE_KEY = "dispatcher.keydebug.width";
type DebugTab = "keys" | "screenshots";

function readStoredWidth(): number {
  if (typeof window === "undefined") return 640;
  const raw = window.localStorage.getItem(KEY_DEBUG_WIDTH_STORAGE_KEY);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : 640;
}

function formatTime(entry: KeyDebugEntry): string {
  return `${entry.timestamp}.${String(entry.timestampMs % 1000).padStart(3, "0")}`;
}

function formatScreenshotComponents(entry: ScreenshotDebugEntry): string | null {
  if (!entry.componentTerminalIds || !entry.componentHashes) {
    return null;
  }

  return entry.componentTerminalIds
    .map((terminalId, index) => `${terminalId}:${entry.componentHashes?.[index] ?? "missing"}`)
    .join(", ");
}

function formatScreenshotChangeMetrics(entry: ScreenshotDebugEntry): string {
  const rowRatio = entry.changedRowRatio !== undefined
    ? ` rowRatio=${entry.changedRowRatio.toFixed(3)}`
    : "";
  const charRatio = entry.changedCharRatio !== undefined
    ? ` charRatio=${entry.changedCharRatio.toFixed(3)}`
    : "";
  return [
    `changed=${String(entry.changed)}`,
    `exact=${String(entry.exactChanged ?? entry.changed)}`,
    `repeat=${String(entry.repeatingHashOscillation ?? false)}`,
    `three=${String(entry.hasThreeSamples ?? false)}`,
    `rows=${entry.changedRows ?? "?"}`,
    `chars=${entry.changedChars ?? "?"}`,
    `${rowRatio}${charRatio}`.trim(),
  ].filter(Boolean).join(" ");
}

function getScreenshotImageItems(
  entry: ScreenshotDebugEntry,
  sessions: Record<string, { title: string } | undefined>
): Array<{ terminalId: string; label: string; imageDataUrl: string }> {
  const componentTerminalIds = entry.componentTerminalIds;
  const componentImageDataUrls = entry.componentImageDataUrls;

  if (
    componentTerminalIds &&
    componentImageDataUrls &&
    componentTerminalIds.length === componentImageDataUrls.length
  ) {
    return componentTerminalIds.map((terminalId, index) => ({
      terminalId,
      label: sessions[terminalId]?.title ?? terminalId,
      imageDataUrl: componentImageDataUrls[index],
    }));
  }

  return [
    {
      terminalId: entry.terminalId,
      label: sessions[entry.terminalId]?.title ?? entry.terminalId,
      imageDataUrl: entry.imageDataUrl,
    },
  ];
}

export function KeyDebugOverlay() {
  const [entries, setEntries] = useState<KeyDebugEntry[]>(() => getKeyDebugEntries());
  const [screenshotEntries, setScreenshotEntries] = useState<ScreenshotDebugEntry[]>(() => getScreenshotDebugEntries());
  const [generation, setGeneration] = useState(() => getCurrentKeyDebugGeneration());
  const [screenshotGeneration, setScreenshotGeneration] = useState(() => getCurrentScreenshotDebugGeneration());
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [width, setWidth] = useState(() => readStoredWidth());
  const [activeTab, setActiveTab] = useState<DebugTab>("keys");
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const sessions = useTerminalStore((state) => state.sessions);
  const activeTerminalId = useTerminalStore((state) => state.activeTerminalId);
  const layouts = useLayoutStore((state) => state.layouts);

  useEffect(() => subscribeKeyDebug(setEntries), []);
  useEffect(() => subscribeScreenshotDebug(setScreenshotEntries), []);
  useEffect(() => {
    window.localStorage.setItem(KEY_DEBUG_WIDTH_STORAGE_KEY, String(width));
  }, [width]);

  const visibleEntries = useMemo(
    () => [...entries].filter((entry) => entry.generation === generation).reverse().slice(0, 18),
    [entries, generation]
  );
  const visibleScreenshotEntries = useMemo(
    () => {
      const activeTabTerminalId = activeTerminalId
        ? findLayoutKeyForTerminal(layouts, activeTerminalId) ?? activeTerminalId
        : null;

      if (!activeTabTerminalId) {
        return [];
      }

      return [...screenshotEntries]
        .filter((entry) => entry.generation === screenshotGeneration && entry.terminalId === activeTabTerminalId)
        .reverse()
        .slice(0, 18);
    },
    [activeTerminalId, layouts, screenshotEntries, screenshotGeneration]
  );

  const handleClear = () => {
    if (activeTab === "keys") {
      setGeneration(clearKeyDebugEntries());
      setEntries([]);
    } else {
      setScreenshotGeneration(clearScreenshotDebugEntries());
      setScreenshotEntries([]);
    }
    setCopyState("idle");
  };

  const handleCopy = async () => {
    const text = activeTab === "keys"
      ? [
          `Key Debug G${generation}`,
          ...visibleEntries.map((entry) => `${formatTime(entry)}\n${entry.source}\n${entry.detail}`),
        ].join("\n")
      : [
          `Screenshot Debug G${screenshotGeneration}`,
          `terminal=${activeTerminalId ? findLayoutKeyForTerminal(layouts, activeTerminalId) ?? activeTerminalId : "none"}`,
          ...visibleScreenshotEntries.map((entry) => [
            `${entry.timestamp}.${String(entry.timestampMs % 1000).padStart(3, "0")}`,
            `${sessions[entry.terminalId]?.title ?? entry.terminalId} (${entry.terminalId})`,
            `hash=${entry.hash}`,
            `prev=${entry.previousHash ?? "none"}`,
            formatScreenshotComponents(entry)
              ? `components=${formatScreenshotComponents(entry)}`
              : null,
            formatScreenshotChangeMetrics(entry),
            `detected=${String(entry.hasDetectedActivity)} attention=${String(entry.isNeedsAttention)} done=${String(entry.isPossiblyDone)} longInactive=${String(entry.isLongInactive)}`,
          ].filter((line): line is string => line !== null).join("\n")),
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
        <strong>{activeTab === "keys" ? `Key Debug G${generation}` : `Screenshot Debug G${screenshotGeneration}`}</strong>
        <div className="key-debug-actions">
          <button type="button" onClick={handleCopy}>
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
          </button>
          <button type="button" onClick={handleClear}>Clear</button>
        </div>
      </div>
      <div className="key-debug-tabs">
        <button
          type="button"
          className={`key-debug-tab ${activeTab === "keys" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("keys");
            setCopyState("idle");
          }}
        >
          Keys
        </button>
        <button
          type="button"
          className={`key-debug-tab ${activeTab === "screenshots" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("screenshots");
            setCopyState("idle");
          }}
        >
          Screenshots
        </button>
      </div>
      <div className="key-debug-list">
        {activeTab === "keys" ? (
          visibleEntries.length === 0 ? (
            <div className="key-debug-empty">No events yet</div>
          ) : (
            visibleEntries.map((entry) => (
              <div key={entry.id} className="key-debug-entry">
                <span className="key-debug-time">{formatTime(entry)}</span>
                <span className="key-debug-source">{entry.source}</span>
                <span className="key-debug-detail">{entry.detail}</span>
              </div>
            ))
          )
        ) : visibleScreenshotEntries.length === 0 ? (
          <div className="key-debug-empty">No screenshots yet for the active tab</div>
        ) : (
          visibleScreenshotEntries.map((entry) => (
            <div key={entry.id} className="key-debug-entry key-debug-entry-screenshot">
              <span className="key-debug-time">{`${entry.timestamp}.${String(entry.timestampMs % 1000).padStart(3, "0")}`}</span>
              <span className="key-debug-source">{sessions[entry.terminalId]?.title ?? entry.terminalId}</span>
              <span className="key-debug-detail">
                {[
                  `terminal=${entry.terminalId}`,
                  `hash=${entry.hash}`,
                  `prev=${entry.previousHash ?? "none"}`,
                  formatScreenshotComponents(entry)
                    ? `components=${formatScreenshotComponents(entry)}`
                    : null,
                  formatScreenshotChangeMetrics(entry),
                  `detected=${String(entry.hasDetectedActivity)}`,
                  `attention=${String(entry.isNeedsAttention)}`,
                  `done=${String(entry.isPossiblyDone)}`,
                  `longInactive=${String(entry.isLongInactive)}`,
                ].filter((line): line is string => line !== null).join("\n")}
              </span>
              <div className="key-debug-screenshot-gallery">
                {getScreenshotImageItems(entry, sessions).map((item) => (
                  <figure key={`${entry.id}-${item.terminalId}`} className="key-debug-screenshot-card">
                    <figcaption className="key-debug-screenshot-caption">
                      {item.label}
                    </figcaption>
                    <img
                      className="key-debug-screenshot-image"
                      src={item.imageDataUrl}
                      alt={`Terminal screenshot for ${item.label}`}
                    />
                  </figure>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
