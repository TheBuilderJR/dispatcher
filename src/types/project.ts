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
  hidden?: boolean;
  children?: string[];
  terminalId?: string;
  parentId: string | null;
}
