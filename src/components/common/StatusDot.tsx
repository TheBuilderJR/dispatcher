import { useTerminalStore } from "../../stores/useTerminalStore";

const GREEN = "#00c853";
const BROWN = "#8b6b3f";
const GRAY = "#7b8794";

export function StatusDot({ terminalId }: { terminalId: string }) {
  const isPossiblyDone = useTerminalStore((state) => state.sessions[terminalId]?.isPossiblyDone ?? false);
  const isLongInactive = useTerminalStore((state) => state.sessions[terminalId]?.isLongInactive ?? false);
  const isRecentlyFocused = useTerminalStore((state) => state.sessions[terminalId]?.isRecentlyFocused ?? false);
  const isActive = useTerminalStore((state) => state.activeTerminalId === terminalId);
  const backgroundColor = isActive || isRecentlyFocused
    ? GREEN
    : isLongInactive
      ? GRAY
      : isPossiblyDone
        ? BROWN
        : GREEN;

  return (
    <span
      className="status-dot"
      style={{ backgroundColor }}
    />
  );
}
