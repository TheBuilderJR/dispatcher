import { useTerminalStore } from "../stores/useTerminalStore";

export const OSC_RE = /\x1b\]7770;([^\x07]*)\x07/g;

/** Strip OSC 7770 sequences from PTY output and update terminal status. */
export function parseShellIntegration(terminalId: string, data: string): string {
  return data.replace(OSC_RE, (_, payload: string) => {
    if (payload === "preexec") {
      useTerminalStore.getState().updateStatus(terminalId, "running");
    } else if (payload.startsWith("precmd;")) {
      const code = parseInt(payload.slice(7), 10);
      const status = code === 0 ? "done" : "error";
      useTerminalStore.getState().updateStatus(terminalId, status, code);
    }
    return ""; // strip from terminal output
  });
}
