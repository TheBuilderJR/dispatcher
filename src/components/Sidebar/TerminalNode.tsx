import { useState, useRef, useEffect, useCallback } from "react";
import { StatusDot } from "../common/StatusDot";
import { ContextMenu } from "../common/ContextMenu";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { setDragInfo, getDragInfo, clearDragInfo } from "../../lib/dragState";

interface TerminalNodeProps {
  terminalId: string;
  projectId: string;
  nodeId: string;
  parentNodeId: string;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function TerminalNode({ terminalId, projectId, nodeId, parentNodeId, isActive, onClick, onDelete }: TerminalNodeProps) {
  const session = useTerminalStore((s) => s.sessions[terminalId]);
  const updateTitle = useTerminalStore((s) => s.updateTitle);
  const reorderChild = useProjectStore((s) => s.reorderChild);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<"above" | "below" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startRename = useCallback(() => {
    if (session) {
      setDraft(session.title);
      setEditing(true);
    }
  }, [session]);

  if (!session) return null;

  const commitRename = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.title) {
      updateTitle(terminalId, trimmed);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData(
      "application/dispatcher-terminal",
      JSON.stringify({ terminalId, projectId })
    );
    e.dataTransfer.effectAllowed = "move";
    setDragInfo({ type: "terminal", terminalId, projectId, nodeId });
  };

  const handleDragEnd = () => {
    clearDragInfo();
  };

  const handleTerminalDragOver = (e: React.DragEvent) => {
    const info = getDragInfo();
    if (!info || info.type !== "terminal") return;
    if (info.projectId !== projectId) return;
    if (info.nodeId === nodeId) return;

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    const rect = nodeRef.current?.getBoundingClientRect();
    if (rect) {
      const midY = rect.top + rect.height / 2;
      setDropIndicator(e.clientY < midY ? "above" : "below");
    }
  };

  const handleTerminalDragLeave = () => {
    setDropIndicator(null);
  };

  const handleTerminalDrop = (e: React.DragEvent) => {
    const info = getDragInfo();
    if (!info || info.type !== "terminal") {
      setDropIndicator(null);
      return;
    }
    if (info.projectId !== projectId || info.nodeId === nodeId) {
      setDropIndicator(null);
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const rect = nodeRef.current?.getBoundingClientRect();
    if (rect) {
      const midY = rect.top + rect.height / 2;
      const position = e.clientY < midY ? "before" : "after";
      reorderChild(parentNodeId, info.nodeId, nodeId, position);
    }
    setDropIndicator(null);
  };

  return (
    <div
      ref={nodeRef}
      className={`sidebar-terminal-node ${isActive ? "active" : ""} ${dropIndicator === "above" ? "drop-indicator-above" : ""} ${dropIndicator === "below" ? "drop-indicator-below" : ""}`}
      onClick={onClick}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleTerminalDragOver}
      onDragLeave={handleTerminalDragLeave}
      onDrop={handleTerminalDrop}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <StatusDot status={session.status} />
      {editing ? (
        <input
          ref={inputRef}
          className="sidebar-rename-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setEditing(false);
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="terminal-node-title"
          onDoubleClick={(e) => {
            e.stopPropagation();
            startRename();
          }}
        >
          {session.title}
        </span>
      )}
      <button
        className="sidebar-delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Remove terminal"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </button>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: "Rename",
              icon: (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M8.5 2.5L11.5 5.5M2 12L2.5 9.5L10 2C10.5 1.5 11.5 1.5 12 2C12.5 2.5 12.5 3.5 12 4L4.5 11.5L2 12Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
              onClick: startRename,
            },
            {
              label: "Delete",
              icon: (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 4H11.5M5 4V2.5H9V4M5.5 6.5V10.5M8.5 6.5V10.5M3.5 4L4 11.5H10L10.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ),
              onClick: onDelete,
              danger: true,
            },
          ]}
        />
      )}
    </div>
  );
}
