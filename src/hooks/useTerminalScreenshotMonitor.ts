import { useEffect } from "react";
import { captureTerminalScreenshot, ensureTerminalScreenshotTarget } from "./useTerminalBridge";
import { findLayoutKeyForTerminal } from "../lib/layoutUtils";
import { pushScreenshotDebug } from "../lib/screenshotDebug";
import {
  buildCompoundScreenshotHashInput,
  getTabRootTerminalIds,
  getTabTerminalIds,
} from "../lib/terminalScreenshotHash";
import { useLayoutStore } from "../stores/useLayoutStore";
import { useTerminalStore } from "../stores/useTerminalStore";

const SCREENSHOT_INTERVAL_MS = 5_000;
const SCREENSHOT_INACTIVITY_MS = 10_000;
const SCREENSHOT_LONG_INACTIVITY_MS = 60 * 60 * 1000;

async function hashScreenshot(screenshot: string): Promise<string> {
  const bytes = new TextEncoder().encode(screenshot);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function getActiveTabRootTerminalId(): string | null {
  const activeTerminalId = useTerminalStore.getState().activeTerminalId;
  if (!activeTerminalId) {
    return null;
  }

  const layouts = useLayoutStore.getState().layouts;
  return findLayoutKeyForTerminal(layouts, activeTerminalId) ?? activeTerminalId;
}

export function useTerminalScreenshotMonitor() {
  useEffect(() => {
    const previousHashes = new Map<string, string>();
    const previousTabSignatures = new Map<string, string>();
    const lastChangedAt = new Map<string, number>();
    const acknowledgedAt = new Map<string, number>();
    const scheduledSamples = new Set<number>();
    let isSampling = false;
    let isDisposed = false;

    const clearTabState = (tabRootTerminalId: string) => {
      previousHashes.delete(tabRootTerminalId);
      previousTabSignatures.delete(tabRootTerminalId);
      lastChangedAt.delete(tabRootTerminalId);
      acknowledgedAt.delete(tabRootTerminalId);
    };

    const acknowledgeTab = (
      tabRootTerminalId: string | null,
      sessionIds: Set<string>,
      now: number
    ) => {
      if (!tabRootTerminalId) {
        return;
      }

      const store = useTerminalStore.getState();
      const layouts = useLayoutStore.getState().layouts;
      acknowledgedAt.set(tabRootTerminalId, now);
      for (const terminalId of getTabTerminalIds(layouts, tabRootTerminalId, sessionIds)) {
        const session = store.sessions[terminalId];
        if (session?.isNeedsAttention) {
          store.setNeedsAttention(terminalId, false);
          store.setPossiblyDone(terminalId, true);
        }
      }
    };

    const sampleTabs = async (tabRootTerminalIds: string[]) => {
      if (isSampling || isDisposed) {
        return;
      }

      isSampling = true;
      const now = Date.now();
      try {
        const store = useTerminalStore.getState();
        const layouts = useLayoutStore.getState().layouts;
        const sessionIds = new Set(Object.keys(store.sessions));
        const activeTabRootTerminalId = getActiveTabRootTerminalId();
        const activeTabRoots = new Set(getTabRootTerminalIds(layouts, sessionIds));

        for (const tabRootTerminalId of new Set([
          ...previousHashes.keys(),
          ...previousTabSignatures.keys(),
          ...lastChangedAt.keys(),
          ...acknowledgedAt.keys(),
        ])) {
          if (!activeTabRoots.has(tabRootTerminalId)) {
            clearTabState(tabRootTerminalId);
          }
        }

        for (const tabRootTerminalId of tabRootTerminalIds) {
          const terminalIds = getTabTerminalIds(layouts, tabRootTerminalId, sessionIds);
          if (terminalIds.length === 0) {
            continue;
          }

          const screenshots: Array<{ terminalId: string; screenshot: string }> = [];
          let isReady = true;
          for (const terminalId of terminalIds) {
            const session = useTerminalStore.getState().sessions[terminalId];
            if (!session) {
              isReady = false;
              break;
            }

            ensureTerminalScreenshotTarget(terminalId, session.cwd);
            const screenshot = captureTerminalScreenshot(terminalId);
            if (screenshot === null) {
              isReady = false;
              break;
            }

            screenshots.push({ terminalId, screenshot });
          }

          if (!isReady || screenshots.length !== terminalIds.length) {
            continue;
          }

          const componentHashes = await Promise.all(
            screenshots.map(({ screenshot }) => hashScreenshot(screenshot))
          );
          const hash =
            componentHashes.length === 1
              ? componentHashes[0]
              : await hashScreenshot(buildCompoundScreenshotHashInput(componentHashes));
          if (isDisposed) {
            return;
          }

          const latestStore = useTerminalStore.getState();
          const latestSessions = terminalIds
            .map((terminalId) => latestStore.sessions[terminalId])
            .filter((session): session is NonNullable<typeof session> => session !== undefined);
          if (latestSessions.length !== terminalIds.length) {
            continue;
          }

          const previousHash = previousHashes.get(tabRootTerminalId) ?? null;
          const tabSignature = terminalIds.join("|");
          const previousTabSignature = previousTabSignatures.get(tabRootTerminalId) ?? null;
          const isBaselineCapture =
            previousHash === null || previousTabSignature !== tabSignature;
          const changed = !isBaselineCapture && previousHash !== hash;
          const changedAt =
            changed || isBaselineCapture
              ? now
              : (lastChangedAt.get(tabRootTerminalId) ?? now);
          const lastUserInputAt = latestSessions.reduce(
            (maxTime, session) => Math.max(maxTime, session.lastUserInputAt ?? 0),
            0
          );
          const effectiveChangedAt = Math.max(changedAt, lastUserInputAt);
          const hasDetectedActivity =
            latestSessions.some((session) => session.hasDetectedActivity) || lastUserInputAt > 0;
          const acknowledgedTime = acknowledgedAt.get(tabRootTerminalId) ?? 0;
          const hasAcknowledgedCurrentOutput =
            hasDetectedActivity && acknowledgedTime >= effectiveChangedAt;
          const idleStartedAt = hasAcknowledgedCurrentOutput
            ? Math.max(effectiveChangedAt, acknowledgedTime)
            : effectiveChangedAt;
          const isActiveTab = activeTabRootTerminalId === tabRootTerminalId;
          if (changed && isActiveTab) {
            acknowledgedAt.set(tabRootTerminalId, now);
          }
          const isNeedsAttention =
            hasDetectedActivity &&
            !changed &&
            !hasAcknowledgedCurrentOutput &&
            now - effectiveChangedAt >= SCREENSHOT_INACTIVITY_MS;
          const isLongInactive =
            hasDetectedActivity &&
            !changed &&
            now - idleStartedAt >= SCREENSHOT_LONG_INACTIVITY_MS;
          const isPossiblyDone =
            hasDetectedActivity &&
            !changed &&
            !isNeedsAttention &&
            hasAcknowledgedCurrentOutput &&
            !isLongInactive &&
            now - idleStartedAt >= SCREENSHOT_INACTIVITY_MS;
          const shouldKeepAttentionUntilFocus = latestSessions.some(
            (session) => session.isNeedsAttention
          );
          const shouldKeepBrownUntilInput = latestSessions.some(
            (session) =>
              session.isPossiblyDone &&
              (session.lastUserInputAt ?? 0) <= acknowledgedTime
          );
          const shouldRevertToGreen = changed && !shouldKeepAttentionUntilFocus;
          const nextNeedsAttention = shouldKeepAttentionUntilFocus
            ? true
            : shouldRevertToGreen
              ? false
              : shouldKeepBrownUntilInput
                ? false
                : (isNeedsAttention && !isLongInactive);
          const nextPossiblyDone = shouldKeepAttentionUntilFocus
            ? false
            : shouldRevertToGreen
              ? false
              : shouldKeepBrownUntilInput
                ? !isLongInactive
                : isPossiblyDone;
          const nextLongInactive = nextNeedsAttention ? false : isLongInactive;

          previousHashes.set(tabRootTerminalId, hash);
          previousTabSignatures.set(tabRootTerminalId, tabSignature);
          lastChangedAt.set(tabRootTerminalId, changedAt);
          for (const terminalId of terminalIds) {
            store.setDetectedActivity(terminalId, hasDetectedActivity);
            store.setNeedsAttention(terminalId, nextNeedsAttention);
            store.setPossiblyDone(terminalId, nextPossiblyDone);
            store.setLongInactive(terminalId, nextLongInactive);
          }
          pushScreenshotDebug({
            terminalId: tabRootTerminalId,
            hash,
            previousHash,
            changed,
            hasDetectedActivity,
            isNeedsAttention: nextNeedsAttention,
            isPossiblyDone: nextPossiblyDone,
            isLongInactive: nextLongInactive,
            imageDataUrl: screenshots[0].screenshot,
            componentTerminalIds: terminalIds,
            componentHashes,
            componentImageDataUrls: screenshots.map(({ screenshot }) => screenshot),
          });
        }
      } finally {
        isSampling = false;
      }
    };

    const sampleAllTabs = async () => {
      const store = useTerminalStore.getState();
      const layouts = useLayoutStore.getState().layouts;
      const sessionIds = new Set(Object.keys(store.sessions));
      await sampleTabs(getTabRootTerminalIds(layouts, sessionIds));
    };

    const scheduleSample = (delayMs: number) => {
      const timeoutId = window.setTimeout(() => {
        scheduledSamples.delete(timeoutId);
        void sampleAllTabs();
      }, delayMs);
      scheduledSamples.add(timeoutId);
    };

    void sampleAllTabs();
    scheduleSample(500);
    scheduleSample(1500);
    acknowledgeTab(getActiveTabRootTerminalId(), new Set(Object.keys(useTerminalStore.getState().sessions)), Date.now());

    let lastSessionSignature = Object.keys(useTerminalStore.getState().sessions).sort().join("|");
    const unsubscribeSessions = useTerminalStore.subscribe((state) => {
      const nextSignature = Object.keys(state.sessions).sort().join("|");
      if (nextSignature === lastSessionSignature) {
        return;
      }

      lastSessionSignature = nextSignature;
      scheduleSample(0);
      scheduleSample(500);
    });
    const unsubscribeActiveTerminal = useTerminalStore.subscribe((state, previousState) => {
      if (state.activeTerminalId === previousState.activeTerminalId) {
        return;
      }

      const now = Date.now();
      acknowledgeTab(getActiveTabRootTerminalId(), new Set(Object.keys(state.sessions)), now);
    });

    const intervalId = window.setInterval(() => {
      void sampleAllTabs();
    }, SCREENSHOT_INTERVAL_MS);

    return () => {
      isDisposed = true;
      unsubscribeSessions();
      unsubscribeActiveTerminal();
      window.clearInterval(intervalId);
      for (const timeoutId of scheduledSamples) {
        window.clearTimeout(timeoutId);
      }
      scheduledSamples.clear();
    };
  }, []);
}
