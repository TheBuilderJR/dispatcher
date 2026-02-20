import { useState, useRef, useEffect, useCallback } from "react";
import { StatusDot } from "../common/StatusDot";
import { EditableText } from "../common/EditableText";
import { useTerminalStore } from "../../stores/useTerminalStore";

interface TerminalHeaderProps {
  terminalId: string;
  layoutId: string;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
}

export function TerminalHeader({
  terminalId,
  onSplitHorizontal,
  onSplitVertical,
}: TerminalHeaderProps) {
  const session = useTerminalStore((s) => s.sessions[terminalId]);
  const updateTitle = useTerminalStore((s) => s.updateTitle);
  const updateNotes = useTerminalStore((s) => s.updateNotes);
  const [notesOpen, setNotesOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (notesOpen) {
      setTimeout(() => {
        textareaRef.current?.focus();
        autoResize();
      }, 0);
    }
  }, [notesOpen, autoResize]);

  if (!session) return null;

  const hasNotes = session.notes.length > 0;

  return (
    <div className="terminal-header">
      <div className="terminal-header-left">
        <div className="terminal-header-title-row">
          <StatusDot status={session.status} />
          <EditableText
            value={session.title}
            onChange={(v) => updateTitle(terminalId, v)}
            className="terminal-title"
          />
          <button
            className="terminal-notes-toggle"
            onClick={() => setNotesOpen((o) => !o)}
            title={notesOpen ? "Hide notes" : "Show notes"}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="2" y="2" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <line x1="4.5" y1="5" x2="9.5" y2="5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              <line x1="4.5" y1="7.5" x2="9.5" y2="7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              <line x1="4.5" y1="10" x2="7.5" y2="10" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
            </svg>
            {hasNotes && <span className="terminal-notes-indicator" />}
          </button>
        </div>
        {notesOpen && (
          <textarea
            ref={textareaRef}
            className="terminal-notes"
            value={session.notes}
            placeholder="Write notes..."
            rows={2}
            onChange={(e) => {
              updateNotes(terminalId, e.target.value);
              autoResize();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setNotesOpen(false);
              }
              // Let tab-cycling shortcuts bubble to the global handler
              if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.code === "BracketLeft" || e.code === "BracketRight")) {
                return;
              }
              e.stopPropagation();
            }}
          />
        )}
      </div>
      <div className="terminal-header-actions">
        <button onClick={onSplitHorizontal} title="Split Right (⌘D)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>
        <button onClick={onSplitVertical} title="Split Down (⌘⇧D)">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
            <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
