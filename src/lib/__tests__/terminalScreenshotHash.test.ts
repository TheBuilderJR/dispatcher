import { describe, expect, it } from "vitest";
import { split, leaf } from "../../test/helpers";
import {
  buildCompoundScreenshotHashInput,
  buildTerminalVisualHashInput,
  getTabRootTerminalIds,
  getTabStatusTerminalIds,
  getTabTerminalIds,
  summarizeTerminalVisualChange,
  type TerminalVisualTextSnapshot,
} from "../terminalScreenshotHash";

function snapshot(
  terminalId: string,
  lines: string[],
  patch: Partial<Pick<TerminalVisualTextSnapshot, "cols" | "rows">> = {}
): TerminalVisualTextSnapshot {
  return {
    terminalId,
    cols: patch.cols ?? 80,
    rows: patch.rows ?? lines.length,
    lines,
  };
}

describe("terminalScreenshotHash", () => {
  it("returns split-pane terminal ids in layout order", () => {
    const layouts = {
      root: split(leaf("root"), split(leaf("split-a"), leaf("split-b"))),
    };

    expect(
      getTabTerminalIds(layouts, "root", new Set(["root", "split-a", "split-b", "other"]))
    ).toEqual(["root", "split-a", "split-b"]);
  });

  it("resolves unique tab roots for split panes and standalone terminals", () => {
    const layouts = {
      root: split(leaf("root"), leaf("split-a")),
      solo: leaf("solo"),
    };

    expect(getTabRootTerminalIds(layouts, ["root", "split-a", "solo"])).toEqual([
      "root",
      "solo",
    ]);
  });

  it("includes the tab root terminal when tracking status for virtual tmux tabs", () => {
    const layouts = {
      tmuxWindow: split(leaf("pane-a"), leaf("pane-b")),
    };

    expect(
      getTabStatusTerminalIds(layouts, "tmuxWindow", new Set(["tmuxWindow", "pane-a", "pane-b"]))
    ).toEqual(["tmuxWindow", "pane-a", "pane-b"]);
  });

  it("builds a compound hash input that preserves pane order and membership", () => {
    expect(buildCompoundScreenshotHashInput(["hash-a", "hash-b"])).toBe(
      "dispatcher:screenshot-compound:v1\ncount=2\nhash-a\nhash-b"
    );
    expect(buildCompoundScreenshotHashInput(["hash-a", "hash-b"])).not.toBe(
      buildCompoundScreenshotHashInput(["hash-a"])
    );
    expect(buildCompoundScreenshotHashInput(["hash-a", "hash-b"])).not.toBe(
      buildCompoundScreenshotHashInput(["hash-b", "hash-a"])
    );
  });

  it("builds visual hash input from terminal text instead of cursor pixels", () => {
    expect(buildTerminalVisualHashInput(snapshot("t1", ["hello", "world"]))).toBe(
      "dispatcher:screenshot-component:v1\nterminal=t1\ncols=80\nrows=2\nhello\nworld"
    );
  });

  it("waits for a third visual sample before treating a hash change as activity", () => {
    const previous = snapshot("t1", [
      "running command",
      ">",
      "",
      "",
    ]);
    const current = snapshot("t1", [
      "running command",
      "|",
      "",
      "",
    ]);

    expect(
      summarizeTerminalVisualChange({
        previousComponents: [previous],
        currentComponents: [current],
        previousHash: "hash-a",
        currentHash: "hash-b",
        recentHashes: ["hash-a"],
      })
    ).toMatchObject({
      exactChanged: true,
      hasThreeSamples: false,
      changed: false,
      changedRows: 1,
      changedChars: 1,
    });
  });

  it("treats single-character forward progress as activity after three samples", () => {
    const previous = snapshot("t1", [
      "Thinking for 11s",
      "",
    ]);
    const current = snapshot("t1", [
      "Thinking for 12s",
      "",
    ]);

    expect(
      summarizeTerminalVisualChange({
        previousComponents: [previous],
        currentComponents: [current],
        previousHash: "hash-b",
        currentHash: "hash-c",
        recentHashes: ["hash-a", "hash-b"],
      })
    ).toMatchObject({
      exactChanged: true,
      repeatingHashOscillation: false,
      hasThreeSamples: true,
      changed: true,
      changedRows: 1,
      changedChars: 1,
    });
  });

  it("detects A-B-A visual hash oscillation as repetition", () => {
    const previous = snapshot("t1", [
      "status: waiting",
      "cursor on",
      "unchanged",
    ]);
    const current = snapshot("t1", [
      "status: waiting",
      "cursor off",
      "unchanged",
    ]);

    expect(
      summarizeTerminalVisualChange({
        previousComponents: [previous],
        currentComponents: [current],
        previousHash: "hash-b",
        currentHash: "hash-a",
        recentHashes: ["hash-a", "hash-b"],
      })
    ).toMatchObject({
      exactChanged: true,
      repeatingHashOscillation: true,
      hasThreeSamples: true,
      changed: false,
    });
  });

  it("supports tmux split pane visual changes as one compound tab state", () => {
    const previousPanes = [
      snapshot("pane-a", ["a1", "a2", "a3"]),
      snapshot("pane-b", ["b1", "b2", "b3"]),
    ];
    const currentPanes = [
      snapshot("pane-a", ["a1", "A2", "a3"]),
      snapshot("pane-b", ["B1", "B2", "b3"]),
    ];

    expect(
      summarizeTerminalVisualChange({
        previousComponents: previousPanes,
        currentComponents: currentPanes,
        previousHash: "hash-a",
        currentHash: "hash-b",
        recentHashes: ["hash-z", "hash-a"],
      })
    ).toMatchObject({
      exactChanged: true,
      hasThreeSamples: true,
      changed: true,
      changedRows: 3,
    });
  });
});
