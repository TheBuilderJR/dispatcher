import { useEffect } from "react";
import {
  hasLiveAppState,
  parseAppStateSnapshot,
  restoreAppStateSnapshot,
} from "../lib/appStateSnapshot";
import { debugLog } from "../lib/debugLog";

const RECOVERY_PATH = "/@fs/tmp/dispatcher-recovery.json";

let recoveryAttempted = false;

export function useRecoveryBootstrap() {
  useEffect(() => {
    if (!import.meta.env.DEV || recoveryAttempted || hasLiveAppState()) {
      return;
    }

    recoveryAttempted = true;

    void (async () => {
      try {
        const response = await fetch(`${RECOVERY_PATH}?t=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) {
          debugLog("app.recovery", "no recovery file", {
            status: response.status,
          });
          return;
        }

        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          debugLog("app.recovery", "no recovery file", {
            status: response.status,
            contentType,
          });
          return;
        }

        const raw = await response.text();
        const recovery = parseAppStateSnapshot(raw);
        if (hasLiveAppState()) {
          return;
        }

        if (!recovery) {
          debugLog("app.recovery", "invalid recovery file", {
            reason: "json parse failed",
          });
          return;
        }

        const result = restoreAppStateSnapshot(recovery, "dev-recovery-file");
        debugLog("app.recovery", result.restored ? "restored from recovery file" : "recovery file not restored", result);
      } catch (error) {
        debugLog("app.recovery", "failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, []);
}
