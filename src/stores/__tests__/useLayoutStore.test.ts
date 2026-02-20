import { describe, it, expect } from "vitest";
import { useLayoutStore } from "../useLayoutStore";
import { findTerminalIds } from "../../lib/layoutUtils";

describe("useLayoutStore", () => {
  it("initLayout creates a leaf node", () => {
    useLayoutStore.getState().initLayout("layout1", "t1");
    const layout = useLayoutStore.getState().layouts["layout1"];
    expect(layout).toBeDefined();
    expect(layout.type).toBe("terminal");
    if (layout.type === "terminal") {
      expect(layout.terminalId).toBe("t1");
    }
  });

  it("splitTerminal on nonexistent layout → no-op", () => {
    useLayoutStore.getState().splitTerminal("nonexistent", "t1", "t2", "horizontal");
    expect(useLayoutStore.getState().layouts["nonexistent"]).toBeUndefined();
  });

  it("splitTerminal creates correct split structure", () => {
    useLayoutStore.getState().initLayout("layout1", "t1");
    useLayoutStore.getState().splitTerminal("layout1", "t1", "t2", "horizontal");
    const layout = useLayoutStore.getState().layouts["layout1"];
    expect(layout.type).toBe("split");
    const ids = findTerminalIds(layout);
    expect(ids).toContain("t1");
    expect(ids).toContain("t2");
    expect(ids).toHaveLength(2);
  });

  it("double split produces 3-terminal tree", () => {
    useLayoutStore.getState().initLayout("layout1", "t1");
    useLayoutStore.getState().splitTerminal("layout1", "t1", "t2", "horizontal");
    useLayoutStore.getState().splitTerminal("layout1", "t2", "t3", "vertical");
    const layout = useLayoutStore.getState().layouts["layout1"];
    const ids = findTerminalIds(layout);
    expect(ids).toHaveLength(3);
    expect(ids).toContain("t1");
    expect(ids).toContain("t2");
    expect(ids).toContain("t3");
  });

  it("removeTerminal on last terminal removes layout entry", () => {
    useLayoutStore.getState().initLayout("layout1", "t1");
    useLayoutStore.getState().removeTerminal("layout1", "t1");
    expect(useLayoutStore.getState().layouts["layout1"]).toBeUndefined();
  });

  it("removeTerminal collapses back to leaf", () => {
    useLayoutStore.getState().initLayout("layout1", "t1");
    useLayoutStore.getState().splitTerminal("layout1", "t1", "t2", "horizontal");
    useLayoutStore.getState().removeTerminal("layout1", "t2");
    const layout = useLayoutStore.getState().layouts["layout1"];
    expect(layout.type).toBe("terminal");
    if (layout.type === "terminal") {
      expect(layout.terminalId).toBe("t1");
    }
  });

  it("setRatio updates correct split node", () => {
    useLayoutStore.getState().initLayout("layout1", "t1");
    useLayoutStore.getState().splitTerminal("layout1", "t1", "t2", "horizontal");
    const layout = useLayoutStore.getState().layouts["layout1"];
    if (layout.type !== "split") throw new Error("Expected split");
    useLayoutStore.getState().setRatio("layout1", layout.id, 0.7);
    const updated = useLayoutStore.getState().layouts["layout1"];
    expect(updated.type === "split" && updated.ratio).toBe(0.7);
  });

  it("removeLayout deletes the entry", () => {
    useLayoutStore.getState().initLayout("layout1", "t1");
    useLayoutStore.getState().removeLayout("layout1");
    expect(useLayoutStore.getState().layouts["layout1"]).toBeUndefined();
  });
});
