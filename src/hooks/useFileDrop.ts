import { useEffect } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { writeTerminal } from "../lib/tauriCommands";

function shellEscape(path: string): string {
  return "'" + path.replace(/'/g, "'\\''") + "'";
}

function findTerminalPane(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y);
  return el?.closest<HTMLElement>("[data-terminal-id]") ?? null;
}

function clearHighlight() {
  document
    .querySelectorAll(".terminal-drop-target")
    .forEach((el) => el.classList.remove("terminal-drop-target"));
}

export function useFileDrop() {
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "enter" || event.payload.type === "over") {
        clearHighlight();
        const { x, y } = event.payload.position;
        const pane = findTerminalPane(x, y);
        if (pane) {
          pane.classList.add("terminal-drop-target");
        }
      } else if (event.payload.type === "leave") {
        clearHighlight();
      } else if (event.payload.type === "drop") {
        clearHighlight();
        const { x, y } = event.payload.position;
        const pane = findTerminalPane(x, y);
        if (pane) {
          const terminalId = pane.dataset.terminalId;
          if (terminalId && event.payload.paths.length > 0) {
            const escaped = event.payload.paths.map(shellEscape).join(" ");
            writeTerminal(terminalId, escaped).catch(() => {});
          }
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
