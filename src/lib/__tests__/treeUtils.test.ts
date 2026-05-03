import { describe, expect, it } from "vitest";
import { findProjectIdForNode, findProjectIdForTerminal } from "../treeUtils";

describe("treeUtils", () => {
  it("finds a project by walking node ancestry", () => {
    const projects = {
      projectA: { id: "projectA", name: "Project A", cwd: "/", rootGroupId: "root-a", expanded: true },
    };
    const nodes = {
      "root-a": { id: "root-a", type: "group" as const, name: "Root", children: ["group-1"], parentId: null },
      "group-1": { id: "group-1", type: "group" as const, name: "Group", children: ["node-1"], parentId: "root-a" },
      "node-1": { id: "node-1", type: "terminal" as const, name: "Shell", terminalId: "term-1", parentId: "group-1" },
    };

    expect(findProjectIdForNode(projects, ["projectA"], nodes, "node-1")).toBe("projectA");
  });

  it("finds a hidden terminal's project without relying on visible-tree traversal", () => {
    const projects = {
      projectA: { id: "projectA", name: "Project A", cwd: "/", rootGroupId: "root-a", expanded: true },
    };
    const nodes = {
      "root-a": { id: "root-a", type: "group" as const, name: "Root", children: ["node-1"], parentId: null },
      "node-1": {
        id: "node-1",
        type: "terminal" as const,
        name: "Shell",
        terminalId: "term-1",
        parentId: "root-a",
        hidden: true,
      },
    };
    const sessions = {
      "term-1": {
        id: "term-1",
        title: "Shell",
        notes: "",
        hasDetectedActivity: false,
        lastUserInputAt: 0,
        lastOutputAt: 0,
        isNeedsAttention: false,
        isPossiblyDone: false,
        isLongInactive: false,
        isRecentlyFocused: false,
        backendKind: "local" as const,
      },
    };

    expect(findProjectIdForTerminal(projects, ["projectA"], nodes, sessions, "term-1")).toBe("projectA");
  });
});
