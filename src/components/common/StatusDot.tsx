const GREEN = "#00c853";

export function StatusDot({ terminalId: _terminalId }: { terminalId: string }) {
  return (
    <span
      className="status-dot"
      style={{ backgroundColor: GREEN }}
    />
  );
}
