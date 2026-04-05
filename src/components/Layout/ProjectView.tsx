import { useState, useCallback } from "react";
import { useLayoutStore } from "../../stores/useLayoutStore";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { useUiStore } from "../../stores/useUiStore";
import { DetailPanel } from "../Terminal/DetailPanel";
import { SplitContainer } from "./SplitContainer";

const DETAIL_PANEL_WIDTH_KEY = "dispatcher.detailPanelWidth";
const DEFAULT_DETAIL_PANEL_WIDTH = 260;
const MIN_DETAIL_PANEL_WIDTH = 180;
const MAX_DETAIL_PANEL_WIDTH = 480;

function clampDetailPanelWidth(width: number): number {
  return Math.max(MIN_DETAIL_PANEL_WIDTH, Math.min(MAX_DETAIL_PANEL_WIDTH, width));
}

function getInitialDetailPanelWidth(): number {
  if (typeof window === "undefined") return DEFAULT_DETAIL_PANEL_WIDTH;
  const stored = Number(window.localStorage.getItem(DETAIL_PANEL_WIDTH_KEY));
  return Number.isFinite(stored)
    ? clampDetailPanelWidth(stored)
    : DEFAULT_DETAIL_PANEL_WIDTH;
}

interface ProjectViewProps {
  layoutId: string;
  onSplitPane: (targetTerminalId: string, direction: "horizontal" | "vertical") => void;
  onClosePane: (terminalId: string) => void;
}

export function ProjectView({ layoutId, onSplitPane, onClosePane }: ProjectViewProps) {
  const layout = useLayoutStore((s) => s.layouts[layoutId]);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const [detailWidth, setDetailWidth] = useState(getInitialDetailPanelWidth);
  const detailCollapsed = useUiStore((s) => s.isDetailPanelCollapsed);
  const setDetailPanelCollapsed = useUiStore((s) => s.setDetailPanelCollapsed);

  const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = detailWidth;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = clampDetailPanelWidth(startWidth + (e.clientX - startX));
      setDetailWidth(newWidth);
      window.localStorage.setItem(DETAIL_PANEL_WIDTH_KEY, String(newWidth));
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
      {!detailCollapsed && (
        <>
          <DetailPanel
            terminalId={layoutId}
            onSplitHorizontal={() => onSplitPane(splitTarget, "horizontal")}
            onSplitVertical={() => onSplitPane(splitTarget, "vertical")}
            onCollapse={() => setDetailPanelCollapsed(true)}
            style={{ width: detailWidth, minWidth: detailWidth }}
          />
          <div
            className="detail-divider"
            onMouseDown={handleDividerMouseDown}
          />
        </>
      )}
      {detailCollapsed && (
        <button
          className="detail-expand-btn"
          onClick={() => setDetailPanelCollapsed(false)}
          title="Show Notes Panel"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}
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
