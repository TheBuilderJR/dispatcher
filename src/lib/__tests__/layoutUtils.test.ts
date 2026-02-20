import { describe, it, expect } from "vitest";
import {
  splitAtTerminal,
  removeFromLayout,
  findTerminalIds,
  findSiblingTerminalId,
  findLayoutKeyForTerminal,
  updateRatio,
  createLeaf,
} from "../layoutUtils";
import { leaf, split } from "../../test/helpers";
import type { LayoutNode } from "../../types/layout";

describe("splitAtTerminal", () => {
  it("single leaf → split node", () => {
    const root = leaf("t1");
    const result = splitAtTerminal(root, "t1", "t2", "horizontal");
    expect(result.type).toBe("split");
    if (result.type !== "split") throw new Error();
    expect(result.direction).toBe("horizontal");
    expect(result.ratio).toBe(0.5);
    expect(result.first).toBe(root);
    expect(result.second.type).toBe("terminal");
    if (result.second.type === "terminal") {
      expect(result.second.terminalId).toBe("t2");
    }
  });

  it("deep tree, targets specific leaf", () => {
    const root = split(leaf("t1"), split(leaf("t2"), leaf("t3")));
    const result = splitAtTerminal(root, "t3", "t4", "vertical");
    const ids = findTerminalIds(result);
    expect(ids).toContain("t4");
    expect(ids).toHaveLength(4);
  });

  it("target not found, returns unchanged structure", () => {
    const root = leaf("t1");
    const result = splitAtTerminal(root, "nonexistent", "t2", "horizontal");
    expect(result).toBe(root);
  });

  it("respects direction parameter", () => {
    const root = leaf("t1");
    const horizontal = splitAtTerminal(root, "t1", "t2", "horizontal");
    expect(horizontal.type === "split" && horizontal.direction).toBe("horizontal");

    const root2 = leaf("t1b");
    const vertical = splitAtTerminal(root2, "t1b", "t3", "vertical");
    expect(vertical.type === "split" && vertical.direction).toBe("vertical");
  });
});

describe("removeFromLayout", () => {
  it("two leaves, remove one → collapses to sibling", () => {
    const root = split(leaf("t1"), leaf("t2"));
    const result = removeFromLayout(root, "t1");
    expect(result).not.toBeNull();
    expect(result!.type).toBe("terminal");
    if (result!.type === "terminal") {
      expect(result!.terminalId).toBe("t2");
    }
  });

  it("deep nesting, preserves rest of tree", () => {
    const root = split(leaf("t1"), split(leaf("t2"), leaf("t3")));
    const result = removeFromLayout(root, "t2");
    expect(result).not.toBeNull();
    const ids = findTerminalIds(result!);
    expect(ids).toEqual(["t1", "t3"]);
  });

  it("single leaf → returns null", () => {
    const root = leaf("t1");
    const result = removeFromLayout(root, "t1");
    expect(result).toBeNull();
  });

  it("target not found → unchanged", () => {
    const root = split(leaf("t1"), leaf("t2"));
    const result = removeFromLayout(root, "nonexistent");
    expect(result).not.toBeNull();
    expect(findTerminalIds(result!)).toEqual(["t1", "t2"]);
  });
});

describe("findTerminalIds", () => {
  it("single leaf", () => {
    expect(findTerminalIds(leaf("t1"))).toEqual(["t1"]);
  });

  it("complex tree — left-to-right order", () => {
    const root = split(
      split(leaf("t1"), leaf("t2")),
      split(leaf("t3"), leaf("t4"))
    );
    expect(findTerminalIds(root)).toEqual(["t1", "t2", "t3", "t4"]);
  });
});

describe("findSiblingTerminalId", () => {
  it("target is first child → returns first terminal in second subtree", () => {
    const root = split(leaf("t1"), leaf("t2"));
    expect(findSiblingTerminalId(root, "t1")).toBe("t2");
  });

  it("target is second child → returns last terminal in first subtree", () => {
    const root = split(leaf("t1"), leaf("t2"));
    expect(findSiblingTerminalId(root, "t2")).toBe("t1");
  });

  it("deeply nested target", () => {
    const root = split(leaf("t1"), split(leaf("t2"), leaf("t3")));
    expect(findSiblingTerminalId(root, "t2")).toBe("t3");
  });

  it("single leaf root → null", () => {
    expect(findSiblingTerminalId(leaf("t1"), "t1")).toBeNull();
  });
});

describe("findLayoutKeyForTerminal", () => {
  it("direct key match", () => {
    const layouts: Record<string, LayoutNode> = {
      t1: leaf("t1"),
    };
    expect(findLayoutKeyForTerminal(layouts, "t1")).toBe("t1");
  });

  it("inside split layout", () => {
    const layouts: Record<string, LayoutNode> = {
      t1: split(leaf("t1"), leaf("t2")),
    };
    expect(findLayoutKeyForTerminal(layouts, "t2")).toBe("t1");
  });

  it("not found → null", () => {
    const layouts: Record<string, LayoutNode> = {
      t1: leaf("t1"),
    };
    expect(findLayoutKeyForTerminal(layouts, "t99")).toBeNull();
  });
});

describe("updateRatio", () => {
  it("updates correct split node", () => {
    const inner = split(leaf("t2"), leaf("t3"));
    const root = split(leaf("t1"), inner);
    const result = updateRatio(root, inner.id, 0.7);
    expect(result.type).toBe("split");
    if (result.type !== "split") throw new Error();
    // Outer ratio unchanged
    expect(result.ratio).toBe(0.5);
    // Inner ratio updated
    expect(result.second.type === "split" && result.second.ratio).toBe(0.7);
  });
});
