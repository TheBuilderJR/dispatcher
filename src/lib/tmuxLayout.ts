import type { LayoutNode } from "../types/layout";
import { createLeaf, generateNodeId } from "./layoutUtils";

export interface TmuxPaneLayoutRecord {
  paneId: string;
  terminalId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function getBounds(panes: readonly TmuxPaneLayoutRecord[]): Bounds {
  return panes.reduce<Bounds>(
    (bounds, pane) => ({
      left: Math.min(bounds.left, pane.left),
      top: Math.min(bounds.top, pane.top),
      right: Math.max(bounds.right, pane.left + pane.width),
      bottom: Math.max(bounds.bottom, pane.top + pane.height),
    }),
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY,
    }
  );
}

function sortByPosition(panes: readonly TmuxPaneLayoutRecord[]): TmuxPaneLayoutRecord[] {
  return [...panes].sort((left, right) => {
    if (left.top !== right.top) {
      return left.top - right.top;
    }
    if (left.left !== right.left) {
      return left.left - right.left;
    }
    return left.paneId.localeCompare(right.paneId);
  });
}

function buildLayoutNode(panes: readonly TmuxPaneLayoutRecord[]): LayoutNode {
  if (panes.length === 0) {
    throw new Error("Cannot build a tmux layout with no panes");
  }

  if (panes.length === 1) {
    return createLeaf(panes[0].terminalId);
  }

  const ordered = sortByPosition(panes);
  const bounds = getBounds(ordered);
  const totalWidth = Math.max(1, bounds.right - bounds.left);
  const totalHeight = Math.max(1, bounds.bottom - bounds.top);

  const horizontalBoundaries = [...new Set(ordered.map((pane) => pane.left + pane.width))]
    .filter((boundary) => boundary > bounds.left && boundary < bounds.right)
    .sort((left, right) => left - right);

  for (const boundary of horizontalBoundaries) {
    const first = ordered.filter((pane) => pane.left + pane.width <= boundary);
    const second = ordered.filter((pane) => pane.left >= boundary);
    if (first.length === 0 || second.length === 0 || first.length + second.length !== ordered.length) {
      continue;
    }

    return {
      type: "split",
      id: generateNodeId(),
      direction: "horizontal",
      ratio: Math.min(0.95, Math.max(0.05, (getBounds(first).right - bounds.left) / totalWidth)),
      first: buildLayoutNode(first),
      second: buildLayoutNode(second),
    };
  }

  const verticalBoundaries = [...new Set(ordered.map((pane) => pane.top + pane.height))]
    .filter((boundary) => boundary > bounds.top && boundary < bounds.bottom)
    .sort((left, right) => left - right);

  for (const boundary of verticalBoundaries) {
    const first = ordered.filter((pane) => pane.top + pane.height <= boundary);
    const second = ordered.filter((pane) => pane.top >= boundary);
    if (first.length === 0 || second.length === 0 || first.length + second.length !== ordered.length) {
      continue;
    }

    return {
      type: "split",
      id: generateNodeId(),
      direction: "vertical",
      ratio: Math.min(0.95, Math.max(0.05, (getBounds(first).bottom - bounds.top) / totalHeight)),
      first: buildLayoutNode(first),
      second: buildLayoutNode(second),
    };
  }

  const midpoint = Math.ceil(ordered.length / 2);
  const first = ordered.slice(0, midpoint);
  const second = ordered.slice(midpoint);

  return {
    type: "split",
    id: generateNodeId(),
    direction: totalWidth >= totalHeight ? "horizontal" : "vertical",
    ratio: 0.5,
    first: buildLayoutNode(first),
    second: buildLayoutNode(second),
  };
}

export function buildLayoutFromTmuxPanes(
  panes: readonly TmuxPaneLayoutRecord[]
): LayoutNode {
  return buildLayoutNode(panes);
}
