import { describe, expect, it } from "vitest";
import { buildLayoutFromTmuxPanes } from "../tmuxLayout";

describe("tmuxLayout", () => {
  it("builds a single-pane leaf layout", () => {
    const layout = buildLayoutFromTmuxPanes([
      {
        paneId: "%1",
        terminalId: "t1",
        left: 0,
        top: 0,
        width: 80,
        height: 24,
      },
    ]);

    expect(layout).toEqual({
      type: "terminal",
      id: expect.any(String),
      terminalId: "t1",
    });
  });

  it("builds a horizontal split for side-by-side panes", () => {
    const layout = buildLayoutFromTmuxPanes([
      {
        paneId: "%1",
        terminalId: "left",
        left: 0,
        top: 0,
        width: 40,
        height: 24,
      },
      {
        paneId: "%2",
        terminalId: "right",
        left: 40,
        top: 0,
        width: 40,
        height: 24,
      },
    ]);

    expect(layout.type).toBe("split");
    if (layout.type !== "split") {
      return;
    }

    expect(layout.direction).toBe("horizontal");
    expect(layout.first).toMatchObject({ type: "terminal", terminalId: "left" });
    expect(layout.second).toMatchObject({ type: "terminal", terminalId: "right" });
  });

  it("builds nested splits from pane geometry", () => {
    const layout = buildLayoutFromTmuxPanes([
      {
        paneId: "%1",
        terminalId: "left",
        left: 0,
        top: 0,
        width: 50,
        height: 40,
      },
      {
        paneId: "%2",
        terminalId: "top-right",
        left: 50,
        top: 0,
        width: 50,
        height: 20,
      },
      {
        paneId: "%3",
        terminalId: "bottom-right",
        left: 50,
        top: 20,
        width: 50,
        height: 20,
      },
    ]);

    expect(layout.type).toBe("split");
    if (layout.type !== "split") {
      return;
    }

    expect(layout.direction).toBe("horizontal");
    expect(layout.first).toMatchObject({ type: "terminal", terminalId: "left" });
    expect(layout.second.type).toBe("split");
    if (layout.second.type !== "split") {
      return;
    }

    expect(layout.second.direction).toBe("vertical");
    expect(layout.second.first).toMatchObject({ type: "terminal", terminalId: "top-right" });
    expect(layout.second.second).toMatchObject({ type: "terminal", terminalId: "bottom-right" });
  });
});
