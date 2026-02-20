import { describe, it, expect } from "vitest";
import { useProjectStore } from "../useProjectStore";
import { useTerminalStore } from "../useTerminalStore";
import { useLayoutStore } from "../useLayoutStore";
import { findTerminalIds, findLayoutKeyForTerminal, findSiblingTerminalId } from "../../lib/layoutUtils";
import { createTestProject, createTestProjectWithSplit } from "../../test/helpers";

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
