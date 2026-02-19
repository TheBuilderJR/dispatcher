import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface TerminalExitPayload {
  terminal_id: string;
  exit_code: number | null;
}

export function onTerminalExit(
  callback: (payload: TerminalExitPayload) => void
): Promise<UnlistenFn> {
  return listen<TerminalExitPayload>("terminal-exit", (event) => {
    callback(event.payload);
  });
}
