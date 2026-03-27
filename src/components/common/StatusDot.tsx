import { useTerminalStore } from "../../stores/useTerminalStore";

const GREEN = "#00c853";
const GRAY = "#7b8794";

export function StatusDot({ terminalId }: { terminalId: string }) {
  const isPossiblyDone = useTerminalStore((state) => state.sessions[terminalId]?.isPossiblyDone ?? false);
  const isRecentlyFocused = useTerminalStore((state) => state.sessions[terminalId]?.isRecentlyFocused ?? false);
  const isActive = useTerminalStore((state) => state.activeTerminalId === terminalId);

  return (
    <span
      className="status-dot"
      style={{ backgroundColor: isPossiblyDone && !isActive && !isRecentlyFocused ? GRAY : GREEN }}
    />
  );
}
