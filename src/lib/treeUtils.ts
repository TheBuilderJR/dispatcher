import type { TreeNode, Project } from "../types/project";
import type { TerminalSession } from "../types/terminal";

export interface VisibleTerminalRef {
  nodeId: string;
  parentNodeId: string | null;
  terminalId: string;
}

function getOrderedProjectIds(
  projects: Record<string, Project>,
  projectOrder: string[]
): string[] {
  return projectOrder.length > 0 ? projectOrder : Object.keys(projects);
}

export function collectVisibleTerminalRefs(
  nodes: Record<string, TreeNode>,
  rootNodeId: string,
  sessions: Record<string, TerminalSession>
): VisibleTerminalRef[] {
  const refs: VisibleTerminalRef[] = [];

  function visit(nodeId: string, parentNodeId: string | null) {
    const node = nodes[nodeId];
    if (!node || node.hidden) {
      return;
    }

    if (node.type === "terminal" && node.terminalId && sessions[node.terminalId]) {
      refs.push({
        nodeId,
        parentNodeId,
        terminalId: node.terminalId,
      });
      return;
    }

    if (node.type === "group" && node.children) {
      for (const childId of node.children) {
        visit(childId, nodeId);
      }
    }
  }

  const root = nodes[rootNodeId];
  if (!root?.children) {
    return refs;
  }

  for (const childId of root.children) {
    visit(childId, rootNodeId);
  }

  return refs;
}

export function findNodeByTerminalId(
  nodes: Record<string, TreeNode>,
  terminalId: string
): { nodeId: string; node: TreeNode } | null {
  for (const [nodeId, node] of Object.entries(nodes)) {
    if (node.type === "terminal" && node.terminalId === terminalId) {
      return { nodeId, node };
    }
  }
  return null;
}

export function findProjectIdForNode(
  projects: Record<string, Project>,
  projectOrder: string[],
  nodes: Record<string, TreeNode>,
  nodeId: string
): string | null {
  const rootToProjectId = new Map<string, string>();
  for (const projectId of getOrderedProjectIds(projects, projectOrder)) {
    const project = projects[projectId];
    if (project) {
      rootToProjectId.set(project.rootGroupId, projectId);
    }
  }

  const visited = new Set<string>();
  let currentNodeId: string | null = nodeId;
  while (currentNodeId && !visited.has(currentNodeId)) {
    visited.add(currentNodeId);
    const matchingProjectId = rootToProjectId.get(currentNodeId);
    if (matchingProjectId) {
      return matchingProjectId;
    }
    currentNodeId = nodes[currentNodeId]?.parentId ?? null;
  }

  return null;
}

export function findProjectIdForTerminal(
  projects: Record<string, Project>,
  projectOrder: string[],
  nodes: Record<string, TreeNode>,
  sessions: Record<string, TerminalSession>,
  terminalId: string
): string | null {
  const nodeEntry = findNodeByTerminalId(nodes, terminalId);
  if (nodeEntry) {
    const projectId = findProjectIdForNode(projects, projectOrder, nodes, nodeEntry.nodeId);
    if (projectId) {
      return projectId;
    }
  }

  for (const projectId of getOrderedProjectIds(projects, projectOrder)) {
    const project = projects[projectId];
    if (!project) {
      continue;
    }

    const refs = collectVisibleTerminalRefs(nodes, project.rootGroupId, sessions);
    if (refs.some((ref) => ref.terminalId === terminalId)) {
      return projectId;
    }
  }

  return null;
}
