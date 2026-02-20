import { describe, it, expect } from "vitest";
import { useProjectStore } from "../useProjectStore";
import { useTerminalStore } from "../useTerminalStore";
import { useLayoutStore } from "../useLayoutStore";
import { findTerminalIds, findLayoutKeyForTerminal, findSiblingTerminalId } from "../../lib/layoutUtils";
import { createTestProject, createTestProjectWithSplit } from "../../test/helpers";

// ---------------------------------------------------------------------------
// Replicate the tab-cycling algorithm from App.tsx so we can test it
// in isolation without React/DOM. This must match the keydown handler.
// ---------------------------------------------------------------------------

function buildTerminalList() {
  const { projects: allProjects, projectOrder, nodes } = useProjectStore.getState();
  const sessions = useTerminalStore.getState().sessions;
  const allTerminals: { terminalId: string; projectId: string }[] = [];
  for (const projId of projectOrder) {
    const proj = allProjects[projId];
    if (!proj || !proj.expanded) continue;
    const rootNode = nodes[proj.rootGroupId];
    if (!rootNode?.children) continue;
    for (const childId of rootNode.children) {
      const child = nodes[childId];
      if (child?.type === "terminal" && child.terminalId && sessions[child.terminalId]) {
        allTerminals.push({ terminalId: child.terminalId, projectId: projId });
      }
    }
  }
  return allTerminals;
}

function cycleTerminal(
  forward: boolean,
  lastFocusedPane: Map<string, string>
) {
  const allTerminals = buildTerminalList();
  if (allTerminals.length < 2) return;

  const activeTermId = useTerminalStore.getState().activeTerminalId;
  let currentIdx = activeTermId
    ? allTerminals.findIndex((t) => t.terminalId === activeTermId)
    : -1;
  // If active terminal is a split pane (not a tab root), find its parent tab
  if (currentIdx === -1 && activeTermId) {
    const layouts = useLayoutStore.getState().layouts;
    const parentKey = findLayoutKeyForTerminal(layouts, activeTermId);
    if (parentKey) {
      currentIdx = allTerminals.findIndex((t) => t.terminalId === parentKey);
    }
  }
  let nextIdx: number;
  if (currentIdx === -1) {
    nextIdx = forward ? 0 : allTerminals.length - 1;
  } else if (forward) {
    nextIdx = currentIdx >= allTerminals.length - 1 ? 0 : currentIdx + 1;
  } else {
    nextIdx = currentIdx <= 0 ? allTerminals.length - 1 : currentIdx - 1;
  }
  const next = allTerminals[nextIdx];
  useProjectStore.getState().setActiveProject(next.projectId);
  const restored = lastFocusedPane.get(next.terminalId);
  useTerminalStore.getState().setActiveTerminal(restored || next.terminalId);
}

/** Simulate the lastFocusedPane subscription from App.tsx. */
function trackLastFocusedPane(lastFocusedPane: Map<string, string>) {
  return useTerminalStore.subscribe((state) => {
    const activeId = state.activeTerminalId;
    if (!activeId) return;
    const layouts = useLayoutStore.getState().layouts;
    const tabRoot = findLayoutKeyForTerminal(layouts, activeId);
    if (tabRoot) {
      lastFocusedPane.set(tabRoot, activeId);
    } else if (layouts[activeId]) {
      lastFocusedPane.set(activeId, activeId);
    }
  });
}

