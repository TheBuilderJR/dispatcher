import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebglAddon } from "@xterm/addon-webgl";
import { Channel } from "@tauri-apps/api/core";
import {
  createTerminal as createPty,
  writeTerminal,
  resizeTerminal,
  warmPool,
} from "../lib/tauriCommands";
import type { TerminalOutputPayload } from "../lib/tauriCommands";
import { useFontSizeStore } from "../stores/useFontSizeStore";
import { useTerminalStore } from "../stores/useTerminalStore";
import { parseShellIntegration, OSC_RE, looksLikeShellPrompt } from "../lib/shellIntegration";

// ---------------------------------------------------------------------------
// Shell integration — hook injection + unhooked sub-shell detection
// ---------------------------------------------------------------------------

// Per-terminal state for detecting unhooked sub-shells (SSH, nested shells).
interface HookState {
  /** A command is running (preexec fired, precmd hasn't yet). */
  commandRunning: boolean;
  /** Timestamp of the most recent preexec. */
  lastPreexecTime: number;
  /** Whether we already attempted re-injection during the current command. */
  reinjectionAttempted: boolean;
  /** Total re-injection attempts since the last successful OSC reception. */
  reinjectionCount: number;
  /** Whether we're waiting for an OSC after the user pressed Enter. */
  awaitingOsc: boolean;
  /** Timer for the OSC wait. */
  checkTimer: ReturnType<typeof setTimeout> | null;
  /** Timer to verify re-injection succeeded (OSC received after inject). */
  verificationTimer: ReturnType<typeof setTimeout> | null;
  /** Timer that fires when PTY output has settled (no new data for 1 s). */
  quietTimer: ReturnType<typeof setTimeout> | null;
}

const hookStates = new Map<string, HookState>();

function getHookState(terminalId: string): HookState {
  let s = hookStates.get(terminalId);
  if (!s) {
    s = {
      commandRunning: false,
      lastPreexecTime: 0,
      reinjectionAttempted: false,
      reinjectionCount: 0,
      awaitingOsc: false,
      checkTimer: null,
      verificationTimer: null,
      quietTimer: null,
    };
    hookStates.set(terminalId, s);
  }
  return s;
}

/**
 * Wraps parseShellIntegration with hook-state tracking for re-injection
 * detection. Updates commandRunning / awaitingOsc state on every OSC seen.
 */
function parseShellIntegrationWithHookState(terminalId: string, data: string): string {
  // First, update hook state for every OSC found in the data.
  const oscPattern = new RegExp(OSC_RE.source, "g");
  let match: RegExpExecArray | null;
  let oscFound = false;
  while ((match = oscPattern.exec(data)) !== null) {
    oscFound = true;
    const hs = getHookState(terminalId);
    hs.awaitingOsc = false;
    if (hs.checkTimer) {
      clearTimeout(hs.checkTimer);
      hs.checkTimer = null;
    }
    // OSC received — hooks are working. Cancel any pending timers
    // and reset re-injection state so future SSH sessions can re-inject.
    if (hs.verificationTimer) {
      clearTimeout(hs.verificationTimer);
      hs.verificationTimer = null;
    }
    if (hs.quietTimer) {
      clearTimeout(hs.quietTimer);
      hs.quietTimer = null;
    }
    hs.reinjectionAttempted = false;
    hs.reinjectionCount = 0;

    const payload = match[1];
    if (payload === "preexec") {
      hs.commandRunning = true;
      hs.lastPreexecTime = Date.now();
    } else if (payload.startsWith("precmd;")) {
      hs.commandRunning = false;
    }
  }

  // Auto-detect unhooked sub-shells from PTY output alone (no Enter needed).
  // When a command has been running 2+ seconds and we see output WITHOUT any
  // OSC sequences AND the output looks like a shell prompt (ends with $ # % >),
  // start a 1.5-second "quiet timer".  When output settles the timer fires and
  // injects hooks automatically — before the user types anything.
  // The prompt heuristic avoids false positives during SSH authentication
  // (e.g. Duo prompts ending with ": ").
  if (!oscFound) {
    const hs = getHookState(terminalId);
    if (
      hs.commandRunning &&
      !hs.reinjectionAttempted &&
      hs.reinjectionCount < 3 &&
      Date.now() - hs.lastPreexecTime >= 2000 &&
      looksLikeShellPrompt(data)
    ) {
      if (hs.quietTimer) clearTimeout(hs.quietTimer);
      hs.quietTimer = setTimeout(() => {
        hs.quietTimer = null;
        if (hs.commandRunning && !hs.reinjectionAttempted) {
          hs.reinjectionAttempted = true;
          hs.reinjectionCount++;
          injectShellIntegration(terminalId, true);

          if (hs.verificationTimer) clearTimeout(hs.verificationTimer);
          hs.verificationTimer = setTimeout(() => {
            hs.verificationTimer = null;
            if (hs.reinjectionAttempted) {
              hs.reinjectionAttempted = false;
            }
          }, 3000);
        }
      }, 1500);
    }
  }

  // Then delegate to the pure parsing function for store updates + stripping.
  return parseShellIntegration(terminalId, data);
}

