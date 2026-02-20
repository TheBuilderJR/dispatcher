import { describe, it, expect, beforeEach } from "vitest";
import { parseShellIntegration, looksLikeShellPrompt, isRemoteShellCommand } from "../shellIntegration";
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

// ---------------------------------------------------------------------------
// OSC partial reassembly — replicates the logic from useTerminalBridge.ts
// channel.onmessage so we can test it without the hook/DOM.
// ---------------------------------------------------------------------------

describe("OSC partial reassembly", () => {
  const TERM_ID = "partial-test";
  const oscPartials = new Map<string, string>();

  function processChunk(data: string): string {
    let d = data;
    const partial = oscPartials.get(TERM_ID);
    if (partial) {
      d = partial + d;
      oscPartials.delete(TERM_ID);
    }
    const lastOsc = d.lastIndexOf("\x1b]7770;");
    if (lastOsc !== -1 && d.indexOf("\x07", lastOsc) === -1) {
      oscPartials.set(TERM_ID, d.substring(lastOsc));
      d = d.substring(0, lastOsc);
      if (!d) return "";
    }
    return parseShellIntegration(TERM_ID, d);
  }

  beforeEach(() => {
    oscPartials.clear();
    useTerminalStore.getState().addSession(TERM_ID, "Test");
  });

  it("reassembles a split preexec OSC across two chunks", () => {
    // Chunk 1: starts the OSC but no BEL terminator
    const chunk1 = "output\x1b]7770;pre";
    const result1 = processChunk(chunk1);
    expect(result1).toBe("output");
    expect(oscPartials.has(TERM_ID)).toBe(true);

    // Chunk 2: completes the OSC
    const chunk2 = "exec\x07more output";
    const result2 = processChunk(chunk2);
    expect(result2).toBe("more output");
    expect(useTerminalStore.getState().sessions[TERM_ID].status).toBe("running");
  });

  it("reassembles a split precmd OSC across two chunks", () => {
    const chunk1 = "\x1b]7770;precmd;";
    const result1 = processChunk(chunk1);
    expect(result1).toBe("");

    const chunk2 = "0\x07prompt$ ";
    const result2 = processChunk(chunk2);
    expect(result2).toBe("prompt$ ");
    expect(useTerminalStore.getState().sessions[TERM_ID].status).toBe("done");
    expect(useTerminalStore.getState().sessions[TERM_ID].exitCode).toBe(0);
  });

  it("handles complete OSC in a single chunk (no partial)", () => {
    const chunk = "before\x1b]7770;preexec\x07after";
    const result = processChunk(chunk);
    expect(result).toBe("beforeafter");
    expect(oscPartials.has(TERM_ID)).toBe(false);
  });

  it("handles chunk that is entirely a partial OSC", () => {
    const chunk1 = "\x1b]7770;preexec";
    const result1 = processChunk(chunk1);
    expect(result1).toBe("");

    const chunk2 = "\x07";
    const result2 = processChunk(chunk2);
    expect(result2).toBe("");
    expect(useTerminalStore.getState().sessions[TERM_ID].status).toBe("running");
  });

  it("complete OSC followed by partial OSC in same chunk", () => {
    const chunk1 = "\x1b]7770;preexec\x07output\x1b]7770;precmd;";
    const result1 = processChunk(chunk1);
    expect(result1).toBe("output");
    expect(useTerminalStore.getState().sessions[TERM_ID].status).toBe("running");

    const chunk2 = "1\x07";
    const result2 = processChunk(chunk2);
    expect(result2).toBe("");
    expect(useTerminalStore.getState().sessions[TERM_ID].status).toBe("error");
    expect(useTerminalStore.getState().sessions[TERM_ID].exitCode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// looksLikeShellPrompt — heuristic for detecting remote shell prompts vs
// authentication prompts (Duo, password, etc.).
// ---------------------------------------------------------------------------

describe("looksLikeShellPrompt", () => {
  // Should match: common shell prompts
  it("detects bash-style prompt ending with $", () => {
    expect(looksLikeShellPrompt("[bobren@devgpu009 ~]$ ")).toBe(true);
  });

  it("detects root prompt ending with #", () => {
    expect(looksLikeShellPrompt("root@host:~# ")).toBe(true);
  });

  it("detects zsh prompt ending with %", () => {
    expect(looksLikeShellPrompt("bobren@mac ~ % ")).toBe(true);
  });

  it("detects continuation prompt ending with >", () => {
    expect(looksLikeShellPrompt("> ")).toBe(true);
  });

  it("detects prompt with trailing whitespace", () => {
    expect(looksLikeShellPrompt("user@host:~$  ")).toBe(true);
  });

  it("detects prompt with ANSI color codes", () => {
    expect(
      looksLikeShellPrompt(
        "\x1b[01;32muser@host\x1b[00m:\x1b[01;34m~\x1b[00m$ ",
      ),
    ).toBe(true);
  });

  it("detects prompt after multi-line MOTD", () => {
    expect(
      looksLikeShellPrompt("Welcome to Ubuntu 22.04\r\nLast login: ...\r\nuser@host:~$ "),
    ).toBe(true);
  });

  // Should NOT match: authentication/password prompts
  it("rejects Duo passcode prompt", () => {
    expect(looksLikeShellPrompt("Passcode or option (1-2): ")).toBe(false);
  });

  it("rejects password prompt", () => {
    expect(looksLikeShellPrompt("Password: ")).toBe(false);
  });

  it("rejects generic auth prompt", () => {
    expect(looksLikeShellPrompt("Enter passphrase for key: ")).toBe(false);
  });

  it("rejects empty / whitespace-only data", () => {
    expect(looksLikeShellPrompt("")).toBe(false);
    expect(looksLikeShellPrompt("   \n  \n")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isRemoteShellCommand — gate hook re-injection on SSH/et/mosh commands only.
// ---------------------------------------------------------------------------

describe("isRemoteShellCommand", () => {
  // Should match
  it("detects ssh", () => {
    expect(isRemoteShellCommand("ssh host")).toBe(true);
  });

  it("detects ssh with user@host", () => {
    expect(isRemoteShellCommand("ssh user@host")).toBe(true);
  });

  it("detects ssh with flags", () => {
    expect(isRemoteShellCommand("ssh -p 2222 user@host")).toBe(true);
  });

  it("detects et (Eternal Terminal)", () => {
    expect(isRemoteShellCommand("et host")).toBe(true);
  });

  it("detects mosh", () => {
    expect(isRemoteShellCommand("mosh user@host")).toBe(true);
  });

  it("detects with leading whitespace", () => {
    expect(isRemoteShellCommand("  ssh host")).toBe(true);
  });

  // Should NOT match
  it("rejects claude", () => {
    expect(isRemoteShellCommand("claude")).toBe(false);
  });

  it("rejects vim", () => {
    expect(isRemoteShellCommand("vim file.txt")).toBe(false);
  });

  it("rejects ls", () => {
    expect(isRemoteShellCommand("ls -la")).toBe(false);
  });

  it("rejects sshfs (not ssh itself)", () => {
    expect(isRemoteShellCommand("sshfs host:/path /mnt")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isRemoteShellCommand("")).toBe(false);
  });
});