describe("Cross-store integration", () => {
  it("full project lifecycle: create → verify all 3 stores", () => {
    const { projectId, rootGroupId, terminalIds, nodeIds } = createTestProject({ terminalCount: 1 });

    // Project store
    const projects = useProjectStore.getState().projects;
    expect(projects[projectId]).toBeDefined();
    expect(useProjectStore.getState().activeProjectId).toBe(projectId);
    expect(useProjectStore.getState().nodes[rootGroupId]).toBeDefined();
    expect(useProjectStore.getState().nodes[nodeIds[0]]).toBeDefined();

    // Terminal store
    const sessions = useTerminalStore.getState().sessions;
    expect(sessions[terminalIds[0]]).toBeDefined();
    expect(sessions[terminalIds[0]].status).toBe("done");

    // Layout store
    const layouts = useLayoutStore.getState().layouts;
    expect(layouts[terminalIds[0]]).toBeDefined();
    expect(layouts[terminalIds[0]].type).toBe("terminal");
  });

  it("delete project with split panes cleans all stores", () => {
    const { projectId, rootGroupId, tabRootId, splitTerminalId, nodeIds } =
      createTestProjectWithSplit();

    // Simulate handleDeleteProject from App.tsx
    const allLayouts = useLayoutStore.getState().layouts;
    const allNodes = useProjectStore.getState().nodes;
    const rootNode = allNodes[rootGroupId];

    for (const childId of rootNode.children ?? []) {
      const child = allNodes[childId];
      if (child?.type === "terminal" && child.terminalId) {
        const layout = allLayouts[child.terminalId];
        if (layout) {
          for (const id of findTerminalIds(layout)) {
            useTerminalStore.getState().removeSession(id);
          }
        }
        useLayoutStore.getState().removeLayout(child.terminalId);
      }
      useProjectStore.getState().removeNode(childId);
    }
    useProjectStore.getState().removeNode(rootGroupId);
    useProjectStore.getState().removeProject(projectId);

    // Verify cleanup
    expect(useProjectStore.getState().projects[projectId]).toBeUndefined();
    expect(useProjectStore.getState().nodes[rootGroupId]).toBeUndefined();
    expect(useTerminalStore.getState().sessions[tabRootId]).toBeUndefined();
    expect(useTerminalStore.getState().sessions[splitTerminalId]).toBeUndefined();
    expect(useLayoutStore.getState().layouts[tabRootId]).toBeUndefined();
  });

  it("split pane adds session + modifies layout but NOT project tree", () => {
    const { rootGroupId, terminalIds } = createTestProject({ terminalCount: 1 });
    const tabRootId = terminalIds[0];

    const nodesBefore = { ...useProjectStore.getState().nodes };
    const childrenBefore = [...(nodesBefore[rootGroupId].children ?? [])];

    // Add a split pane (layout-only, no tree node)
    const splitId = "split-pane-1";
    useTerminalStore.getState().addSession(splitId);
    useLayoutStore.getState().splitTerminal(tabRootId, tabRootId, splitId, "horizontal");

    // Project tree unchanged
    expect(useProjectStore.getState().nodes[rootGroupId].children).toEqual(childrenBefore);

    // But terminal store and layout store updated
    expect(useTerminalStore.getState().sessions[splitId]).toBeDefined();
    const layout = useLayoutStore.getState().layouts[tabRootId];
    expect(layout.type).toBe("split");
    expect(findTerminalIds(layout)).toContain(splitId);
  });

  it("close split pane: removes session, collapses layout, preserves tab", () => {
    const { rootGroupId, tabRootId, splitTerminalId, nodeIds } =
      createTestProjectWithSplit();

    // Simulate handleClosePane for a split pane
    const allLayouts = useLayoutStore.getState().layouts;
    const layoutKey = findLayoutKeyForTerminal(allLayouts, splitTerminalId);
    expect(layoutKey).toBe(tabRootId);

    const layout = allLayouts[layoutKey!];
    const sibling = findSiblingTerminalId(layout, splitTerminalId);

    useLayoutStore.getState().removeTerminal(layoutKey!, splitTerminalId);

    if (sibling && useTerminalStore.getState().activeTerminalId === splitTerminalId) {
      useTerminalStore.getState().setActiveTerminal(sibling);
    }
    useTerminalStore.getState().removeSession(splitTerminalId);

    // Tab root and tree node survive
    expect(useLayoutStore.getState().layouts[tabRootId]).toBeDefined();
    expect(useLayoutStore.getState().layouts[tabRootId].type).toBe("terminal");
    expect(useTerminalStore.getState().sessions[tabRootId]).toBeDefined();
    expect(useProjectStore.getState().nodes[nodeIds[0]]).toBeDefined();
  });

  it("close tab root with splits: re-keys layout, preserves remaining panes", () => {
    const { rootGroupId, tabRootId, splitTerminalId, nodeIds } =
      createTestProjectWithSplit();

    // Simulate handleClosePane for the tab root when splits exist.
    // The tab root is also the layout key — closing it must NOT destroy the tab.
    const allLayouts = useLayoutStore.getState().layouts;
    const layoutKey = tabRootId;
    const layout = allLayouts[layoutKey];
    const isSolePane = layout.type === "terminal";
    expect(isSolePane).toBe(false); // has splits

    const sibling = findSiblingTerminalId(layout, tabRootId);
    expect(sibling).toBe(splitTerminalId);

    // Remove from layout tree
    useLayoutStore.getState().removeTerminal(layoutKey, tabRootId);

    // Re-key: the old key still exists (removeTerminal keeps it), move to new key
    const remaining = useLayoutStore.getState().layouts[layoutKey];
    expect(remaining).toBeDefined();
    const newKey = findTerminalIds(remaining)[0];
    useLayoutStore.setState((state) => {
      const { [layoutKey]: layoutNode, ...rest } = state.layouts;
      return { layouts: { ...rest, [newKey]: layoutNode } };
    });

    // Update tree node's terminalId
    useProjectStore.setState((state) => ({
      nodes: {
        ...state.nodes,
        [nodeIds[0]]: { ...state.nodes[nodeIds[0]], terminalId: newKey },
      },
    }));

    if (sibling && useTerminalStore.getState().activeTerminalId === tabRootId) {
      useTerminalStore.getState().setActiveTerminal(sibling);
    }
    useTerminalStore.getState().removeSession(tabRootId);

    // Remaining split pane survives
    expect(useTerminalStore.getState().sessions[splitTerminalId]).toBeDefined();
    // Layout re-keyed under the surviving terminal
    expect(useLayoutStore.getState().layouts[newKey]).toBeDefined();
    expect(useLayoutStore.getState().layouts[tabRootId]).toBeUndefined();
    // Tree node updated to new key
    expect(useProjectStore.getState().nodes[nodeIds[0]].terminalId).toBe(newKey);
  });

  it("close tab root with 3 panes: two remaining panes survive", () => {
    // Create a project with tab root + 2 split panes
    const { rootGroupId, tabRootId, nodeIds } = createTestProjectWithSplit();
    const splitTerm2 = "split-term-2";
    useTerminalStore.getState().addSession(splitTerm2);
    useLayoutStore.getState().splitTerminal(
      tabRootId,
      createTestProjectWithSplit.name ? tabRootId : tabRootId, // split the tab root again
      splitTerm2,
      "vertical"
    );

    // Verify 3 terminals in layout
    const layout = useLayoutStore.getState().layouts[tabRootId];
    const allIds = findTerminalIds(layout);
    expect(allIds).toHaveLength(3);

    // Close the tab root pane
    const sibling = findSiblingTerminalId(layout, tabRootId);
    useLayoutStore.getState().removeTerminal(tabRootId, tabRootId);

    // Re-key
    const remaining = useLayoutStore.getState().layouts[tabRootId];
    const newKey = findTerminalIds(remaining)[0];
    useLayoutStore.setState((state) => {
      const { [tabRootId]: layoutNode, ...rest } = state.layouts;
      return { layouts: { ...rest, [newKey]: layoutNode } };
    });
    useProjectStore.setState((state) => ({
      nodes: {
        ...state.nodes,
        [nodeIds[0]]: { ...state.nodes[nodeIds[0]], terminalId: newKey },
      },
    }));

    if (sibling && useTerminalStore.getState().activeTerminalId === tabRootId) {
      useTerminalStore.getState().setActiveTerminal(sibling);
    }
    useTerminalStore.getState().removeSession(tabRootId);

    // Two panes remain in the re-keyed layout
    const newLayout = useLayoutStore.getState().layouts[newKey];
    expect(newLayout).toBeDefined();
    const remainingIds = findTerminalIds(newLayout);
    expect(remainingIds).toHaveLength(2);
    expect(remainingIds).not.toContain(tabRootId);
  });

  it("close last terminal auto-deletes project", () => {
    const { projectId, rootGroupId, terminalIds, nodeIds } = createTestProject({ terminalCount: 1 });
    const tabRootId = terminalIds[0];

    // Simulate full close sequence
    useTerminalStore.getState().removeSession(tabRootId);
    useLayoutStore.getState().removeLayout(tabRootId);
    useProjectStore.getState().removeChildFromNode(rootGroupId, nodeIds[0]);
    useProjectStore.getState().removeNode(nodeIds[0]);

    // Check if project should be auto-deleted
    const updatedRoot = useProjectStore.getState().nodes[rootGroupId];
    if (!updatedRoot?.children || updatedRoot.children.length === 0) {
      useProjectStore.getState().removeNode(rootGroupId);
      useProjectStore.getState().removeProject(projectId);
    }

    expect(useProjectStore.getState().projects[projectId]).toBeUndefined();
    expect(useProjectStore.getState().activeProjectId).toBeNull();
  });

  it("move terminal between projects: tree updated, session/layout unchanged", () => {
    const proj1 = createTestProject({ terminalCount: 1 });
    const proj2 = createTestProject({ terminalCount: 1 });

    const movedNodeId = proj1.nodeIds[0];
    const movedTerminalId = proj1.terminalIds[0];

    useProjectStore.getState().moveNode(movedNodeId, proj2.rootGroupId);

    const nodes = useProjectStore.getState().nodes;
    // Old parent lost child
    expect(nodes[proj1.rootGroupId].children).not.toContain(movedNodeId);
    // New parent gained child
    expect(nodes[proj2.rootGroupId].children).toContain(movedNodeId);
    // Node's parentId updated
    expect(nodes[movedNodeId].parentId).toBe(proj2.rootGroupId);

    // Session and layout unchanged
    expect(useTerminalStore.getState().sessions[movedTerminalId]).toBeDefined();
    expect(useLayoutStore.getState().layouts[movedTerminalId]).toBeDefined();
  });

  it("active terminal fallback after closing active split pane", () => {
    const { tabRootId, splitTerminalId } = createTestProjectWithSplit();

    // splitTerminalId is active (addSession sets it)
    expect(useTerminalStore.getState().activeTerminalId).toBe(splitTerminalId);

    // Close the active split pane
    const allLayouts = useLayoutStore.getState().layouts;
    const layout = allLayouts[tabRootId];
    const sibling = findSiblingTerminalId(layout, splitTerminalId);

    useLayoutStore.getState().removeTerminal(tabRootId, splitTerminalId);

    if (sibling && useTerminalStore.getState().activeTerminalId === splitTerminalId) {
      useTerminalStore.getState().setActiveTerminal(sibling);
    }
    useTerminalStore.getState().removeSession(splitTerminalId);

    // Focus moved to sibling (tab root)
    expect(useTerminalStore.getState().activeTerminalId).toBe(tabRootId);
  });

  it("active terminal preserved when closing non-active pane", () => {
    const { tabRootId, splitTerminalId } = createTestProjectWithSplit();

    // Make tab root active
    useTerminalStore.getState().setActiveTerminal(tabRootId);

    // Close the non-active split pane
    useLayoutStore.getState().removeTerminal(tabRootId, splitTerminalId);
    useTerminalStore.getState().removeSession(splitTerminalId);

    // Active terminal unchanged
    expect(useTerminalStore.getState().activeTerminalId).toBe(tabRootId);
  });

  it("delete project switches activeProjectId to remaining project", () => {
    const proj1 = createTestProject({ terminalCount: 1 });
    const proj2 = createTestProject({ terminalCount: 1 });

    useProjectStore.getState().setActiveProject(proj1.projectId);

    // Delete proj1 (simplified — just remove project entry)
    useProjectStore.getState().removeProject(proj1.projectId);

    expect(useProjectStore.getState().activeProjectId).toBe(proj2.projectId);
  });
});