/**
 * Called when the user presses Enter. If a local command has been running for
 * a while (e.g. SSH), the user is likely in a sub-shell without hooks. Wait
 * briefly for an OSC preexec — if none arrives, re-inject hooks.
 */
function checkForUnhookedShell(terminalId: string) {
  const hs = getHookState(terminalId);
  if (
    !hs.commandRunning ||
    hs.reinjectionAttempted ||
    hs.reinjectionCount >= 3 ||
    Date.now() - hs.lastPreexecTime < 2000
  ) {
    return;
  }

  // Cancel quiet-timer — Enter-based detection takes priority.
  if (hs.quietTimer) {
    clearTimeout(hs.quietTimer);
    hs.quietTimer = null;
  }

  hs.awaitingOsc = true;
  if (hs.checkTimer) clearTimeout(hs.checkTimer);
  hs.checkTimer = setTimeout(() => {
    hs.checkTimer = null;
    if (hs.awaitingOsc) {
      hs.awaitingOsc = false;
      hs.reinjectionAttempted = true;
      hs.reinjectionCount++;
      injectShellIntegration(terminalId, true);

      // Verify re-injection worked: if no OSC arrives within 3 seconds,
      // allow another attempt on the next Enter press (up to the max).
      if (hs.verificationTimer) clearTimeout(hs.verificationTimer);
      hs.verificationTimer = setTimeout(() => {
        hs.verificationTimer = null;
        if (hs.reinjectionAttempted) {
          hs.reinjectionAttempted = false;
        }
      }, 3000);
    }
  }, 500);
}

// The hook script as a single line (no PS2 continuation prompts).
// zsh: register via precmd_functions / preexec_functions arrays.
// bash: prepend PROMPT_COMMAND + DEBUG trap with a __dp_prompt_shown
//   guard to prevent spurious preexec during PROMPT_COMMAND.
const HOOK_SCRIPT = [
  'if [ -n "$ZSH_VERSION" ]; then',
  '__dp_precmd() { printf "\\033]7770;precmd;%d\\007" "$?"; };',
  '__dp_preexec() { printf "\\033]7770;preexec\\007"; };',
  "precmd_functions+=(__dp_precmd);",
  "preexec_functions+=(__dp_preexec);",
  'elif [ -n "$BASH_VERSION" ]; then',
  '__dp_precmd() { local ec=$?; printf "\\033]7770;precmd;%d\\007" "$ec"; return $ec; };',
  '__dp_preexec() { local ec=$?; if [ "$__dp_prompt_shown" = 1 ]; then __dp_prompt_shown=0; printf "\\033]7770;preexec\\007"; fi; return $ec; };',
  'PROMPT_COMMAND="__dp_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND};__dp_prompt_shown=1";',
  "trap '__dp_preexec' DEBUG;",
  "fi",
].join(" ");

/**
 * Inject precmd/preexec shell hooks that emit OSC 7770 sequences.
 * @param showMessage — true for re-injection (echo a visible message,
 *   don't clear the screen), false for initial injection (silent + clear).
 */
function injectShellIntegration(terminalId: string, showMessage = false) {
  if (showMessage) {
    // Re-injection (SSH / nested shell): be transparent — show a message,
    // install hooks, and leave the terminal output untouched.
    // Leading space keeps it out of shell history.
    writeTerminal(
      terminalId,
      ` echo '--- Setting up Dispatcher hooks ---'; ${HOOK_SCRIPT}\n`,
    ).catch(() => {});
  } else {
    // Initial injection: suppress echo and clear for a clean slate.
    writeTerminal(terminalId, " stty -echo 2>/dev/null\n").catch(() => {});
    setTimeout(() => {
      writeTerminal(
        terminalId,
        ` ${HOOK_SCRIPT}; stty echo 2>/dev/null; clear\n`,
      ).catch(() => {});
    }, 100);
  }
}

// Per-terminal buffer for partial OSC 7770 sequences split across PTY chunks
// (common over SSH where network packets fragment the data).
const oscPartials = new Map<string, string>();

// ---------------------------------------------------------------------------
// Persistent terminal instances — survive React remounts caused by layout
// tree restructuring (e.g. closing a sibling pane).
// ---------------------------------------------------------------------------

