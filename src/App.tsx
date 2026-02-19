import { useEffect, useCallback, useState, useRef } from "react";
import { Sidebar } from "./components/Sidebar/Sidebar";
import { ProjectView } from "./components/Layout/ProjectView";
import { NameDialog } from "./components/common/NameDialog";
import { useProjectStore } from "./stores/useProjectStore";
import { useLayoutStore } from "./stores/useLayoutStore";
import { useTerminalStore } from "./stores/useTerminalStore";
import { useFontSizeStore } from "./stores/useFontSizeStore";
import { onTerminalExit } from "./lib/terminalEvents";
import { findTerminalIds, findLayoutKeyForTerminal, findSiblingTerminalId } from "./lib/layoutUtils";
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
  const removeLayout = useLayoutStore((s) => s.removeLayout);

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
      const terminalId = generateId();

      addProject({
        id: projId,
        name: projectName,
        cwd: "",
        rootGroupId,
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
      initLayout(terminalId, terminalId);
    },
    [addProject, addNode, addChildToNode, addSession, initLayout]
  );


  const createTerminalInProject = useCallback(
    (projectId: string, terminalName: string) => {
      const project = projects[projectId];
      if (!project) return;

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

      addSession(terminalId, terminalName);
      // Each tab terminal gets its own standalone layout
      initLayout(terminalId, terminalId);

      // Query the actual cwd from an existing terminal in this project
      // (like split pane does) and cd into it once the new PTY is ready.
      const allNodes = useProjectStore.getState().nodes;
      const rootNode = allNodes[project.rootGroupId];
      if (rootNode?.children) {
        for (const childId of rootNode.children) {
          const child = allNodes[childId];
          if (child?.type === "terminal" && child.terminalId && child.terminalId !== terminalId) {
            getTerminalCwd(child.terminalId)
              .then((cwd) => {
                if (cwd) {
                  const escaped = cwd.replace(/'/g, "'\\''");
                  writeTerminal(terminalId, ` cd '${escaped}' && clear\n`).catch(() => {});
                }
              })
              .catch(() => {});
            break;
          }
        }
      }
    },
    [projects, addNode, addChildToNode, addSession, initLayout]
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

      // Each tab terminal owns its own layout (keyed by terminalId),
      // so moving between projects only requires moving the tree node.
      const moveNode = useProjectStore.getState().moveNode;
      moveNode(treeNodeId, toProject.rootGroupId);
    },
    [projects, nodes]
  );

  const handleDeleteProject = useCallback(
    (projectId: string) => {
      const project = projects[projectId];
      if (!project) return;

      const allLayouts = useLayoutStore.getState().layouts;
      const rootNode = nodes[project.rootGroupId];

      // Close every tab and its split panes
      if (rootNode?.children) {
        for (const childId of rootNode.children) {
          const child = nodes[childId];
          if (child?.type === "terminal" && child.terminalId) {
            const layout = allLayouts[child.terminalId];
            if (layout) {
              for (const id of findTerminalIds(layout)) {
                closeTerminal(id).catch(() => {});
                disposeTerminalInstance(id);
                removeSession(id);
              }
            }
            removeLayout(child.terminalId);
          }
          removeNode(childId);
        }
      }
      removeNode(project.rootGroupId);
      removeProject(projectId);
    },
    [projects, nodes, removeProject, removeNode, removeSession, removeLayout]
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

      // Close all terminals in this tab (including split panes)
      const layout = useLayoutStore.getState().layouts[terminalId];
      if (layout) {
        for (const id of findTerminalIds(layout)) {
          closeTerminal(id).catch(() => {});
          disposeTerminalInstance(id);
          removeSession(id);
        }
      }
      removeLayout(terminalId);
    },
    [projects, nodes, removeChildFromNode, removeNode, removeSession, removeLayout]
  );

  const handleSplitPane = useCallback(
    (targetTerminalId: string, direction: "horizontal" | "vertical") => {
      if (!activeProject) return;

      const allLayouts = useLayoutStore.getState().layouts;
      const layoutKey = findLayoutKeyForTerminal(allLayouts, targetTerminalId);
      if (!layoutKey) return;

      const terminalId = generateId();

      // Split panes only create a session and layout entry — no sidebar
      // tree node.  The sidebar tracks explicitly created terminals (⌘T);
      // split panes are purely a layout concern.
      addSession(terminalId, undefined);
      splitTerminal(layoutKey, targetTerminalId, terminalId, direction);

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

      const allLayouts = useLayoutStore.getState().layouts;
      const layoutKey = findLayoutKeyForTerminal(allLayouts, terminalId);
      if (!layoutKey) return;

      const isTabRoot = layoutKey === terminalId;

      if (isTabRoot) {
        // Closing a tab root: close the entire tab (including split panes)
        const layout = allLayouts[layoutKey];
        if (layout) {
          const allTerminals = findTerminalIds(layout);
          // Close split panes first, then the tab root, so activeTerminalId
          // falls through to another tab (not an about-to-be-closed split pane).
          const splitPanes = allTerminals.filter((id) => id !== terminalId);
          for (const id of splitPanes) {
            closeTerminal(id).catch(() => {});
            disposeTerminalInstance(id);
            removeSession(id);
          }
        }
        closeTerminal(terminalId).catch(() => {});
        disposeTerminalInstance(terminalId);
        removeSession(terminalId);
        removeLayout(layoutKey);

        // Remove the tree node for this tab terminal
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
      } else {
        // Closing a split pane within a tab.
        // Find the sibling BEFORE mutating the layout so focus stays in this tab
        // instead of jumping to a terminal in a different tab.
        const layout = allLayouts[layoutKey];
        const sibling = layout ? findSiblingTerminalId(layout, terminalId) : null;

        closeTerminal(terminalId).catch(() => {});
        disposeTerminalInstance(terminalId);
        removeTerminalFromLayout(layoutKey, terminalId);

        if (sibling && useTerminalStore.getState().activeTerminalId === terminalId) {
          useTerminalStore.getState().setActiveTerminal(sibling);
        }
        removeSession(terminalId);
      }

      // If no more tabs remain, clean up the project
      const updatedNodes = useProjectStore.getState().nodes;
      const updatedRoot = updatedNodes[activeProject.rootGroupId];
      if (!updatedRoot?.children || updatedRoot.children.length === 0) {
        removeNode(activeProject.rootGroupId);
        removeProject(activeProject.id);
      }
    },
    [activeProject, removeTerminalFromLayout, removeLayout, removeSession, removeChildFromNode, removeNode, removeProject]
  );

  // Find the layout key (tab root terminal ID) for the currently active terminal.
  const layouts = useLayoutStore((s) => s.layouts);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const activeLayoutKey = (() => {
    if (!activeProject || !activeTerminalId) return null;
    return findLayoutKeyForTerminal(layouts, activeTerminalId);
  })();

  // Auto-create first project on launch
  useEffect(() => {
    if (Object.keys(projects).length === 0) {
      setDialog({ type: "new-project-with-terminal" });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts — use a ref so the listener is registered once and never
  // torn down/re-added when dependencies like activeProject change.  This
  // prevents keydown events from being lost during effect re-registration
  // (particularly noticeable when cycling wraps across projects).
  const keyDownRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyDownRef.current = (e: KeyboardEvent) => {
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
      const activeTermId = useTerminalStore.getState().activeTerminalId;
      if (activeTermId) {
        handleClosePane(activeTermId);
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
    // Cycle terminals in sidebar: Cmd+Shift+] (next) / Cmd+Shift+[ (prev)
    if (isMeta && e.shiftKey && (e.code === "BracketRight" || e.code === "BracketLeft")) {
      e.preventDefault();
      const { projects: allProjects, projectOrder, nodes: currentNodes } = useProjectStore.getState();
      // Build flat list of { terminalId, projectId } across all projects in sidebar order
      const allTerminals: { terminalId: string; projectId: string }[] = [];
      for (const projId of projectOrder) {
        const proj = allProjects[projId];
        if (!proj) continue;
        const rootNode = currentNodes[proj.rootGroupId];
        if (!rootNode?.children) continue;
        for (const childId of rootNode.children) {
          const child = currentNodes[childId];
          if (child?.type === "terminal" && child.terminalId) {
            allTerminals.push({ terminalId: child.terminalId, projectId: projId });
          }
        }
      }
      if (allTerminals.length < 2) return;
      const activeTermId = useTerminalStore.getState().activeTerminalId;
      let currentIdx = activeTermId ? allTerminals.findIndex((t) => t.terminalId === activeTermId) : -1;
      // If active terminal is a split pane (not a tab root), find its parent tab
      if (currentIdx === -1 && activeTermId) {
        const layouts = useLayoutStore.getState().layouts;
        const parentKey = findLayoutKeyForTerminal(layouts, activeTermId);
        if (parentKey) {
          currentIdx = allTerminals.findIndex((t) => t.terminalId === parentKey);
        }
      }
      const forward = e.code === "BracketRight";
      let nextIdx: number;
      if (currentIdx === -1) {
        // Not found — go to first or last depending on direction
        nextIdx = forward ? 0 : allTerminals.length - 1;
      } else if (forward) {
        // At end → jump to first, otherwise next
        nextIdx = currentIdx >= allTerminals.length - 1 ? 0 : currentIdx + 1;
      } else {
        // At start → jump to last, otherwise previous
        nextIdx = currentIdx <= 0 ? allTerminals.length - 1 : currentIdx - 1;
      }
      const next = allTerminals[nextIdx];
      useProjectStore.getState().setActiveProject(next.projectId);
      useTerminalStore.getState().setActiveTerminal(next.terminalId);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => keyDownRef.current(e);
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
        {activeProject && activeLayoutKey ? (
          <ProjectView
            layoutId={activeLayoutKey}
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
