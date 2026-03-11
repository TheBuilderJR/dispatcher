import type { LayoutNode, LeafNode, SplitNode } from "../types/layout";
import { useProjectStore } from "../stores/useProjectStore";
import { useTerminalStore } from "../stores/useTerminalStore";
import { useLayoutStore } from "../stores/useLayoutStore";

let helperCounter = 0;
function id(prefix = "test") {
  return `${prefix}-${++helperCounter}`;
}

/** Create a leaf layout node. */
export function leaf(terminalId: string): LeafNode {
  return { type: "terminal", id: id("leaf"), terminalId };
}

/** Create a split layout node. */
export function split(
  first: LayoutNode,
  second: LayoutNode,
  opts: { direction?: "horizontal" | "vertical"; ratio?: number } = {}
): SplitNode {
  return {
    type: "split",
    id: id("split"),
    direction: opts.direction ?? "horizontal",
    ratio: opts.ratio ?? 0.5,
    first,
    second,
  };
}

/**
 * Wire up a project with N terminals across all three stores.
 * Returns IDs for everything created.
 */
export function createTestProject(opts: { terminalCount?: number } = {}) {
  const count = opts.terminalCount ?? 1;
  const projectId = id("proj");
  const rootGroupId = id("root");

  useProjectStore.getState().addProject({
    id: projectId,
    name: "Test Project",
    cwd: "/tmp",
    rootGroupId,
    expanded: true,
  });

  useProjectStore.getState().addNode({
    id: rootGroupId,
    type: "group",
    name: "Root",
    children: [],
    parentId: null,
  });

  const terminalIds: string[] = [];
  const nodeIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const terminalId = id("term");
    const nodeId = id("node");

    useProjectStore.getState().addNode({
      id: nodeId,
      type: "terminal",
      name: `Terminal ${i + 1}`,
      terminalId,
      parentId: rootGroupId,
    });
    useProjectStore.getState().addChildToNode(rootGroupId, nodeId);

    useTerminalStore.getState().addSession(terminalId, `Terminal ${i + 1}`);
    useLayoutStore.getState().initLayout(terminalId, terminalId);

    terminalIds.push(terminalId);
    nodeIds.push(nodeId);
  }

  return { projectId, rootGroupId, terminalIds, nodeIds };
}

/**
 * Create a project with one tab that has a split pane.
 * Returns the tab root terminal, the split pane terminal, and project metadata.
 */
export function createTestProjectWithSplit(
  opts: { direction?: "horizontal" | "vertical" } = {}
) {
  const base = createTestProject({ terminalCount: 1 });
  const tabRootId = base.terminalIds[0];
  const splitTerminalId = id("split-term");
  const direction = opts.direction ?? "horizontal";

  // Add session for the split pane (no tree node — split panes are layout-only)
  useTerminalStore.getState().addSession(splitTerminalId);
  useLayoutStore.getState().splitTerminal(tabRootId, tabRootId, splitTerminalId, direction);

  return {
    ...base,
    tabRootId,
    splitTerminalId,
    direction,
  };
}

/** Reset the helper counter (called automatically via beforeEach in setup). */
export function resetHelperCounter() {
  helperCounter = 0;
}
