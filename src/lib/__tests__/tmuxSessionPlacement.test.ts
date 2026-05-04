import { describe, expect, it } from "vitest";

import {
  canReuseTmuxWindowPlaceholder,
  resolveRecoveredTmuxSessionPlacement,
  resolveTmuxWindowPlacementFromPlaceholder,
} from "../tmuxSessionPlacement";

describe("tmuxSessionPlacement", () => {
  it("keeps restored tmux windows in their original project while preserving transport context", () => {
    expect(resolveRecoveredTmuxSessionPlacement({
      transportProjectId: "project-b",
      transportParentNodeId: "group-b",
      windowProjectId: "project-a",
      windowParentNodeId: "group-a",
    })).toEqual({
      projectId: "project-a",
      parentNodeId: "group-a",
      transportProjectId: "project-b",
      transportParentNodeId: "group-b",
    });
  });

  it("adopts the first disconnected placeholder project on cross-project reattach", () => {
    expect(resolveTmuxWindowPlacementFromPlaceholder({
      currentProjectId: "project-b",
      currentParentNodeId: "group-b",
      existingWindowCount: 0,
      placeholderProjectId: "project-a",
      placeholderParentNodeId: "group-a",
    })).toEqual({
      projectId: "project-a",
      parentNodeId: "group-a",
      adopted: true,
    });
  });

  it("does not reuse placeholders from a different parent after the session target is established", () => {
    expect(canReuseTmuxWindowPlaceholder({
      sessionParentNodeId: "group-a",
      placeholderParentNodeId: "group-b",
    })).toBe(false);
  });
});
