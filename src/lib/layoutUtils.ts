import { LayoutNode, SplitNode, LeafNode } from "../types/layout";

let nodeCounter = 0;
export function generateNodeId(): string {
  return `node-${Date.now()}-${++nodeCounter}`;
}

export function createLeaf(terminalId: string): LeafNode {
  return { type: "terminal", id: generateNodeId(), terminalId };
}

export function splitAtTerminal(
  root: LayoutNode,
  targetTerminalId: string,
  newTerminalId: string,
  direction: "horizontal" | "vertical"
): LayoutNode {
  if (root.type === "terminal") {
    if (root.terminalId === targetTerminalId) {
      const newLeaf = createLeaf(newTerminalId);
      return {
        type: "split",
        id: generateNodeId(),
        direction,
        ratio: 0.5,
        first: root,
        second: newLeaf,
      };
    }
    return root;
  }

  return {
    ...root,
    first: splitAtTerminal(root.first, targetTerminalId, newTerminalId, direction),
    second: splitAtTerminal(root.second, targetTerminalId, newTerminalId, direction),
  };
}

export function removeFromLayout(
  root: LayoutNode,
  targetTerminalId: string
): LayoutNode | null {
  if (root.type === "terminal") {
    return root.terminalId === targetTerminalId ? null : root;
  }

  const first = removeFromLayout(root.first, targetTerminalId);
  const second = removeFromLayout(root.second, targetTerminalId);

  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;

  return { ...root, first, second };
}

export function updateRatio(
  root: LayoutNode,
  splitId: string,
  newRatio: number
): LayoutNode {
  if (root.type === "terminal") return root;
  if (root.id === splitId) return { ...root, ratio: newRatio };
  return {
    ...root,
    first: updateRatio(root.first, splitId, newRatio),
    second: updateRatio(root.second, splitId, newRatio),
  };
}

export function findTerminalIds(root: LayoutNode): string[] {
  if (root.type === "terminal") return [root.terminalId];
  return [...findTerminalIds(root.first), ...findTerminalIds(root.second)];
}

/** Find the nearest sibling terminal when a pane is about to be closed. */
export function findSiblingTerminalId(
  root: LayoutNode,
  targetTerminalId: string
): string | null {
  if (root.type === "terminal") return null;

  const firstIds = findTerminalIds(root.first);
  const secondIds = findTerminalIds(root.second);

  // Target is a direct leaf child – sibling is the closest terminal in the other subtree
  if (root.first.type === "terminal" && root.first.terminalId === targetTerminalId) {
    return secondIds[0] ?? null;
  }
  if (root.second.type === "terminal" && root.second.terminalId === targetTerminalId) {
    return firstIds[firstIds.length - 1] ?? null;
  }

  // Recurse into whichever subtree contains the target
  if (firstIds.includes(targetTerminalId)) {
    return findSiblingTerminalId(root.first, targetTerminalId);
  }
  if (secondIds.includes(targetTerminalId)) {
    return findSiblingTerminalId(root.second, targetTerminalId);
  }

  return null;
}

/** Find the layout key (tab root terminal ID) that contains the given terminal. */
export function findLayoutKeyForTerminal(
  layouts: Record<string, LayoutNode>,
  terminalId: string
): string | null {
  if (layouts[terminalId]) return terminalId;
  for (const [key, layout] of Object.entries(layouts)) {
    if (findTerminalIds(layout).includes(terminalId)) return key;
  }
  return null;
}
