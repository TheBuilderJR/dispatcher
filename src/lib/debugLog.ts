import { appendDebugLog } from "./tauriCommands";

let pendingLines: string[] = [];
let flushTimer: number | null = null;
let pendingChars = 0;
const MAX_PENDING_CHARS = 2048;

function flushPendingLines() {
  if (pendingLines.length === 0) {
    return;
  }

  if (flushTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(flushTimer);
    flushTimer = null;
  }

  const payload = pendingLines.join("");
  pendingLines = [];
  pendingChars = 0;
  void appendDebugLog(payload).catch(() => {});
}

function scheduleFlush() {
  if (typeof window === "undefined") {
    flushPendingLines();
    return;
  }

  if (pendingChars >= MAX_PENDING_CHARS) {
    flushPendingLines();
    return;
  }

  if (flushTimer !== null) {
    return;
  }

  flushTimer = window.setTimeout(() => {
    flushPendingLines();
  }, 50);
}

function summarizeValue(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function previewDebugText(value: string, limit: number = 160): string {
  let preview = "";
  let count = 0;

  for (const char of value) {
    if (count >= limit) {
      preview += "…";
      break;
    }

    if (char === "\n") {
      preview += "\\n";
    } else if (char === "\r") {
      preview += "\\r";
    } else if (char === "\t") {
      preview += "\\t";
    } else if (char === "\u001b") {
      preview += "\\x1b";
    } else if (/[\x00-\x1f\x7f]/.test(char)) {
      preview += `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`;
    } else {
      preview += char;
    }

    count += 1;
  }

  return preview;
}

export function debugLog(scope: string, message: string, details?: unknown) {
  const suffix = details === undefined ? "" : ` ${summarizeValue(details)}`;
  const line = `${new Date().toISOString()} [${scope}] ${message}${suffix}\n`;
  pendingLines.push(line);
  pendingChars += line.length;
  scheduleFlush();
}

export function debugLogError(scope: string, message: string, error: unknown) {
  debugLog(scope, message, {
    error: error instanceof Error ? error.message : summarizeValue(error),
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    flushPendingLines();
  });
}
