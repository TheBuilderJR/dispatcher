import { describe, expect, it } from "vitest";

import { computeTmuxWindowSizeFromPaneViewport } from "../tmuxSizing";

describe("computeTmuxWindowSizeFromPaneViewport", () => {
  it("matches the active pane viewport directly for a single-pane window", () => {
    expect(
      computeTmuxWindowSizeFromPaneViewport({
        viewportWidthPx: 796,
        viewportHeightPx: 396,
        cellWidthPx: 8,
        cellHeightPx: 18,
        activePaneCols: 100,
        activePaneRows: 22,
        totalWindowCols: 100,
        totalWindowRows: 22,
      })
    ).toEqual({ cols: 99, rows: 22 });
  });

  it("scales from the active pane to infer the full tmux window size", () => {
    expect(
      computeTmuxWindowSizeFromPaneViewport({
        viewportWidthPx: 388,
        viewportHeightPx: 396,
        cellWidthPx: 8,
        cellHeightPx: 18,
        activePaneCols: 49,
        activePaneRows: 22,
        totalWindowCols: 100,
        totalWindowRows: 22,
      })
    ).toEqual({ cols: 98, rows: 22 });
  });

  it("returns null when the input metrics are invalid", () => {
    expect(
      computeTmuxWindowSizeFromPaneViewport({
        viewportWidthPx: 0,
        viewportHeightPx: 396,
        cellWidthPx: 8,
        cellHeightPx: 18,
        activePaneCols: 49,
        activePaneRows: 22,
        totalWindowCols: 100,
        totalWindowRows: 22,
      })
    ).toBeNull();
  });
});
