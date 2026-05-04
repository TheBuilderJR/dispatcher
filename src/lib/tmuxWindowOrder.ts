export interface TmuxWindowOrderEntry {
  windowId: string;
  nodeId: string;
}

export function buildPreferredTmuxWindowOrder(options: {
  currentChildren: readonly string[];
  windows: readonly TmuxWindowOrderEntry[];
  snapshotWindowOrder: readonly string[];
}): string[] {
  const windowIdByNodeId = new Map(
    options.windows.map((window) => [window.nodeId, window.windowId] as const)
  );

  const preservedOrder = options.currentChildren
    .map((childId) => windowIdByNodeId.get(childId))
    .filter((windowId): windowId is string => Boolean(windowId));

  const seen = new Set(preservedOrder);
  const appended = options.snapshotWindowOrder.filter((windowId) => !seen.has(windowId));
  return [...preservedOrder, ...appended];
}

export function mergeTmuxWindowNodesIntoChildren(options: {
  currentChildren: readonly string[];
  transportNodeId: string;
  preferredWindowNodeOrder: readonly string[];
}): string[] {
  const currentChildSet = new Set(options.currentChildren);
  const missingWindowNodeIds = options.preferredWindowNodeOrder.filter(
    (nodeId) => !currentChildSet.has(nodeId)
  );

  if (missingWindowNodeIds.length === 0) {
    return [...options.currentChildren];
  }

  const existingWindowNodeIds = options.preferredWindowNodeOrder.filter((nodeId) => currentChildSet.has(nodeId));
  const result = [...options.currentChildren];
  const anchorNodeId = existingWindowNodeIds[existingWindowNodeIds.length - 1] ?? options.transportNodeId;
  const anchorIndex = result.indexOf(anchorNodeId);
  const insertIndex = anchorIndex === -1 ? result.length : anchorIndex + 1;
  result.splice(insertIndex, 0, ...missingWindowNodeIds);
  return result;
}

export function reconcileTmuxWindowNodePlacements(options: {
  currentChildrenByParentId: Record<string, readonly string[]>;
  nodeParentByNodeId: Record<string, string | null | undefined>;
  windowNodeIds: readonly string[];
  preferredWindowNodeOrder: readonly string[];
  transportNodeId: string;
}): Record<string, string[]> {
  const windowNodeIdSet = new Set(options.windowNodeIds);
  const parentIds = new Set(Object.keys(options.currentChildrenByParentId));

  for (const nodeId of options.windowNodeIds) {
    const parentNodeId = options.nodeParentByNodeId[nodeId];
    if (parentNodeId) {
      parentIds.add(parentNodeId);
    }
  }

  const nextChildrenByParentId: Record<string, string[]> = {};
  for (const parentNodeId of parentIds) {
    const currentChildren = options.currentChildrenByParentId[parentNodeId] ?? [];
    const cleanedChildren = currentChildren.filter((childId) => {
      if (!windowNodeIdSet.has(childId)) {
        return true;
      }
      return options.nodeParentByNodeId[childId] === parentNodeId;
    });
    const preferredWindowNodeOrder = options.preferredWindowNodeOrder.filter(
      (nodeId) => options.nodeParentByNodeId[nodeId] === parentNodeId
    );

    nextChildrenByParentId[parentNodeId] = mergeTmuxWindowNodesIntoChildren({
      currentChildren: cleanedChildren,
      transportNodeId: options.transportNodeId,
      preferredWindowNodeOrder,
    });
  }

  return nextChildrenByParentId;
}
