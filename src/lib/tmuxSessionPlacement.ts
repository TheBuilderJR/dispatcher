export interface TmuxSessionPlacement {
  projectId: string;
  parentNodeId: string;
  transportProjectId: string;
  transportParentNodeId: string;
}

export function resolveRecoveredTmuxSessionPlacement(options: {
  transportProjectId: string;
  transportParentNodeId: string;
  windowProjectId?: string | null;
  windowParentNodeId?: string | null;
}): TmuxSessionPlacement {
  return {
    projectId: options.windowProjectId ?? options.transportProjectId,
    parentNodeId: options.windowParentNodeId ?? options.transportParentNodeId,
    transportProjectId: options.transportProjectId,
    transportParentNodeId: options.transportParentNodeId,
  };
}

export function resolveTmuxWindowPlacementFromPlaceholder(options: {
  currentProjectId: string;
  currentParentNodeId: string;
  existingWindowCount: number;
  placeholderProjectId?: string | null;
  placeholderParentNodeId?: string | null;
}): {
  projectId: string;
  parentNodeId: string;
  adopted: boolean;
} {
  if (
    options.existingWindowCount === 0
    && options.placeholderProjectId
    && options.placeholderParentNodeId
  ) {
    return {
      projectId: options.placeholderProjectId,
      parentNodeId: options.placeholderParentNodeId,
      adopted:
        options.placeholderProjectId !== options.currentProjectId
        || options.placeholderParentNodeId !== options.currentParentNodeId,
    };
  }

  return {
    projectId: options.currentProjectId,
    parentNodeId: options.currentParentNodeId,
    adopted: false,
  };
}

export function canReuseTmuxWindowPlaceholder(options: {
  sessionParentNodeId: string;
  placeholderParentNodeId?: string | null;
}): boolean {
  return Boolean(options.placeholderParentNodeId)
    && options.placeholderParentNodeId === options.sessionParentNodeId;
}