// ---------------------------------------------------------------------------
// Tab cycling (Cmd+Shift+[ / Cmd+Shift+])
// ---------------------------------------------------------------------------

describe("Tab cycling", () => {
  it("cycles forward through tabs in a single project", () => {
    const proj = createTestProject({ terminalCount: 3 });
    const [t1, t2, t3] = proj.terminalIds;
    const lastFocused = new Map<string, string>();

    useTerminalStore.getState().setActiveTerminal(t1);
    cycleTerminal(true, lastFocused);
    expect(useTerminalStore.getState().activeTerminalId).toBe(t2);

    cycleTerminal(true, lastFocused);
    expect(useTerminalStore.getState().activeTerminalId).toBe(t3);
  });

  it("cycles backward through tabs", () => {
    const proj = createTestProject({ terminalCount: 3 });
    const [t1, t2, t3] = proj.terminalIds;
    const lastFocused = new Map<string, string>();

    useTerminalStore.getState().setActiveTerminal(t3);
    cycleTerminal(false, lastFocused);
    expect(useTerminalStore.getState().activeTerminalId).toBe(t2);

    cycleTerminal(false, lastFocused);
    expect(useTerminalStore.getState().activeTerminalId).toBe(t1);
  });

  it("wraps around forward: last → first", () => {
    const proj = createTestProject({ terminalCount: 3 });
    const [t1, , t3] = proj.terminalIds;
    const lastFocused = new Map<string, string>();

    useTerminalStore.getState().setActiveTerminal(t3);
    cycleTerminal(true, lastFocused);
    expect(useTerminalStore.getState().activeTerminalId).toBe(t1);
  });

  it("wraps around backward: first → last", () => {
    const proj = createTestProject({ terminalCount: 3 });
    const [t1, , t3] = proj.terminalIds;
    const lastFocused = new Map<string, string>();

    useTerminalStore.getState().setActiveTerminal(t1);
    cycleTerminal(false, lastFocused);
    expect(useTerminalStore.getState().activeTerminalId).toBe(t3);
  });

  it("cycles across projects", () => {
    const proj1 = createTestProject({ terminalCount: 1 });
    const proj2 = createTestProject({ terminalCount: 1 });
    const lastFocused = new Map<string, string>();

    useTerminalStore.getState().setActiveTerminal(proj1.terminalIds[0]);
    useProjectStore.getState().setActiveProject(proj1.projectId);

    cycleTerminal(true, lastFocused);

    expect(useTerminalStore.getState().activeTerminalId).toBe(proj2.terminalIds[0]);
    expect(useProjectStore.getState().activeProjectId).toBe(proj2.projectId);
  });

  it("skips collapsed projects", () => {
    const proj1 = createTestProject({ terminalCount: 1 });
    const proj2 = createTestProject({ terminalCount: 1 });
    const proj3 = createTestProject({ terminalCount: 1 });
    const lastFocused = new Map<string, string>();

    // Collapse proj2
    useProjectStore.getState().toggleProjectExpanded(proj2.projectId);

    useTerminalStore.getState().setActiveTerminal(proj1.terminalIds[0]);
    useProjectStore.getState().setActiveProject(proj1.projectId);

    cycleTerminal(true, lastFocused);

    // Should skip proj2 and go to proj3
    expect(useTerminalStore.getState().activeTerminalId).toBe(proj3.terminalIds[0]);
    expect(useProjectStore.getState().activeProjectId).toBe(proj3.projectId);
  });

  it("resolves split pane to parent tab for cycling position", () => {
    const proj = createTestProject({ terminalCount: 2 });
    const [t1, t2] = proj.terminalIds;
    const lastFocused = new Map<string, string>();

    // Split tab1 and focus the split pane
    const splitId = "split-in-t1";
    useTerminalStore.getState().addSession(splitId);
    useLayoutStore.getState().splitTerminal(t1, t1, splitId, "horizontal");
    useTerminalStore.getState().setActiveTerminal(splitId);

    // Cycle forward — should move from tab1 (split pane context) to tab2
    cycleTerminal(true, lastFocused);
    expect(useTerminalStore.getState().activeTerminalId).toBe(t2);
  });

  it("no-op with fewer than 2 tabs", () => {
    const proj = createTestProject({ terminalCount: 1 });
    const lastFocused = new Map<string, string>();

    useTerminalStore.getState().setActiveTerminal(proj.terminalIds[0]);
    cycleTerminal(true, lastFocused);

    // Still on the same terminal (cycleTerminal returns early)
    expect(useTerminalStore.getState().activeTerminalId).toBe(proj.terminalIds[0]);
  });
});

