import { debugLog, debugLogError } from "./debugLog";
import {
  rendererHeartbeat,
  type RendererHeartbeatDetails,
} from "./tauriCommands";
import { useTerminalStore } from "../stores/useTerminalStore";

const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_FAILURE_LOG_INTERVAL_MS = 30_000;

let started = false;
let sequence = 0;
let heartbeatInFlight = false;
let skippedHeartbeatCount = 0;
let lastFailureLogAt = 0;

export function collectRendererHeartbeatDetails(
  nextSequence: number,
  reason: string,
  skippedCount: number = skippedHeartbeatCount
): RendererHeartbeatDetails {
  const terminalState = useTerminalStore.getState();
  const activeSession = terminalState.activeTerminalId
    ? terminalState.sessions[terminalState.activeTerminalId]
    : undefined;

  let localCount = 0;
  let tmuxTransportCount = 0;
  let tmuxWindowCount = 0;
  let tmuxPaneCount = 0;

  for (const session of Object.values(terminalState.sessions)) {
    if (session.backendKind === "tmux-transport") {
      tmuxTransportCount += 1;
    } else if (session.backendKind === "tmux-window") {
      tmuxWindowCount += 1;
    } else if (session.backendKind === "tmux-pane") {
      tmuxPaneCount += 1;
    } else {
      localCount += 1;
    }
  }

  return {
    sequence: nextSequence,
    reason,
    href: typeof window === "undefined" ? null : window.location.href,
    visibilityState:
      typeof document === "undefined" ? null : document.visibilityState,
    activeTerminalId: terminalState.activeTerminalId,
    activeTerminalBackendKind: activeSession?.backendKind ?? null,
    sessionCount: Object.keys(terminalState.sessions).length,
    localCount,
    tmuxTransportCount,
    tmuxWindowCount,
    tmuxPaneCount,
    skippedHeartbeatCount: skippedCount,
  };
}

function sendRendererHeartbeat(reason: string) {
  if (heartbeatInFlight) {
    skippedHeartbeatCount += 1;
    return;
  }

  heartbeatInFlight = true;
  const details = collectRendererHeartbeatDetails(
    sequence + 1,
    reason,
    skippedHeartbeatCount
  );
  sequence = details.sequence;
  skippedHeartbeatCount = 0;

  void rendererHeartbeat(details)
    .catch((error) => {
      const now = Date.now();
      if (now - lastFailureLogAt >= HEARTBEAT_FAILURE_LOG_INTERVAL_MS) {
        lastFailureLogAt = now;
        debugLogError("app.heartbeat", "renderer heartbeat failed", error);
      }
    })
    .finally(() => {
      heartbeatInFlight = false;
    });
}

function logLifecycleEvent(message: string, details?: unknown) {
  debugLog("app.runtime", message, details);
  sendRendererHeartbeat(message);
}

export function startRendererHeartbeat() {
  if (started || typeof window === "undefined") {
    return;
  }

  started = true;
  sendRendererHeartbeat("startup");
  window.setInterval(() => {
    sendRendererHeartbeat("interval");
  }, HEARTBEAT_INTERVAL_MS);

  document.addEventListener("visibilitychange", () => {
    logLifecycleEvent("visibilitychange", {
      visibilityState: document.visibilityState,
    });
  });

  window.addEventListener("focus", () => {
    logLifecycleEvent("window focus", {
      visibilityState: document.visibilityState,
    });
  });

  window.addEventListener("blur", () => {
    logLifecycleEvent("window blur", {
      visibilityState: document.visibilityState,
    });
  });

  window.addEventListener("pagehide", (event) => {
    logLifecycleEvent("pagehide", {
      persisted: event.persisted,
      visibilityState: document.visibilityState,
    });
  });

  window.addEventListener("pageshow", (event) => {
    logLifecycleEvent("pageshow", {
      persisted: event.persisted,
      visibilityState: document.visibilityState,
    });
  });

  window.addEventListener("freeze", () => {
    logLifecycleEvent("page freeze", {
      visibilityState: document.visibilityState,
    });
  });

  document.addEventListener("resume", () => {
    logLifecycleEvent("page resume", {
      visibilityState: document.visibilityState,
    });
  });
}
