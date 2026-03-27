import { useEffect } from "react";
import { captureTerminalScreenshot, ensureTerminalScreenshotTarget } from "./useTerminalBridge";
import { useTerminalStore } from "../stores/useTerminalStore";

const SCREENSHOT_INTERVAL_MS = 60_000;
const SCREENSHOT_INACTIVITY_MS = 120_000;

export function useTerminalScreenshotMonitor() {
  useEffect(() => {
    const previousScreenshots = new Map<string, string>();
    const lastChangedAt = new Map<string, number>();

    const sampleAllTerminals = () => {
      const now = Date.now();
      const store = useTerminalStore.getState();
      const terminalIds = Object.keys(store.sessions);
      const activeIds = new Set(terminalIds);

      for (const terminalId of previousScreenshots.keys()) {
        if (!activeIds.has(terminalId)) {
          previousScreenshots.delete(terminalId);
          lastChangedAt.delete(terminalId);
        }
      }

      for (const terminalId of terminalIds) {
        ensureTerminalScreenshotTarget(terminalId, store.sessions[terminalId]?.cwd);
        const screenshot = captureTerminalScreenshot(terminalId);
        if (screenshot === null) {
          continue;
        }

        const previousScreenshot = previousScreenshots.get(terminalId);
        if (previousScreenshot !== screenshot) {
          previousScreenshots.set(terminalId, screenshot);
          lastChangedAt.set(terminalId, now);
          store.setPossiblyDone(terminalId, false);
          continue;
        }

        const changedAt = lastChangedAt.get(terminalId) ?? now;
        store.setPossiblyDone(terminalId, now - changedAt >= SCREENSHOT_INACTIVITY_MS);
        previousScreenshots.set(terminalId, screenshot);
      }
    };

    sampleAllTerminals();
    const intervalId = window.setInterval(sampleAllTerminals, SCREENSHOT_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);
}
