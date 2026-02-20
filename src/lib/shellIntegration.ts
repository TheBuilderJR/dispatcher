import { useTerminalStore } from "../stores/useTerminalStore";

export const OSC_RE = /\x1b\]7770;([^\x07]*)\x07/g;

const ANSI_CSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * Heuristic: does the last non-empty line of `data` look like a shell prompt?
 * Matches endings like `$ `, `# `, `% `, `> ` — but NOT auth prompts that
 * typically end with `: ` or `? `.  ANSI color/style sequences are stripped
 * before testing so colored prompts are detected correctly.
 */
export function looksLikeShellPrompt(data: string): boolean {
  const clean = data.replace(ANSI_CSI_RE, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return false;
  return /[#$%>]\s*$/.test(lines[lines.length - 1]);
}

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
