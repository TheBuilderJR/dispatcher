import { useCallback, useRef, useState } from "react";
import { useProjectStore } from "../stores/useProjectStore";

interface DragState {
  draggedNodeId: string | null;
  dropTargetId: string | null;
}

export function useDragAndDrop() {
  const [dragState, setDragState] = useState<DragState>({
    draggedNodeId: null,
    dropTargetId: null,
  });
  const moveNode = useProjectStore((s) => s.moveNode);

  const handleDragStart = useCallback((nodeId: string) => {
    setDragState({ draggedNodeId: nodeId, dropTargetId: null });
  }, []);

  const handleDragOver = useCallback((targetId: string) => {
    setDragState((s) => ({ ...s, dropTargetId: targetId }));
  }, []);

  const handleDrop = useCallback(() => {
    const { draggedNodeId, dropTargetId } = dragState;
    if (draggedNodeId && dropTargetId && draggedNodeId !== dropTargetId) {
      moveNode(draggedNodeId, dropTargetId);
    }
    setDragState({ draggedNodeId: null, dropTargetId: null });
  }, [dragState, moveNode]);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggedNodeId: null, dropTargetId: null });
  }, []);

  return {
    dragState,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDragEnd,
  };
}
