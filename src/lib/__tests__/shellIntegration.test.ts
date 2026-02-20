import { describe, it, expect, beforeEach } from "vitest";
import { parseShellIntegration } from "../shellIntegration";
import { useTerminalStore } from "../../stores/useTerminalStore";

describe("parseShellIntegration", () => {
  const TERM_ID = "shell-test";

  beforeEach(() => {
    useTerminalStore.getState().addSession(TERM_ID, "Test");
  });

  it("strips preexec OSC and sets status to running", () => {
    const input = "before\x1b]7770;preexec\x07after";
    const result = parseShellIntegration(TERM_ID, input);
    expect(result).toBe("beforeafter");
    expect(useTerminalStore.getState().sessions[TERM_ID].status).toBe("running");
  });

  it("strips precmd;0 and sets status to done", () => {
    const input = "output\x1b]7770;precmd;0\x07";
    const result = parseShellIntegration(TERM_ID, input);
    expect(result).toBe("output");
    const session = useTerminalStore.getState().sessions[TERM_ID];
    expect(session.status).toBe("done");
    expect(session.exitCode).toBe(0);
  });

  it("strips precmd;1 and sets status to error", () => {
    const input = "\x1b]7770;precmd;1\x07";
    const result = parseShellIntegration(TERM_ID, input);
    expect(result).toBe("");
    const session = useTerminalStore.getState().sessions[TERM_ID];
    expect(session.status).toBe("error");
    expect(session.exitCode).toBe(1);
  });

  it("handles precmd;127 (command not found)", () => {
    const input = "\x1b]7770;precmd;127\x07";
    const result = parseShellIntegration(TERM_ID, input);
    expect(result).toBe("");
    const session = useTerminalStore.getState().sessions[TERM_ID];
    expect(session.status).toBe("error");
    expect(session.exitCode).toBe(127);
  });

  it("multiple OSC sequences in one chunk", () => {
    const input = "\x1b]7770;preexec\x07ls output\x1b]7770;precmd;0\x07";
    const result = parseShellIntegration(TERM_ID, input);
    expect(result).toBe("ls output");
    // Last status wins
    const session = useTerminalStore.getState().sessions[TERM_ID];
    expect(session.status).toBe("done");
    expect(session.exitCode).toBe(0);
  });

  it("no OSC sequences → passthrough", () => {
    const input = "plain terminal output\r\n";
    const result = parseShellIntegration(TERM_ID, input);
    expect(result).toBe(input);
  });

  it("empty string → empty string", () => {
    expect(parseShellIntegration(TERM_ID, "")).toBe("");
  });
});
