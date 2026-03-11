export interface SplitNode {
  type: "split";
  id: string;
  direction: "horizontal" | "vertical";
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export interface LeafNode {
  type: "terminal";
  id: string;
  terminalId: string;
}

export type LayoutNode = SplitNode | LeafNode;