interface TerminalInstance {
  xterm: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  /** The DOM element xterm is rendered into. We move this between mount points. */
  element: HTMLDivElement;
}

const instances = new Map<string, TerminalInstance>();
const createdPtys = new Set<string>();

// ---------------------------------------------------------------------------
// Write batching — coalesce PTY output per animation frame so xterm.js
// renders once instead of on every 4096-byte IPC chunk.
// ---------------------------------------------------------------------------

const writeBuffers = new Map<string, string[]>();
const writeRafs = new Map<string, number>();

function batchedWrite(terminalId: string, data: string) {
  let buffer = writeBuffers.get(terminalId);
  if (!buffer) {
    buffer = [];
    writeBuffers.set(terminalId, buffer);
  }
  buffer.push(data);

  if (!writeRafs.has(terminalId)) {
    const rafId = requestAnimationFrame(() => {
      writeRafs.delete(terminalId);
      const buf = writeBuffers.get(terminalId);
      if (buf && buf.length > 0) {
        const combined = buf.join("");
        buf.length = 0;
        instances.get(terminalId)?.xterm.write(combined);
      }
    });
    writeRafs.set(terminalId, rafId);
  }
}

function disposeWriteBatch(terminalId: string) {
  const rafId = writeRafs.get(terminalId);
  if (rafId !== undefined) {
    cancelAnimationFrame(rafId);
    writeRafs.delete(terminalId);
  }
  writeBuffers.delete(terminalId);
}

// ---------------------------------------------------------------------------
// WebGL addon — load with automatic recovery on context loss.
// ---------------------------------------------------------------------------

function loadWebGLAddon(xterm: Terminal) {
  try {
    const addon = new WebglAddon();
    addon.onContextLoss(() => {
      addon.dispose();
      // Re-attempt WebGL after a short delay; falls back to canvas in the interim.
      setTimeout(() => loadWebGLAddon(xterm), 500);
    });
    xterm.loadAddon(addon);
  } catch {
    // Canvas fallback is automatic
  }
}

/** Dispose an xterm instance and its PTY tracking when a terminal is truly closed. */
export function disposeTerminalInstance(terminalId: string) {
  const hs = hookStates.get(terminalId);
  if (hs?.checkTimer) clearTimeout(hs.checkTimer);
  if (hs?.verificationTimer) clearTimeout(hs.verificationTimer);
  if (hs?.quietTimer) clearTimeout(hs.quietTimer);
  hookStates.delete(terminalId);
  oscPartials.delete(terminalId);

  const inst = instances.get(terminalId);
  if (inst) {
    inst.xterm.dispose();
    instances.delete(terminalId);
  }
  createdPtys.delete(terminalId);
  disposeWriteBatch(terminalId);
}

// ---------------------------------------------------------------------------

interface UseTerminalBridgeOptions {
  terminalId: string;
  cwd?: string;
}

