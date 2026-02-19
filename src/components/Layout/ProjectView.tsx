import { useState, useCallback } from "react";
import { useLayoutStore } from "../../stores/useLayoutStore";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { DetailPanel } from "../Terminal/DetailPanel";
import { SplitContainer } from "./SplitContainer";

interface ProjectViewProps {
  layoutId: string;
  onSplitPane: (targetTerminalId: string, direction: "horizontal" | "vertical") => void;
  onClosePane: (terminalId: string) => void;
}

export function ProjectView({ layoutId, onSplitPane, onClosePane }: ProjectViewProps) {
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

  // The detail panel always shows the tab root terminal's title/notes —
  // split panes are purely a layout concern and don't have their own metadata.
  // Split actions still target whichever pane is currently focused.
  const splitTarget = activeTerminalId ?? layoutId;

  return (
    <div className="project-view">
      <DetailPanel
        terminalId={layoutId}
        onSplitHorizontal={() => onSplitPane(splitTarget, "horizontal")}
        onSplitVertical={() => onSplitPane(splitTarget, "vertical")}
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
