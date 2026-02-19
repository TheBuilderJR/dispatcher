type DragInfo =
  | { type: "project"; projectId: string }
  | { type: "terminal"; terminalId: string; projectId: string; nodeId: string };

let currentDrag: DragInfo | null = null;

export function setDragInfo(info: DragInfo) {
  currentDrag = info;
}

export function getDragInfo(): DragInfo | null {
  return currentDrag;
}

export function clearDragInfo() {
  currentDrag = null;
}
