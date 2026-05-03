import { useEffect } from "react";
import { debugLog } from "../lib/debugLog";
import { normalizeRestoredTmuxState } from "../lib/restoredTmuxState";
import { useLayoutStore } from "../stores/useLayoutStore";
import { useProjectStore } from "../stores/useProjectStore";
import { useTerminalStore } from "../stores/useTerminalStore";

export function useStartupStoreNormalization() {
  useEffect(() => {
    const normalized = normalizeRestoredTmuxState({
      sessions: useTerminalStore.getState().sessions,
      activeTerminalId: useTerminalStore.getState().activeTerminalId,
      projects: useProjectStore.getState().projects,
      nodes: useProjectStore.getState().nodes,
      activeProjectId: useProjectStore.getState().activeProjectId,
      projectOrder: useProjectStore.getState().projectOrder,
      layouts: useLayoutStore.getState().layouts,
    });

    if (!normalized.changed) {
      return;
    }

    useProjectStore.setState({
      projects: normalized.projects,
      nodes: normalized.nodes,
      activeProjectId: normalized.activeProjectId,
      projectOrder: normalized.projectOrder,
    });
    useLayoutStore.setState({
      layouts: normalized.layouts,
    });
    useTerminalStore.setState({
      sessions: normalized.sessions,
      activeTerminalId: normalized.activeTerminalId,
    });

    debugLog("startup.normalize", "restored tmux state normalized", {
      projects: Object.keys(normalized.projects).length,
      nodes: Object.keys(normalized.nodes).length,
      layouts: Object.keys(normalized.layouts).length,
      sessions: Object.keys(normalized.sessions).length,
      activeProjectId: normalized.activeProjectId,
      activeTerminalId: normalized.activeTerminalId,
    });
  }, []);
}
