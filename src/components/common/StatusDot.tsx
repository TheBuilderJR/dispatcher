import type { TerminalStatus } from "../../types/terminal";

const statusColors: Record<TerminalStatus, string> = {
  running: "#888888",
  done: "#00c853",
  error: "#ff3333",
};

export function StatusDot({ status }: { status: TerminalStatus }) {
  const color = statusColors[status];
  return (
    <span
      className={`status-dot ${status === "running" ? "status-dot-running" : ""}`}
      style={{ backgroundColor: color }}
    />
  );
}
