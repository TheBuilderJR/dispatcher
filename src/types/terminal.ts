export interface TerminalSession {
  id: string;
  title: string;
  notes: string;
  cwd?: string;
  isPossiblyDone: boolean;
  isLongInactive: boolean;
  isRecentlyFocused: boolean;
}
