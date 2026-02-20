import { useEffect, useRef, useState } from "react";
import { useTerminalStore } from "../../stores/useTerminalStore";

const GRAY = "#888888";
const GREEN = "#00c853";
const DURATION_MS = 5 * 60 * 1000; // 5 minutes

export function StatusDot({ terminalId }: { terminalId: string }) {
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const isActive = activeTerminalId === terminalId;
  const [color, setColor] = useState(GRAY);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (isActive) {
      // Active terminal: show gray, stop any animation
      cancelAnimationFrame(rafRef.current);
      setColor(GRAY);
      return;
    }

    // Not active: animate gray → green over 5 minutes
    startRef.current = performance.now();

    function tick() {
      const elapsed = performance.now() - startRef.current;
      const t = Math.min(elapsed / DURATION_MS, 1);

      // Lerp each RGB channel
      const r = Math.round(0x88 + (0x00 - 0x88) * t);
      const g = Math.round(0x88 + (0xc8 - 0x88) * t);
      const b = Math.round(0x88 + (0x53 - 0x88) * t);
      setColor(`rgb(${r},${g},${b})`);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive]);

  return (
    <span
      className="status-dot"
      style={{ backgroundColor: color }}
    />
  );
}
