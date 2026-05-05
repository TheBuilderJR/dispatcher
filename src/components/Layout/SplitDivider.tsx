import { useCallback, useRef } from "react";

interface SplitDividerProps {
  direction: "horizontal" | "vertical";
  onResize: (ratio: number) => void;
  onDragStart?: () => void;
  onDragEnd?: (finalRatio: number, containerPx: number) => void;
}

export function SplitDivider({ direction, onResize, onDragStart, onDragEnd }: SplitDividerProps) {
  const dividerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const divider = dividerRef.current;
      if (!divider) return;

      const parent = divider.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const containerPx = direction === "horizontal" ? rect.width : rect.height;
      if (containerPx <= 0) return;
      let lastRatio = direction === "horizontal"
        ? (e.clientX - rect.left) / rect.width
        : (e.clientY - rect.top) / rect.height;
      onDragStart?.();

      const handleMouseMove = (e: MouseEvent) => {
        let ratio: number;
        if (direction === "horizontal") {
          ratio = (e.clientX - rect.left) / rect.width;
        } else {
          ratio = (e.clientY - rect.top) / rect.height;
        }
        ratio = Math.max(0.1, Math.min(0.9, ratio));
        lastRatio = ratio;
        onResize(ratio);
      };

      const handleMouseUp = () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        onDragEnd?.(lastRatio, containerPx);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor =
        direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction, onResize, onDragStart, onDragEnd]
  );

  return (
    <div
      ref={dividerRef}
      className={`split-divider split-divider-${direction}`}
      onMouseDown={handleMouseDown}
    />
  );
}
