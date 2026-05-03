import { describe, expect, it } from "vitest";
import {
  findDisconnectedTmuxWindowPlaceholder,
  findProjectIdForNode,
  findProjectIdForTerminal,
} from "../treeUtils";

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

  it("finds disconnected tmux placeholders across projects so reattach can reuse them", () => {
    const projects = {
      projectA: { id: "projectA", name: "Project A", cwd: "/", rootGroupId: "root-a", expanded: true },
      projectB: { id: "projectB", name: "Project B", cwd: "/", rootGroupId: "root-b", expanded: true },
    };
    const nodes = {
      "root-a": { id: "root-a", type: "group" as const, name: "Root", children: ["node-a"], parentId: null },
      "root-b": { id: "root-b", type: "group" as const, name: "Root", children: ["node-b"], parentId: null },
      "node-a": {
        id: "node-a",
        type: "terminal" as const,
        name: "Remote A",
        terminalId: "term-a",
        parentId: "root-a",
      },
      "node-b": {
        id: "node-b",
        type: "terminal" as const,
        name: "Local Shell",
        terminalId: "term-b",
        parentId: "root-b",
      },
    };
    const sessions = {
      "term-a": {
        id: "term-a",
        title: "Remote A",
        notes: "",
        hasDetectedActivity: false,
        lastUserInputAt: 0,
        lastOutputAt: 0,
        isNeedsAttention: false,
        isPossiblyDone: false,
        isLongInactive: false,
        isRecentlyFocused: false,
        backendKind: "tmux-window" as const,
        tmuxWindowId: "@7",
      },
      "term-b": {
        id: "term-b",
        title: "Local Shell",
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

    expect(findDisconnectedTmuxWindowPlaceholder(
      projects,
      ["projectA", "projectB"],
      nodes,
      sessions,
      "@7",
      {
        parentNodeId: "root-b",
        projectId: "projectB",
        title: "Remote A",
      }
    )).toMatchObject({
      nodeId: "node-a",
      terminalId: "term-a",
      parentNodeId: "root-a",
      projectId: "projectA",
    });
  });
});
