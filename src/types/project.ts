export interface Project {
  id: string;
  name: string;
  cwd: string;
  rootGroupId: string;
  expanded: boolean;
}

export interface TreeNode {
  id: string;
  type: "group" | "terminal";
  name: string;
  description?: string;
  children?: string[];
  terminalId?: string;
  parentId: string | null;
}
