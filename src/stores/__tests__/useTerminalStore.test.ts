import { describe, it, expect } from "vitest";
import { useTerminalStore } from "../useTerminalStore";

describe("useTerminalStore", () => {
  describe("addSession", () => {
    it("creates with correct defaults", () => {
      useTerminalStore.getState().addSession("t1", "My Term");
      const session = useTerminalStore.getState().sessions["t1"];
      expect(session.status).toBe("done");
      expect(session.notes).toBe("");
      expect(session.exitCode).toBeNull();
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

  describe("updateStatus", () => {
    it("running → done with exit code 0", () => {
      useTerminalStore.getState().addSession("t1");
      useTerminalStore.getState().updateStatus("t1", "running");
      expect(useTerminalStore.getState().sessions["t1"].status).toBe("running");
      useTerminalStore.getState().updateStatus("t1", "done", 0);
      const session = useTerminalStore.getState().sessions["t1"];
      expect(session.status).toBe("done");
      expect(session.exitCode).toBe(0);
    });

    it("running → error with exit code 1", () => {
      useTerminalStore.getState().addSession("t1");
      useTerminalStore.getState().updateStatus("t1", "running");
      useTerminalStore.getState().updateStatus("t1", "error", 1);
      const session = useTerminalStore.getState().sessions["t1"];
      expect(session.status).toBe("error");
      expect(session.exitCode).toBe(1);
    });

    it("on nonexistent session → no-op", () => {
      // Should not throw
      useTerminalStore.getState().updateStatus("nonexistent", "running");
      expect(useTerminalStore.getState().sessions["nonexistent"]).toBeUndefined();
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
    it("resets all sessions to done", () => {
      const { merge } = (useTerminalStore as any).persist.getOptions();
      const persisted = {
        sessions: {
          t1: { id: "t1", title: "T1", notes: "", status: "running", exitCode: null },
          t2: { id: "t2", title: "T2", notes: "", status: "error", exitCode: 1 },
        },
        activeTerminalId: "t1",
      };
      const result = merge(persisted, { sessions: {}, activeTerminalId: null });
      expect(result.sessions["t1"].status).toBe("done");
      expect(result.sessions["t1"].exitCode).toBeNull();
      expect(result.sessions["t2"].status).toBe("done");
      expect(result.sessions["t2"].exitCode).toBeNull();
    });
  });
});
