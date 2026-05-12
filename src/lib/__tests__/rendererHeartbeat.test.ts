import { describe, expect, it } from "vitest";
import { collectRendererHeartbeatDetails } from "../rendererHeartbeat";
import { useTerminalStore } from "../../stores/useTerminalStore";
import type { TerminalBackendKind, TerminalSession } from "../../types/terminal";

function session(
  id: string,
  backendKind: TerminalBackendKind
): TerminalSession {
  return {
    id,
    title: id,
    notes: "",
    hasDetectedActivity: false,
    lastUserInputAt: 0,
    lastOutputAt: 0,
    isNeedsAttention: false,
    isPossiblyDone: false,
    isLongInactive: false,
    isRecentlyFocused: false,
    backendKind,
  };
}

describe("rendererHeartbeat", () => {
  it("summarizes renderer and terminal state for native crash diagnostics", () => {
    useTerminalStore.setState({
      activeTerminalId: "pane",
      sessions: {
        local: session("local", "local"),
        transport: session("transport", "tmux-transport"),
        window: session("window", "tmux-window"),
        pane: session("pane", "tmux-pane"),
      },
    });

    expect(collectRendererHeartbeatDetails(7, "unit-test", 3)).toMatchObject({
      sequence: 7,
      reason: "unit-test",
      activeTerminalId: "pane",
      activeTerminalBackendKind: "tmux-pane",
      sessionCount: 4,
      localCount: 1,
      tmuxTransportCount: 1,
      tmuxWindowCount: 1,
      tmuxPaneCount: 1,
      skippedHeartbeatCount: 3,
    });
  });
});
