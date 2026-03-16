import { useState, useEffect, useCallback, useRef } from "react";
import { useTerminalBridge } from "../../hooks/useTerminalBridge";
import { useResizeObserver } from "../../hooks/useResizeObserver";
import { useTerminalStore } from "../../stores/useTerminalStore";
import { ContextMenu } from "../common/ContextMenu";

interface TerminalPaneProps {
  terminalId: string;
  layoutId: string;
  onSplit?: (terminalId: string, direction: "horizontal" | "vertical") => void;
  onClose?: (terminalId: string) => void;
}

export function TerminalPane({
  terminalId,
  layoutId,
  onSplit,
  onClose,
}: TerminalPaneProps) {
  const cwd = useTerminalStore((s) => s.sessions[terminalId]?.cwd);
  const { containerRef, searchAddonRef, xtermRef, fit } = useTerminalBridge({ terminalId, cwd });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleResize = useCallback(() => {
    fit();
  }, [fit]);

  const resizeRef = useResizeObserver(handleResize);

  // Re-fit on window resize (e.g. maximising/restoring the window).
  useEffect(() => {
    const onResize = () => fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [fit]);

  // Opening/closing the search bar changes the terminal viewport height.
  // Trigger a fit so rows/cols stay in sync with the actual visible area.
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      fit();
    });
    return () => cancelAnimationFrame(rafId);
  }, [searchOpen, fit]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    searchAddonRef.current?.clearDecorations();
    xtermRef.current?.focus();
  }, [searchAddonRef, xtermRef]);

  const doSearch = useCallback(
    (query: string, direction: "next" | "prev" = "next") => {
      if (!query) {
        searchAddonRef.current?.clearDecorations();
        return;
      }
      if (direction === "next") {
        searchAddonRef.current?.findNext(query);
      } else {
        searchAddonRef.current?.findPrevious(query);
      }
    },
    [searchAddonRef]
  );

  // Intercept Cmd+F / Escape on the pane, and forward Ctrl+letter
  // combinations that macOS WKWebView swallows before xterm.js can
  // process them.  Uses capture phase so it fires before xterm.
  useEffect(() => {
    const el = resizeRef.current;
    if (!el) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Use Cmd on macOS, Ctrl on other platforms for search
      const isMac = navigator.platform.startsWith("Mac");
      const searchMod = isMac ? e.metaKey : e.ctrlKey;
      if (searchMod && e.key === "f") {
        e.preventDefault();
        e.stopPropagation();
        openSearch();
        return;
      }
      if (e.key === "Escape" && searchOpen) {
        closeSearch();
        return;
      }
      // On macOS WKWebView, the Cocoa text input system swallows
      // Ctrl+letter keydown events before xterm.js can process them.
      // Intercept in capture phase and inject the control character
      // through xterm's paste() so it flows through the normal
      // onData → writeTerminal pipeline (the same path as typing).
      if (isMac && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.length === 1) {
        const code = e.key.toUpperCase().charCodeAt(0);
        if (code >= 65 && code <= 90) {
          const controlChar = String.fromCharCode(code - 64);
          e.preventDefault();
          e.stopPropagation();
          xtermRef.current?.input(controlChar, false);
        }
      }
    };

    el.addEventListener("keydown", handleKeyDown, true);
    return () => el.removeEventListener("keydown", handleKeyDown, true);
  }, [openSearch, closeSearch, searchOpen, resizeRef, xtermRef]);

  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);
  const isActive = useTerminalStore((s) => s.activeTerminalId === terminalId);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  return (
    <div
      className={`terminal-pane ${isActive ? "terminal-pane-active" : ""}`}
      data-terminal-id={terminalId}
      ref={resizeRef}
      onMouseDown={() => setActiveTerminal(terminalId)}
      onContextMenu={handleContextMenu}
    >
      {searchOpen && (
        <div className="terminal-search-bar">
          <input
            ref={searchInputRef}
            className="terminal-search-input"
            value={searchQuery}
            placeholder="Search..."
            onChange={(e) => {
              setSearchQuery(e.target.value);
              doSearch(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                doSearch(searchQuery, e.shiftKey ? "prev" : "next");
              }
              if (e.key === "Escape") {
                closeSearch();
              }
              e.stopPropagation();
            }}
          />
          <button
            className="terminal-search-btn"
            onClick={() => doSearch(searchQuery, "prev")}
            title="Previous (Shift+Enter)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 8L6 4L10 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="terminal-search-btn"
            onClick={() => doSearch(searchQuery, "next")}
            title="Next (Enter)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button
            className="terminal-search-btn"
            onClick={closeSearch}
            title="Close (Esc)"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      )}
      <div className="terminal-container" ref={containerRef} />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: "Split Right", shortcut: "⌘D", onClick: () => onSplit?.(terminalId, "horizontal") },
            { label: "Split Down", shortcut: "⇧⌘D", onClick: () => onSplit?.(terminalId, "vertical") },
            { label: "Close Pane", shortcut: "⌘W", onClick: () => onClose?.(terminalId), danger: true },
          ]}
        />
      )}
    </div>
  );
}
