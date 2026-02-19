export type TerminalStatus = "running" | "done" | "error";

export interface TerminalSession {
  id: string;
  title: string;
  notes: string;
  status: TerminalStatus;
  exitCode: number | null;
  cwd?: string;
}
