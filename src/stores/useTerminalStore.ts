import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TerminalSession } from "../types/terminal";

interface TerminalStore {
  sessions: Record<string, TerminalSession>;
  activeTerminalId: string | null;

  addSession: (id: string, title?: string, cwd?: string) => void;
  removeSession: (id: string) => void;
  setActiveTerminal: (id: string | null) => void;
  setPossiblyDone: (id: string, isPossiblyDone: boolean) => void;
  setLongInactive: (id: string, isLongInactive: boolean) => void;
  setRecentlyFocused: (id: string, isRecentlyFocused: boolean) => void;
  updateTitle: (id: string, title: string) => void;
  updateNotes: (id: string, notes: string) => void;
  updateCwd: (id: string, cwd?: string) => void;
}

let terminalCounter = 0;
const FOCUS_HOLD_MS = 10_000;
const focusHoldTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function clearFocusHoldTimeout(id: string) {
  const timeoutId = focusHoldTimeouts.get(id);
  if (timeoutId !== undefined) {
    clearTimeout(timeoutId);
    focusHoldTimeouts.delete(id);
  }
}

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
              isPossiblyDone: false,
              isLongInactive: false,
              isRecentlyFocused: false,
            },
          },
          activeTerminalId: id,
        }));
      },

      removeSession: (id) => {
        clearFocusHoldTimeout(id);
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
        });
      },

      setActiveTerminal: (id) => {
        if (id) {
          set((state) => {
            const session = state.sessions[id];
            if (!session || session.isRecentlyFocused) {
              return { activeTerminalId: id };
            }
            return {
              activeTerminalId: id,
              sessions: {
                ...state.sessions,
                [id]: { ...session, isRecentlyFocused: true },
              },
            };
          });

          clearFocusHoldTimeout(id);
          focusHoldTimeouts.set(
            id,
            setTimeout(() => {
              focusHoldTimeouts.delete(id);
              useTerminalStore.getState().setRecentlyFocused(id, false);
            }, FOCUS_HOLD_MS)
          );
          return;
        }

        set({ activeTerminalId: null });
      },

      setPossiblyDone: (id, isPossiblyDone) =>
        set((state) => {
          const session = state.sessions[id];
          if (!session || session.isPossiblyDone === isPossiblyDone) return state;
          return {
            sessions: {
              ...state.sessions,
              [id]: { ...session, isPossiblyDone },
            },
          };
        }),

      setLongInactive: (id, isLongInactive) =>
        set((state) => {
          const session = state.sessions[id];
          if (!session || session.isLongInactive === isLongInactive) return state;
          return {
            sessions: {
              ...state.sessions,
              [id]: { ...session, isLongInactive },
            },
          };
        }),

      setRecentlyFocused: (id, isRecentlyFocused) =>
        set((state) => {
          const session = state.sessions[id];
          if (!session || session.isRecentlyFocused === isRecentlyFocused) return state;
          return {
            sessions: {
              ...state.sessions,
              [id]: { ...session, isRecentlyFocused },
            },
          };
        }),

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

      updateCwd: (id, cwd) =>
        set((state) => {
          const session = state.sessions[id];
          if (!session) return state;
          return {
            sessions: { ...state.sessions, [id]: { ...session, cwd } },
          };
        }),
    }),
    {
      name: "dispatcher-terminals",
      partialize: (state) => ({
        sessions: state.sessions,
        activeTerminalId: state.activeTerminalId,
      }),
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<TerminalStore>) };
        const updated: Record<string, TerminalSession> = {};
        for (const [id, session] of Object.entries(merged.sessions)) {
          updated[id] = {
            ...session,
            notes: session.notes ?? "",
            isPossiblyDone: false,
            isLongInactive: false,
            isRecentlyFocused: false,
          };
        }
        return { ...merged, sessions: updated };
      },
    }
  )
);