export function useTerminalBridge({ terminalId, cwd }: UseTerminalBridgeOptions) {
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pendingFitRef = useRef<number>(0);

  useEffect(() => {
    const mountPoint = containerRef.current;
    if (!mountPoint) return;

    // Re-use an existing instance or create a fresh one.
    let inst = instances.get(terminalId);

    if (!inst) {
      const element = document.createElement("div");
      element.style.width = "100%";
      element.style.height = "100%";

      const xterm = new Terminal({
        cursorBlink: true,
        fontSize: useFontSizeStore.getState().fontSize,
        fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
        theme: {
          background: "#0a0a0a",
          foreground: "#ededed",
          cursor: "#ffffff",
          selectionBackground: "#333333",
          black: "#000000",
          red: "#ff3333",
          green: "#00c853",
          yellow: "#ffcc00",
          blue: "#0070f3",
          magenta: "#a855f7",
          cyan: "#06b6d4",
          white: "#ededed",
          brightBlack: "#666666",
          brightRed: "#ff5555",
          brightGreen: "#50fa7b",
          brightYellow: "#f1fa8c",
          brightBlue: "#6cb6ff",
          brightMagenta: "#d183e8",
          brightCyan: "#8be9fd",
          brightWhite: "#ffffff",
        },
        scrollback: 10000,
        allowProposedApi: true,
      });

      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);

      const searchAddon = new SearchAddon();
      xterm.loadAddon(searchAddon);

      xterm.open(element);

      // Try WebGL with automatic recovery on context loss
      loadWebGLAddon(xterm);

      // Handle Cmd+key shortcuts that xterm.js ignores by default
      xterm.attachCustomKeyEventHandler((e) => {
        if (e.type !== "keydown") return true;

        // Cmd+K: clear terminal scrollback
        if (e.metaKey && e.key === "k") {
          e.preventDefault();
          xterm.clear();
          return false;
        }

        // App-level shortcuts — let them bubble to the global handler
        if (e.metaKey && ["t", "n", "d", "w", "f", "=", "-", "0"].includes(e.key)) {
          return false;
        }
        // Cycle terminals: Cmd+Shift+[ / Cmd+Shift+]
        if (e.metaKey && e.shiftKey && (e.code === "BracketLeft" || e.code === "BracketRight")) {
          return false;
        }

        return true;
      });

      inst = { xterm, fitAddon, searchAddon, element };
      instances.set(terminalId, inst);
    }

    // Attach the persistent element to the current mount point.
    mountPoint.appendChild(inst.element);

    xtermRef.current = inst.xterm;
    fitAddonRef.current = inst.fitAddon;
    searchAddonRef.current = inst.searchAddon;

    // Defer fit() to the next animation frame so the browser has laid out the
    // container and fit() can measure accurate dimensions.  Without this, the
    // container may report 0/stale size right after appendChild, causing the
    // PTY to be created with wrong cols/rows — which leads to garbled output
    // whenever the running program uses cursor positioning (e.g. Claude Code).
    const rafId = requestAnimationFrame(() => {
      const i = instances.get(terminalId);
      if (!i) return;

      i.fitAddon.fit();
      // Only steal DOM focus if this terminal is the active one.
      // Without this guard, every pane calls focus() on mount and
      // the last-rendered pane wins — breaking focus restoration.
      if (useTerminalStore.getState().activeTerminalId === terminalId) {
        i.xterm.focus();
      }

      // Create the backend PTY exactly once per terminalId.
      if (!createdPtys.has(terminalId)) {
        createdPtys.add(terminalId);

        const channel = new Channel<TerminalOutputPayload>();
        channel.onmessage = (msg) => {
          let data = msg.data;
          const tid = msg.terminal_id;

          // Reassemble partial OSC 7770 sequences split across chunks.
          const partial = oscPartials.get(tid);
          if (partial) {
            data = partial + data;
            oscPartials.delete(tid);
          }
          const lastOsc = data.lastIndexOf("\x1b]7770;");
          if (lastOsc !== -1 && data.indexOf("\x07", lastOsc) === -1) {
            oscPartials.set(tid, data.substring(lastOsc));
            data = data.substring(0, lastOsc);
            if (!data) return;
          }

          const cleaned = parseShellIntegrationWithHookState(tid, data);
          if (cleaned) batchedWrite(tid, cleaned);
        };

        const cols = i.xterm.cols;
        const rows = i.xterm.rows;

        createPty(terminalId, channel, cwd, cols, rows)
          .then(() => {
            injectShellIntegration(terminalId);
            warmPool(1).catch(() => {});
          })
          .catch((err) => {
            i.xterm.write(`\r\nError creating terminal: ${err}\r\n`);
          });
      }
    });

    // Forward user input to PTY
    const dataDisposable = inst.xterm.onData((data) => {
      writeTerminal(terminalId, data).catch(() => {});
      // Detect Enter — may trigger re-injection into unhooked sub-shells.
      if (data.includes("\r") || data.includes("\n")) {
        checkForUnhookedShell(terminalId);
      }
    });

    // Handle resize
    const resizeDisposable = inst.xterm.onResize(({ cols, rows }) => {
      resizeTerminal(terminalId, cols, rows).catch(() => {});
    });

    // Sync font size from store whenever it changes
    const unsubFontSize = useFontSizeStore.subscribe((state) => {
      const i = instances.get(terminalId);
      if (i) {
        i.xterm.options.fontSize = state.fontSize;
        cancelAnimationFrame(pendingFitRef.current);
        pendingFitRef.current = requestAnimationFrame(() => {
          i.fitAddon.fit();
        });
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(pendingFitRef.current);
      unsubFontSize();
      dataDisposable.dispose();
      resizeDisposable.dispose();

      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;

      // Detach the element from the DOM but do NOT dispose the xterm.
      // It will be re-attached if the component remounts (layout change).
      if (mountPoint.contains(inst!.element)) {
        mountPoint.removeChild(inst!.element);
      }
    };
  }, [terminalId]); // cwd intentionally omitted — only used for initial PTY creation

  // Debounced fit — coalesces rapid resize events (from ResizeObserver during
  // window/split-pane drag) into a single fit() per animation frame.
  const fit = useCallback(() => {
    cancelAnimationFrame(pendingFitRef.current);
    pendingFitRef.current = requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
    });
  }, []);

  return { containerRef, xtermRef, fitAddonRef, searchAddonRef, fit };
}
