import { useEffect, useCallback, useState, useRef } from "react";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { ProjectView } from "./components/Layout/ProjectView";
import { NameDialog } from "./components/common/NameDialog";
import { useProjectStore } from "./stores/useProjectStore";
import { useLayoutStore } from "./stores/useLayoutStore";
import { useTerminalStore } from "./stores/useTerminalStore";
import { useFontSizeStore } from "./stores/useFontSizeStore";
import { onTerminalExit } from "./lib/terminalEvents";
import { findTerminalIds } from "./lib/layoutUtils";
import { closeTerminal, warmPool, getTerminalCwd, writeTerminal } from "./lib/tauriCommands";
import { disposeTerminalInstance } from "./hooks/useTerminalBridge";
import "./App.css";

function generateId(): string {
  return crypto.randomUUID();
}

type DialogMode =
  | { type: "new-project" }
  | { type: "new-terminal"; projectId: string }
  | { type: "new-project-with-terminal" }
  | null;

export default function App() {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const addProject = useProjectStore((s) => s.addProject);
  const removeProject = useProjectStore((s) => s.removeProject);
  const addNode = useProjectStore((s) => s.addNode);
  const removeNode = useProjectStore((s) => s.removeNode);
  const addChildToNode = useProjectStore((s) => s.addChildToNode);
  const removeChildFromNode = useProjectStore((s) => s.removeChildFromNode);
  const nodes = useProjectStore((s) => s.nodes);
  const addSession = useTerminalStore((s) => s.addSession);
  const removeSession = useTerminalStore((s) => s.removeSession);
  const updateStatus = useTerminalStore((s) => s.updateStatus);
  const initLayout = useLayoutStore((s) => s.initLayout);
  const splitTerminal = useLayoutStore((s) => s.splitTerminal);
  const removeTerminalFromLayout = useLayoutStore((s) => s.removeTerminal);

  const activeProject = activeProjectId ? projects[activeProjectId] : null;

  const [dialog, setDialog] = useState<DialogMode>(null);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const sidebarDividerRef = useRef<HTMLDivElement>(null);

  const handleSidebarDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(160, Math.min(480, startWidth + (e.clientX - startX)));
      setSidebarWidth(newWidth);
    };

    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth]);

  // Pre-spawn PTY pool for instant terminal creation
  useEffect(() => {
    warmPool(3).catch(() => {});
  }, []);

  // Listen for terminal exits
  useEffect(() => {
    const unlisten = onTerminalExit((payload) => {
      const status = payload.exit_code === 0 ? "done" : "error";
      updateStatus(payload.terminal_id, status, payload.exit_code);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [updateStatus]);

  const createProjectWithTerminal = useCallback(
    (projectName: string, terminalName: string) => {
      const projId = generateId();
      const rootGroupId = generateId();
      const layoutId = generateId();
      const terminalId = generateId();

      addProject({
        id: projId,
        name: projectName,
        cwd: "",
        rootGroupId,
        layoutId,
        expanded: true,
      });

      addNode({
        id: rootGroupId,
        type: "group",
        name: "Root",
        children: [],
        parentId: null,
      });

      const nodeId = generateId();
      addNode({
        id: nodeId,
        type: "terminal",
        name: terminalName,
        terminalId,
        parentId: rootGroupId,
      });
      addChildToNode(rootGroupId, nodeId);

      addSession(terminalId, terminalName);
      initLayout(layoutId, terminalId);
    },
    [addProject, addNode, addChildToNode, addSession, initLayout]
  );

  // Synchronous cwd lookup from existing sessions (no lsof / IPC)
  const getProjectTerminalCwdSync = useCallback(
    (projectId: string): string | undefined => {
      const project = projects[projectId];
      if (!project) return undefined;
      const layout = useLayoutStore.getState().layouts[project.layoutId];
      if (!layout) return undefined;
      const ids = findTerminalIds(layout);
      for (const id of ids) {
        const session = useTerminalStore.getState().sessions[id];
        if (session?.cwd) return session.cwd;
      }
      return undefined;
    },
    [projects]
  );

  const createTerminalInProject = useCallback(
    (projectId: string, terminalName: string) => {
      const project = projects[projectId];
      if (!project) return;

      // Use stored cwd from an existing session (instant) instead of lsof
      const cwd = getProjectTerminalCwdSync(projectId);

      const terminalId = generateId();
      const nodeId = generateId();

      addNode({
        id: nodeId,
        type: "terminal",
        name: terminalName,
        terminalId,
        parentId: project.rootGroupId,
      });
      addChildToNode(project.rootGroupId, nodeId);

      addSession(terminalId, terminalName, cwd);

      const existingLayout = useLayoutStore.getState().layouts[project.layoutId];
      if (existingLayout) {
        const activeTermId = useTerminalStore.getState().activeTerminalId;
        if (activeTermId) {
          splitTerminal(project.layoutId, activeTermId, terminalId, "horizontal");
        } else {
          const ids = findTerminalIds(existingLayout);
          if (ids.length > 0) {
            splitTerminal(project.layoutId, ids[0], terminalId, "horizontal");
          }
        }
      } else {
        initLayout(project.layoutId, terminalId);
      }
    },
    [projects, getProjectTerminalCwdSync, addNode, addChildToNode, addSession, initLayout, splitTerminal]
  );

  const handleNewTerminal = useCallback(() => {
    if (activeProject) {
      createTerminalInProject(activeProject.id, "Shell");
    } else {
      setDialog({ type: "new-project-with-terminal" });
    }
  }, [activeProject, createTerminalInProject]);

  const handleNewProject = useCallback(() => {
    setDialog({ type: "new-project" });
  }, []);

  const handleNewTerminalInProject = useCallback(
    (projectId: string) => {
      createTerminalInProject(projectId, "Shell");
    },
    [createTerminalInProject]
  );

  const handleMoveTerminal = useCallback(
    (terminalId: string, fromProjectId: string, toProjectId: string) => {
      const fromProject = projects[fromProjectId];
      const toProject = projects[toProjectId];
      if (!fromProject || !toProject) return;

      // Find the tree node for this terminal in the source project
      const fromRoot = nodes[fromProject.rootGroupId];
      if (!fromRoot?.children) return;

      let treeNodeId: string | null = null;
      for (const childId of fromRoot.children) {
        const child = nodes[childId];
        if (child?.type === "terminal" && child.terminalId === terminalId) {
          treeNodeId = childId;
          break;
        }
      }
      if (!treeNodeId) return;

      // Move the tree node to the target project
      const moveNode = useProjectStore.getState().moveNode;
      moveNode(treeNodeId, toProject.rootGroupId);

      // Remove from source layout, add to target layout
      removeTerminalFromLayout(fromProject.layoutId, terminalId);

      const targetLayout = useLayoutStore.getState().layouts[toProject.layoutId];
      if (targetLayout) {
        const ids = findTerminalIds(targetLayout);
        if (ids.length > 0) {
          splitTerminal(toProject.layoutId, ids[0], terminalId, "horizontal");
        }
      } else {
        initLayout(toProject.layoutId, terminalId);
      }
    },
    [projects, nodes, removeTerminalFromLayout, splitTerminal, initLayout]
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      const project = projects[projectId];
      if (!project) return;

      // Close every pane in the layout (includes split panes without tree nodes)
      const layout = useLayoutStore.getState().layouts[project.layoutId];
      if (layout) {
        for (const id of findTerminalIds(layout)) {
          closeTerminal(id).catch(() => {});
          disposeTerminalInstance(id);
          removeSession(id);
        }
      }

      // Clean up sidebar tree nodes
      const rootNode = nodes[project.rootGroupId];
      if (rootNode?.children) {
        for (const childId of rootNode.children) {
          removeNode(childId);
        }
      }
      removeNode(project.rootGroupId);
      removeProject(projectId);
    },
    [projects, nodes, removeProject, removeNode, removeSession]
  );

  const handleDeleteTerminal = useCallback(
    (terminalId: string, projectId: string) => {
      const project = projects[projectId];
      if (!project) return;

      // Find and remove the tree node for this terminal
      const rootNode = nodes[project.rootGroupId];
      if (rootNode?.children) {
        for (const childId of rootNode.children) {
          const child = nodes[childId];
          if (child?.type === "terminal" && child.terminalId === terminalId) {
            removeChildFromNode(project.rootGroupId, childId);
            removeNode(childId);
            break;
          }
        }
      }

      closeTerminal(terminalId).catch(() => {});
      disposeTerminalInstance(terminalId);
      removeTerminalFromLayout(project.layoutId, terminalId);
      removeSession(terminalId);
    },
    [projects, nodes, removeChildFromNode, removeNode, removeSession, removeTerminalFromLayout]
  );

  const handleSplitPane = useCallback(
    (targetTerminalId: string, direction: "horizontal" | "vertical") => {
      if (!activeProject) return;

      const terminalId = generateId();

      // Split panes only create a session and layout entry — no sidebar
      // tree node.  The sidebar tracks explicitly created terminals (⌘T);
      // split panes are purely a layout concern.
      addSession(terminalId, undefined);
      splitTerminal(activeProject.layoutId, targetTerminalId, terminalId, direction);

      // Look up the source terminal's actual cwd in the background
      // and cd into it once the new PTY is ready.
      getTerminalCwd(targetTerminalId)
        .then((cwd) => {
          if (cwd) {
            const escaped = cwd.replace(/'/g, "'\\''");
            writeTerminal(terminalId, ` cd '${escaped}' && clear\n`).catch(() => {});
          }
        })
        .catch(() => {});
    },
    [activeProject, addSession, splitTerminal]
  );

  const handleClosePane = useCallback(
    (terminalId: string) => {
      if (!activeProject) return;

      closeTerminal(terminalId).catch(() => {});
      disposeTerminalInstance(terminalId);
      removeTerminalFromLayout(activeProject.layoutId, terminalId);
      removeSession(terminalId);

      // Remove only the tree node for this specific terminal
      const currentNodes = useProjectStore.getState().nodes;
      const rootNode = currentNodes[activeProject.rootGroupId];
      if (rootNode?.children) {
        for (const childId of rootNode.children) {
          const child = currentNodes[childId];
          if (child?.type === "terminal" && child.terminalId === terminalId) {
            removeChildFromNode(activeProject.rootGroupId, childId);
            removeNode(childId);
            break;
          }
        }
      }

      // If layout is now empty and no tree children remain, clean up the project
      const layoutAfter = useLayoutStore.getState().layouts[activeProject.layoutId];
      if (!layoutAfter) {
        const updatedNodes = useProjectStore.getState().nodes;
        const updatedRoot = updatedNodes[activeProject.rootGroupId];
        if (!updatedRoot?.children || updatedRoot.children.length === 0) {
          removeNode(activeProject.rootGroupId);
          removeProject(activeProject.id);
        }
      }
    },
    [activeProject, removeTerminalFromLayout, removeSession, removeChildFromNode, removeNode, removeProject]
  );

  // Compute rootTerminalId from the layout (not the sidebar tree) so the
  // project view renders even when only split panes exist.
  const layouts = useLayoutStore((s) => s.layouts);
  const rootTerminalId = (() => {
    if (!activeProject) return null;
    const layout = layouts[activeProject.layoutId];
    if (!layout) return null;
    const ids = findTerminalIds(layout);
    return ids.length > 0 ? ids[0] : null;
  })();

  // Auto-create first project on launch
  useEffect(() => {
    if (Object.keys(projects).length === 0) {
      setDialog({ type: "new-project-with-terminal" });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (dialog) return; // Don't handle shortcuts while dialog is open
      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta && e.key === "t") {
        e.preventDefault();
        handleNewTerminal();
      }
      if (isMeta && e.key === "n") {
        e.preventDefault();
        handleNewProject();
      }
      if (isMeta && !e.shiftKey && e.key === "d") {
        e.preventDefault();
        const activeTermId = useTerminalStore.getState().activeTerminalId;
        if (activeTermId && activeProject) {
          handleSplitPane(activeTermId, "horizontal");
        }
      }
      if (isMeta && e.shiftKey && e.key === "d") {
        e.preventDefault();
        const activeTermId = useTerminalStore.getState().activeTerminalId;
        if (activeTermId && activeProject) {
          handleSplitPane(activeTermId, "vertical");
        }
      }
      if (isMeta && e.key === "w") {
        e.preventDefault();
        if (!activeProject) return;
        const layout = useLayoutStore.getState().layouts[activeProject.layoutId];
        if (!layout) return;
        const layoutTerminals = findTerminalIds(layout);
        const activeTermId = useTerminalStore.getState().activeTerminalId;
        const termToClose = activeTermId && layoutTerminals.includes(activeTermId)
          ? activeTermId
          : layoutTerminals[0];
        if (termToClose) {
          handleClosePane(termToClose);
        }
      }
      // Font size: Cmd+= / Cmd+- / Cmd+0
      if (isMeta && e.key === "=") {
        e.preventDefault();
        useFontSizeStore.getState().increase();
      }
      if (isMeta && e.key === "-") {
        e.preventDefault();
        useFontSizeStore.getState().decrease();
      }
      if (isMeta && e.key === "0") {
        e.preventDefault();
        useFontSizeStore.getState().reset();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialog, handleNewTerminal, handleNewProject, handleSplitPane, handleClosePane, activeProject]);

  const handleDialogConfirm = (name: string) => {
    if (dialog?.type === "new-project" || dialog?.type === "new-project-with-terminal") {
      setDialog(null);
      createProjectWithTerminal(name, "Shell");
      return;
    }
  };

  return (
    <div className="app">
      <Sidebar
        onNewTerminal={handleNewTerminal}
        onNewTerminalInProject={handleNewTerminalInProject}
        onNewProject={handleNewProject}
        onDeleteProject={handleDeleteProject}
        onDeleteTerminal={handleDeleteTerminal}
        onMoveTerminal={handleMoveTerminal}
        style={{ width: sidebarWidth, minWidth: sidebarWidth }}
      />
      <div
        ref={sidebarDividerRef}
        className="sidebar-divider"
        onMouseDown={handleSidebarDividerMouseDown}
      />
      <div className="main-content">
        {activeProject && rootTerminalId ? (
          <ProjectView
            layoutId={activeProject.layoutId}
            rootTerminalId={rootTerminalId}
            onSplitPane={handleSplitPane}
            onClosePane={handleClosePane}
          />
        ) : (
          <div className="empty-view">
            <p>Create a project to get started</p>
          </div>
        )}
      </div>

      {dialog?.type === "new-project" && (
        <NameDialog
          title="New Project"
          placeholder="Project name"
          onConfirm={handleDialogConfirm}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === "new-project-with-terminal" && (
        <NameDialog
          title="New Project"
          placeholder="Project name"
          onConfirm={handleDialogConfirm}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog?.type === "new-terminal" && (
        <NameDialog
          title="New Terminal"
          placeholder="Terminal name"
          onConfirm={handleDialogConfirm}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
