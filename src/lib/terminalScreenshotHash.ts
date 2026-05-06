import type { LayoutNode } from "../types/layout";
import { findLayoutKeyForTerminal, findTerminalIds } from "./layoutUtils";

export interface TerminalVisualTextSnapshot {
  terminalId: string;
  cols: number;
  rows: number;
  lines: readonly string[];
}

export interface TerminalVisualChangeSummary {
  exactChanged: boolean;
  changed: boolean;
  repeatingHashOscillation: boolean;
  hasThreeSamples: boolean;
  changedRows: number;
  changedChars: number;
  totalRows: number;
  totalCells: number;
  changedRowRatio: number;
  changedCharRatio: number;
}

export function getTabTerminalIds(
  layouts: Record<string, LayoutNode>,
  tabRootTerminalId: string | null,
  sessionIds: Set<string>
): string[] {
  if (!tabRootTerminalId) {
    return [];
  }

  const layout = layouts[tabRootTerminalId];
  if (!layout) {
    return sessionIds.has(tabRootTerminalId) ? [tabRootTerminalId] : [];
  }

  return findTerminalIds(layout).filter((terminalId) => sessionIds.has(terminalId));
}

export function getTabStatusTerminalIds(
  layouts: Record<string, LayoutNode>,
  tabRootTerminalId: string | null,
  sessionIds: Set<string>
): string[] {
  const terminalIds = getTabTerminalIds(layouts, tabRootTerminalId, sessionIds);
  if (!tabRootTerminalId || terminalIds.includes(tabRootTerminalId) || !sessionIds.has(tabRootTerminalId)) {
    return terminalIds;
  }

  return [tabRootTerminalId, ...terminalIds];
}

export function getTabRootTerminalIds(
  layouts: Record<string, LayoutNode>,
  sessionIds: Iterable<string>
): string[] {
  const tabRoots = new Set<string>();

  for (const sessionId of sessionIds) {
    tabRoots.add(findLayoutKeyForTerminal(layouts, sessionId) ?? sessionId);
  }

  return [...tabRoots].sort();
}

export function buildCompoundScreenshotHashInput(componentHashes: readonly string[]): string {
  return [
    "dispatcher:screenshot-compound:v1",
    `count=${componentHashes.length}`,
    ...componentHashes,
  ].join("\n");
}

export function buildTerminalVisualHashInput(snapshot: TerminalVisualTextSnapshot): string {
  return [
    "dispatcher:screenshot-component:v1",
    `terminal=${snapshot.terminalId}`,
    `cols=${Math.max(0, Math.floor(snapshot.cols))}`,
    `rows=${Math.max(0, Math.floor(snapshot.rows))}`,
    ...snapshot.lines,
  ].join("\n");
}

function countChangedChars(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length);
  let changed = 0;
  for (let index = 0; index < maxLength; index += 1) {
    if (left[index] !== right[index]) {
      changed += 1;
    }
  }
  return changed;
}

function summarizeComponentChange(
  previous: TerminalVisualTextSnapshot | null,
  current: TerminalVisualTextSnapshot | null
): Pick<TerminalVisualChangeSummary, "changedRows" | "changedChars" | "totalRows" | "totalCells"> {
  const rows = Math.max(previous?.rows ?? 0, current?.rows ?? 0, previous?.lines.length ?? 0, current?.lines.length ?? 0);
  const cols = Math.max(previous?.cols ?? 0, current?.cols ?? 0, 1);
  let changedRows = 0;
  let changedChars = 0;

  for (let row = 0; row < rows; row += 1) {
    const previousLine = previous?.lines[row] ?? "";
    const currentLine = current?.lines[row] ?? "";
    if (previousLine === currentLine) {
      continue;
    }
    changedRows += 1;
    changedChars += countChangedChars(previousLine, currentLine);
  }

  return {
    changedRows,
    changedChars,
    totalRows: rows,
    totalCells: rows * cols,
  };
}

export function summarizeTerminalVisualChange(args: {
  previousComponents: readonly TerminalVisualTextSnapshot[];
  currentComponents: readonly TerminalVisualTextSnapshot[];
  previousHash: string | null;
  currentHash: string;
  recentHashes?: readonly string[];
}): TerminalVisualChangeSummary {
  const exactChanged = args.previousHash !== null && args.previousHash !== args.currentHash;
  const recentHashes = args.recentHashes ?? [];
  const hasThreeSamples = recentHashes.length >= 2;
  const repeatingHashOscillation =
    hasThreeSamples
    && recentHashes[recentHashes.length - 2] === args.currentHash
    && recentHashes[recentHashes.length - 1] !== args.currentHash;

  const previousByTerminalId = new Map(
    args.previousComponents.map((component) => [component.terminalId, component])
  );
  const currentByTerminalId = new Map(
    args.currentComponents.map((component) => [component.terminalId, component])
  );
  const terminalIds = new Set([
    ...previousByTerminalId.keys(),
    ...currentByTerminalId.keys(),
  ]);

  let changedRows = 0;
  let changedChars = 0;
  let totalRows = 0;
  let totalCells = 0;
  for (const terminalId of terminalIds) {
    const summary = summarizeComponentChange(
      previousByTerminalId.get(terminalId) ?? null,
      currentByTerminalId.get(terminalId) ?? null
    );
    changedRows += summary.changedRows;
    changedChars += summary.changedChars;
    totalRows += summary.totalRows;
    totalCells += summary.totalCells;
  }

  const changedRowRatio = totalRows > 0 ? changedRows / totalRows : 0;
  const changedCharRatio = totalCells > 0 ? changedChars / totalCells : 0;

  return {
    exactChanged,
    changed: exactChanged && hasThreeSamples && !repeatingHashOscillation,
    repeatingHashOscillation,
    hasThreeSamples,
    changedRows,
    changedChars,
    totalRows,
    totalCells,
    changedRowRatio,
    changedCharRatio,
  };
}
