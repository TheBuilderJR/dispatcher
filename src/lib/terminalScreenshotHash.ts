import type { LayoutNode } from "../types/layout";
import { findLayoutKeyForTerminal, findTerminalIds } from "./layoutUtils";

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
