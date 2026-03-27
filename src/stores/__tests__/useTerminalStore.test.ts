import { describe, it, expect } from "vitest";
import { useTerminalStore } from "../useTerminalStore";

describe("useTerminalStore", () => {
  describe("addSession", () => {
    it("creates with correct defaults", () => {
      useTerminalStore.getState().addSession("t1", "My Term");
      const session = useTerminalStore.getState().sessions["t1"];
      expect(session.notes).toBe("");
      expect(session.isPossiblyDone).toBe(false);
      expect(session.isRecentlyFocused).toBe(false);
      expect(session.title).toBe("My Term");
    });

    it("auto-generates title when none provided", () => {
      useTerminalStore.getState().addSession("t1");
      const session = useTerminalStore.getState().sessions["t1"];
      expect(session.title).toMatch(/^Terminal \d+$/);
    });

    it("sets activeTerminalId", () => {
      useTerminalStore.getState().addSession("t1", "First");
      useTerminalStore.getState().addSession("t2", "Second");
      expect(useTerminalStore.getState().activeTerminalId).toBe("t2");
    });

    it("keeps possibly-done state when activating a terminal", () => {
      useTerminalStore.getState().addSession("t1", "First");
      useTerminalStore.getState().setPossiblyDone("t1", true);
      useTerminalStore.getState().setActiveTerminal("t1");
      expect(useTerminalStore.getState().sessions["t1"].isPossiblyDone).toBe(true);
      expect(useTerminalStore.getState().sessions["t1"].isRecentlyFocused).toBe(true);
    });
  });

  describe("removeSession", () => {
    it("falls back activeTerminalId", () => {
      useTerminalStore.getState().addSession("t1", "First");
      useTerminalStore.getState().addSession("t2", "Second");
      // t2 is active
      useTerminalStore.getState().removeSession("t2");
      expect(useTerminalStore.getState().activeTerminalId).toBe("t1");
    });

    it("of non-active preserves activeTerminalId", () => {
      useTerminalStore.getState().addSession("t1", "First");
      useTerminalStore.getState().addSession("t2", "Second");
      // t2 is active; remove t1
      useTerminalStore.getState().removeSession("t1");
      expect(useTerminalStore.getState().activeTerminalId).toBe("t2");
    });
  });

  describe("updateCwd", () => {
    it("updates cwd for an existing session", () => {
      useTerminalStore.getState().addSession("t1", "First");
      useTerminalStore.getState().updateCwd("t1", "/tmp/project");
      expect(useTerminalStore.getState().sessions["t1"].cwd).toBe("/tmp/project");
    });
  });

  describe("setPossiblyDone", () => {
    it("updates screenshot-derived terminal state", () => {
      useTerminalStore.getState().addSession("t1", "First");
      useTerminalStore.getState().setPossiblyDone("t1", true);
      expect(useTerminalStore.getState().sessions["t1"].isPossiblyDone).toBe(true);
    });
  });

  describe("persist merge", () => {
    it("preserves notes and resets runtime screenshot state", () => {
      const { merge } = (useTerminalStore as any).persist.getOptions();
      const persisted = {
        sessions: {
          t1: { id: "t1", title: "T1", notes: "hello", isPossiblyDone: true, isRecentlyFocused: true },
          t2: { id: "t2", title: "T2", notes: "", isPossiblyDone: true, isRecentlyFocused: true },
        },
        activeTerminalId: "t1",
      };
      const result = merge(persisted, { sessions: {}, activeTerminalId: null });
      expect(result.sessions["t1"].notes).toBe("hello");
      expect(result.sessions["t2"].notes).toBe("");
      expect(result.sessions["t1"].isPossiblyDone).toBe(false);
      expect(result.sessions["t2"].isPossiblyDone).toBe(false);
      expect(result.sessions["t1"].isRecentlyFocused).toBe(false);
      expect(result.sessions["t2"].isRecentlyFocused).toBe(false);
    });
  });
});
