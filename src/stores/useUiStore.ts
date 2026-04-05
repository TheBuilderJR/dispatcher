import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiStore {
  isTerminalNotesOpen: boolean;
  isDetailPanelCollapsed: boolean;
  setTerminalNotesOpen: (isOpen: boolean) => void;
  setDetailPanelCollapsed: (isCollapsed: boolean) => void;
  toggleTerminalNotesOpen: () => void;
  toggleDetailPanelCollapsed: () => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      isTerminalNotesOpen: false,
      isDetailPanelCollapsed: false,
      setTerminalNotesOpen: (isOpen) => set({ isTerminalNotesOpen: isOpen }),
      setDetailPanelCollapsed: (isCollapsed) => set({ isDetailPanelCollapsed: isCollapsed }),
      toggleTerminalNotesOpen: () =>
        set((state) => ({ isTerminalNotesOpen: !state.isTerminalNotesOpen })),
      toggleDetailPanelCollapsed: () =>
        set((state) => ({ isDetailPanelCollapsed: !state.isDetailPanelCollapsed })),
    }),
    {
      name: "dispatcher-ui",
      partialize: (state) => ({
        isTerminalNotesOpen: state.isTerminalNotesOpen,
        isDetailPanelCollapsed: state.isDetailPanelCollapsed,
      }),
    }
  )
);
