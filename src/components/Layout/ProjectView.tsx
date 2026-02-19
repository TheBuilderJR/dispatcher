import { useState, useCallback } from "react";
import { useLayoutStore } from "../../stores/useLayoutStore";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { DetailPanel } from "../Terminal/DetailPanel";
import { SplitContainer } from "./SplitContainer";

interface ProjectViewProps {
  layoutId: string;
  rootTerminalId: string;
  onSplitPane: (targetTerminalId: string, direction: "horizontal" | "vertical") => void;
  onClosePane: (terminalId: string) => void;
}

export function ProjectView({ layoutId, rootTerminalId, onSplitPane, onClosePane }: ProjectViewProps) {
  const layout = useLayoutStore((s) => s.layouts[layoutId]);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const [detailWidth, setDetailWidth] = useState(260);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = detailWidth;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(180, Math.min(480, startWidth + (e.clientX - startX)));
      setDetailWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [detailWidth]);

  if (!layout) {
    return (
      <div className="empty-view">
        <p>No terminals open</p>
      </div>
    );
  }

  const displayTerminalId = activeTerminalId ?? rootTerminalId;

  return (
    <div className="project-view">
      <DetailPanel
        terminalId={displayTerminalId}
        onSplitHorizontal={() => onSplitPane(displayTerminalId, "horizontal")}
        onSplitVertical={() => onSplitPane(displayTerminalId, "vertical")}
        onClose={() => onClosePane(displayTerminalId)}
        style={{ width: detailWidth, minWidth: detailWidth }}
      />
      <div
        className="detail-divider"
        onMouseDown={handleDividerMouseDown}
      />
      <div className="terminal-canvas">
        <SplitContainer
          node={layout}
          layoutId={layoutId}
          onSplit={onSplitPane}
          onClose={onClosePane}
        />
      </div>
    </div>
  );
}