// ---------------------------------------------------------------------------
// Last-focused pane tracking + restoration
// ---------------------------------------------------------------------------

describe("Last-focused pane restoration", () => {
  it("restores last-focused split pane when cycling back to a tab", () => {
    const proj = createTestProject({ terminalCount: 2 });
    const [t1, t2] = proj.terminalIds;
    const lastFocused = new Map<string, string>();
    const unsub = trackLastFocusedPane(lastFocused);

    // Split tab1 and focus the split pane
    const splitId = "split-in-t1";
    useTerminalStore.getState().addSession(splitId);
    useLayoutStore.getState().splitTerminal(t1, t1, splitId, "horizontal");
    useTerminalStore.getState().setActiveTerminal(splitId);

    // Subscription should record splitId under tab root t1
    expect(lastFocused.get(t1)).toBe(splitId);

    // Cycle to tab2
    cycleTerminal(true, lastFocused);
    expect(useTerminalStore.getState().activeTerminalId).toBe(t2);

    // Cycle back to tab1 — should restore to splitId, not t1
    cycleTerminal(false, lastFocused);
    expect(useTerminalStore.getState().activeTerminalId).toBe(splitId);

    unsub();
  });

  it("falls back to tab root when no pane was previously focused", () => {
    const proj = createTestProject({ terminalCount: 2 });
    const [t1, t2] = proj.terminalIds;
    const lastFocused = new Map<string, string>();

    // t2 is active (last added), no lastFocused entries for t1
    useTerminalStore.getState().setActiveTerminal(t2);

    // Cycle backward to t1
    cycleTerminal(false, lastFocused);
    // Should fall back to t1 itself since there's no lastFocused entry
    expect(useTerminalStore.getState().activeTerminalId).toBe(t1);
  });

  it("stale lastFocusedPane entry after split pane is closed", () => {
    // This tests a known edge case: if you focus a split pane, cycle away,
    // then close that pane, cycling back restores a stale (nonexistent) ID.
    const proj = createTestProject({ terminalCount: 2 });
    const [t1, t2] = proj.terminalIds;
    const lastFocused = new Map<string, string>();
    const unsub = trackLastFocusedPane(lastFocused);

    // Split tab1, focus split pane
    const splitId = "split-in-t1";
    useTerminalStore.getState().addSession(splitId);
    useLayoutStore.getState().splitTerminal(t1, t1, splitId, "horizontal");
    useTerminalStore.getState().setActiveTerminal(splitId);

    // Cycle to t2
    cycleTerminal(true, lastFocused);

    // Close the split pane while t2 is active
    useLayoutStore.getState().removeTerminal(t1, splitId);
    useTerminalStore.getState().removeSession(splitId);

    // Cycle back — lastFocused still has the stale splitId
    cycleTerminal(false, lastFocused);
    // BUG: activeTerminalId is set to the closed splitId.
    // The session doesn't exist, so the UI would show nothing focused.
    const activeId = useTerminalStore.getState().activeTerminalId;
    const session = useTerminalStore.getState().sessions[activeId!];
    expect(session).toBeUndefined(); // demonstrates the stale entry bug

    unsub();
  });

  it("tracks tab root focus correctly for single-pane tabs", () => {
    const proj = createTestProject({ terminalCount: 2 });
    const [t1, t2] = proj.terminalIds;
    const lastFocused = new Map<string, string>();
    const unsub = trackLastFocusedPane(lastFocused);

    useTerminalStore.getState().setActiveTerminal(t1);
    expect(lastFocused.get(t1)).toBe(t1);

    useTerminalStore.getState().setActiveTerminal(t2);
    expect(lastFocused.get(t2)).toBe(t2);

    unsub();
  });
});
