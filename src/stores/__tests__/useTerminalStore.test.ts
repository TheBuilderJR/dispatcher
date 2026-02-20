import { describe, it, expect } from "vitest";
import { useTerminalStore } from "../useTerminalStore";

describe("useTerminalStore", () => {
  describe("addSession", () => {
    it("creates with correct defaults", () => {
      useTerminalStore.getState().addSession("t1", "My Term");
      const session = useTerminalStore.getState().sessions["t1"];
      expect(session.notes).toBe("");
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

  describe("persist merge", () => {
    it("preserves notes across sessions", () => {
      const { merge } = (useTerminalStore as any).persist.getOptions();
      const persisted = {
        sessions: {
          t1: { id: "t1", title: "T1", notes: "hello" },
          t2: { id: "t2", title: "T2", notes: "" },
        },
        activeTerminalId: "t1",
      };
      const result = merge(persisted, { sessions: {}, activeTerminalId: null });
      expect(result.sessions["t1"].notes).toBe("hello");
      expect(result.sessions["t2"].notes).toBe("");
    });
  });
});
