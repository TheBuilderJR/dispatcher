import { describe, expect, it } from "vitest";
import {
  isEventInsideTerminal,
  isPlainCtrlLetterShortcut,
  shouldBypassAppShortcutsForTerminal,
} from "../keyboardShortcuts";

describe("keyboardShortcuts", () => {
  it("treats Ctrl+letter as a terminal control chord", () => {
    expect(isPlainCtrlLetterShortcut({ ctrlKey: true, metaKey: false, altKey: false, key: "r" })).toBe(true);
    expect(isPlainCtrlLetterShortcut({ ctrlKey: true, metaKey: false, altKey: false, key: "R" })).toBe(true);
  });

  it("does not treat non-letter or modified shortcuts as terminal control chords", () => {
    expect(isPlainCtrlLetterShortcut({ ctrlKey: true, metaKey: false, altKey: false, key: "]" })).toBe(false);
    expect(isPlainCtrlLetterShortcut({ ctrlKey: true, metaKey: false, altKey: true, key: "r" })).toBe(false);
    expect(isPlainCtrlLetterShortcut({ ctrlKey: false, metaKey: true, altKey: false, key: "r" })).toBe(false);
  });

  it("detects when the event target is inside a terminal pane", () => {
    const pane = document.createElement("div");
    pane.className = "terminal-pane";
    const child = document.createElement("div");
    pane.appendChild(child);

    expect(isEventInsideTerminal(child)).toBe(true);
    expect(isEventInsideTerminal(document.createElement("div"))).toBe(false);
  });

  it("bypasses app shortcuts for Ctrl+letter events inside terminals only", () => {
    const pane = document.createElement("div");
    pane.className = "terminal-pane";
    const child = document.createElement("div");
    pane.appendChild(child);

    expect(
      shouldBypassAppShortcutsForTerminal({
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        key: "r",
        target: child,
      })
    ).toBe(true);

    expect(
      shouldBypassAppShortcutsForTerminal({
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        key: "]",
        target: child,
      })
    ).toBe(false);

    expect(
      shouldBypassAppShortcutsForTerminal({
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        key: "r",
        target: document.createElement("div"),
      })
    ).toBe(false);
  });
});
