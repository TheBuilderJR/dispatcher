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

/** Dispose an xterm instance and its PTY tracking when a terminal is truly closed. */
export function disposeTerminalInstance(terminalId: string) {
  const inst = instances.get(terminalId);
  if (inst) {
    inst.xterm.dispose();
    instances.delete(terminalId);
  }
  createdPtys.delete(terminalId);
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

      // Try WebGL, fall back to canvas
      try {
        const webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => webglAddon.dispose());
        xterm.loadAddon(webglAddon);
      } catch {
        // Canvas fallback is automatic
      }

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
      i.xterm.focus();

      // Create the backend PTY exactly once per terminalId.
      if (!createdPtys.has(terminalId)) {
        createdPtys.add(terminalId);

        const channel = new Channel<TerminalOutputPayload>();
        channel.onmessage = (msg) => {
          // Write to the persistent xterm instance (not the ref, which may
          // be null between unmount/remount).
          instances.get(msg.terminal_id)?.xterm.write(msg.data);
        };

        const cols = i.xterm.cols;
        const rows = i.xterm.rows;

        createPty(terminalId, channel, cwd, cols, rows)
          .then(() => warmPool(1).catch(() => {}))
          .catch((err) => {
            i.xterm.write(`\r\nError creating terminal: ${err}\r\n`);
          });
      }
    });

    // Forward user input to PTY
    const dataDisposable = inst.xterm.onData((data) => {
      writeTerminal(terminalId, data).catch(() => {});
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
        i.fitAddon.fit();
      }
    });

    return () => {
      cancelAnimationFrame(rafId);
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

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  return { containerRef, xtermRef, fitAddonRef, searchAddonRef, fit };
}
