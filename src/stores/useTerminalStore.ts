import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TerminalSession } from "../types/terminal";

interface TerminalStore {
  sessions: Record<string, TerminalSession>;
  activeTerminalId: string | null;

  addSession: (id: string, title?: string, cwd?: string) => void;
  removeSession: (id: string) => void;
  setActiveTerminal: (id: string | null) => void;
  updateTitle: (id: string, title: string) => void;
  updateNotes: (id: string, notes: string) => void;
}

let terminalCounter = 0;

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set) => ({
      sessions: {},
      activeTerminalId: null,

      addSession: (id, title, cwd) => {
        terminalCounter++;
        set((state) => ({
          sessions: {
            ...state.sessions,
            [id]: {
              id,
              title: title ?? `Terminal ${terminalCounter}`,
              notes: "",
              cwd,
            },
          },
          activeTerminalId: id,
        }));
      },

      removeSession: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.sessions;
          const ids = Object.keys(rest);
          return {
            sessions: rest,
            activeTerminalId:
              state.activeTerminalId === id
                ? ids.length > 0
                  ? ids[ids.length - 1]
                  : null
                : state.activeTerminalId,
          };
        }),

      setActiveTerminal: (id) => set({ activeTerminalId: id }),

      updateTitle: (id, title) =>
        set((state) => {
          const session = state.sessions[id];
          if (!session) return state;
          return {
            sessions: { ...state.sessions, [id]: { ...session, title } },
          };
        }),

      updateNotes: (id, notes) =>
        set((state) => {
          const session = state.sessions[id];
          if (!session) return state;
          return {
            sessions: { ...state.sessions, [id]: { ...session, notes } },
          };
        }),
    }),
    {
      name: "dispatcher-terminals",
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<TerminalStore>) };
        const updated: Record<string, TerminalSession> = {};
        for (const [id, session] of Object.entries(merged.sessions)) {
          updated[id] = { ...session, notes: session.notes ?? "" };
        }
        return { ...merged, sessions: updated };
      },
    }
  )
);
