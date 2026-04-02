import { useEffect } from "react";
import { captureTerminalScreenshot, ensureTerminalScreenshotTarget } from "./useTerminalBridge";
import { pushScreenshotDebug } from "../lib/screenshotDebug";
import { useTerminalStore } from "../stores/useTerminalStore";

const SCREENSHOT_INTERVAL_MS = 60_000;
const SCREENSHOT_INACTIVITY_MS = 120_000;
const SCREENSHOT_LONG_INACTIVITY_MS = 60 * 60 * 1000;

async function hashScreenshot(screenshot: string): Promise<string> {
  const bytes = new TextEncoder().encode(screenshot);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function useTerminalScreenshotMonitor() {
  useEffect(() => {
    const previousHashes = new Map<string, string>();
    const lastChangedAt = new Map<string, number>();
    const scheduledSamples = new Set<number>();
    let isSampling = false;
    let isDisposed = false;

    const sampleAllTerminals = async () => {
      if (isSampling || isDisposed) {
        return;
      }

      isSampling = true;
      const now = Date.now();
      try {
        const store = useTerminalStore.getState();
        const terminalIds = Object.keys(store.sessions);
        const activeIds = new Set(terminalIds);

        for (const terminalId of previousHashes.keys()) {
          if (!activeIds.has(terminalId)) {
            previousHashes.delete(terminalId);
            lastChangedAt.delete(terminalId);
          }
        }

        for (const terminalId of terminalIds) {
          ensureTerminalScreenshotTarget(terminalId, store.sessions[terminalId]?.cwd);
          const screenshot = captureTerminalScreenshot(terminalId);
          if (screenshot === null) {
            continue;
          }

          const hash = await hashScreenshot(screenshot);
          if (isDisposed) {
            return;
          }

          const previousHash = previousHashes.get(terminalId) ?? null;
          const changed = previousHash !== hash;
          const changedAt = changed ? now : (lastChangedAt.get(terminalId) ?? now);
          const isPossiblyDone = !changed && now - changedAt >= SCREENSHOT_INACTIVITY_MS;
          const isLongInactive = !changed && now - changedAt >= SCREENSHOT_LONG_INACTIVITY_MS;

          previousHashes.set(terminalId, hash);
          lastChangedAt.set(terminalId, changedAt);
          store.setPossiblyDone(terminalId, isPossiblyDone);
          store.setLongInactive(terminalId, isLongInactive);
          pushScreenshotDebug({
            terminalId,
            hash,
            previousHash,
            changed,
            isPossiblyDone,
            isLongInactive,
            imageDataUrl: screenshot,
          });
        }
      } finally {
        isSampling = false;
      }
    };

    const scheduleSample = (delayMs: number) => {
      const timeoutId = window.setTimeout(() => {
        scheduledSamples.delete(timeoutId);
        void sampleAllTerminals();
      }, delayMs);
      scheduledSamples.add(timeoutId);
    };

    void sampleAllTerminals();
    scheduleSample(500);
    scheduleSample(1500);

    let lastSessionSignature = Object.keys(useTerminalStore.getState().sessions).sort().join("|");
    const unsubscribe = useTerminalStore.subscribe((state) => {
      const nextSignature = Object.keys(state.sessions).sort().join("|");
      if (nextSignature === lastSessionSignature) {
        return;
      }

      lastSessionSignature = nextSignature;
      scheduleSample(0);
      scheduleSample(500);
    });

    const intervalId = window.setInterval(() => {
      void sampleAllTerminals();
    }, SCREENSHOT_INTERVAL_MS);

    return () => {
      isDisposed = true;
      unsubscribe();
      window.clearInterval(intervalId);
      for (const timeoutId of scheduledSamples) {
        window.clearTimeout(timeoutId);
      }
      scheduledSamples.clear();
    };
  }, []);
}
