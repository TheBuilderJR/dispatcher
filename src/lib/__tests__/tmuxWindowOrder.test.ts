import { describe, expect, it } from "vitest";
import {
  buildPreferredTmuxWindowOrder,
  mergeTmuxWindowNodesIntoChildren,
  reconcileTmuxWindowNodePlacements,
} from "../tmuxWindowOrder";

describe("tmuxWindowOrder", () => {
  it("preserves the existing sidebar order for restored windows", () => {
    expect(buildPreferredTmuxWindowOrder({
      currentChildren: ["node-b", "node-a", "local-shell"],
      windows: [
        { windowId: "@1", nodeId: "node-a" },
        { windowId: "@2", nodeId: "node-b" },
        { windowId: "@3", nodeId: "node-c" },
      ],
      snapshotWindowOrder: ["@1", "@2", "@3"],
    })).toEqual(["@2", "@1", "@3"]);
  });

  it("keeps existing window nodes in place and appends only missing ones", () => {
    expect(mergeTmuxWindowNodesIntoChildren({
      currentChildren: ["transport", "node-b", "node-a", "local-shell"],
      transportNodeId: "transport",
      preferredWindowNodeOrder: ["node-b", "node-a", "node-c"],
    })).toEqual(["transport", "node-b", "node-a", "node-c", "local-shell"]);
  });

  it("inserts fresh tmux windows after the hidden transport node", () => {
    expect(mergeTmuxWindowNodesIntoChildren({
      currentChildren: ["before", "transport", "after"],
      transportNodeId: "transport",
      preferredWindowNodeOrder: ["node-a", "node-b"],
    })).toEqual(["before", "transport", "node-a", "node-b", "after"]);
  });

  it("removes stale cross-project references when a tmux window node was moved", () => {
    expect(reconcileTmuxWindowNodePlacements({
      currentChildrenByParentId: {
        "group-a": ["transport", "node-a", "node-b", "local-a"],
        "group-b": ["local-b", "node-b"],
      },
      nodeParentByNodeId: {
        "node-a": "group-a",
        "node-b": "group-b",
      },
      windowNodeIds: ["node-a", "node-b"],
      preferredWindowNodeOrder: ["node-a", "node-b"],
      transportNodeId: "transport",
    })).toEqual({
      "group-a": ["transport", "node-a", "local-a"],
      "group-b": ["local-b", "node-b"],
    });
  });

  it("inserts a missing tmux window only under its authoritative parent", () => {
    expect(reconcileTmuxWindowNodePlacements({
      currentChildrenByParentId: {
        "group-a": ["transport", "node-a"],
        "group-b": [],
      },
      nodeParentByNodeId: {
        "node-a": "group-a",
        "node-b": "group-b",
      },
      windowNodeIds: ["node-a", "node-b"],
      preferredWindowNodeOrder: ["node-a", "node-b"],
      transportNodeId: "transport",
    })).toEqual({
      "group-a": ["transport", "node-a"],
      "group-b": ["node-b"],
    });
  });
});
