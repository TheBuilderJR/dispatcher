export interface KeyDebugEntry {
  id: number;
  generation: number;
  timestamp: string;
  timestampMs: number;
  source: string;
  detail: string;
}

const KEY_DEBUG_EVENT = "dispatcher:key-debug";
const MAX_KEY_DEBUG_ENTRIES = 60;

let nextId = 1;
let generation = 1;
const entries: KeyDebugEntry[] = [];

function stringify(detail: unknown): string {
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export function pushKeyDebug(source: string, detail: unknown): void {
  const now = new Date();
  entries.push({
    id: nextId++,
    generation,
    timestamp: now.toLocaleTimeString(),
    timestampMs: now.getTime(),
    source,
    detail: stringify(detail),
  });

  if (entries.length > MAX_KEY_DEBUG_ENTRIES) {
    entries.shift();
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(KEY_DEBUG_EVENT));
  }
}

export function clearKeyDebugEntries(): number {
  entries.length = 0;
  generation += 1;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(KEY_DEBUG_EVENT));
  }
  return generation;
}

export function getCurrentKeyDebugGeneration(): number {
  return generation;
}

export function getKeyDebugEntries(): KeyDebugEntry[] {
  return [...entries];
}

export function subscribeKeyDebug(listener: (next: KeyDebugEntry[]) => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const onEvent = () => listener(getKeyDebugEntries());
  window.addEventListener(KEY_DEBUG_EVENT, onEvent as EventListener);
  return () => window.removeEventListener(KEY_DEBUG_EVENT, onEvent as EventListener);
}

export function describeKeyboardEvent(
  event: Pick<KeyboardEvent, "key" | "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "repeat" | "defaultPrevented" | "target">
): Record<string, unknown> {
  const target = event.target instanceof Element
    ? { tag: event.target.tagName, classes: event.target.className }
    : String(event.target);

  return {
    key: event.key,
    code: event.code,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    repeat: event.repeat,
    defaultPrevented: event.defaultPrevented,
    target,
  };
}

export function describeTerminalData(data: string): { text: string; bytes: string[] } {
  return {
    text: JSON.stringify(data),
    bytes: Array.from(data).map((char) => `0x${char.charCodeAt(0).toString(16).padStart(2, "0")}`),
  };
}

export function describeInputLikeEvent(event: Event): Record<string, unknown> {
  const maybeInput = event as InputEvent;
  const target = event.target instanceof Element
    ? { tag: event.target.tagName, classes: event.target.className }
    : String(event.target);

  return {
    type: event.type,
    data: "data" in maybeInput ? maybeInput.data : null,
    inputType: "inputType" in maybeInput ? maybeInput.inputType : null,
    isComposing: "isComposing" in maybeInput ? maybeInput.isComposing : null,
    target,
  };
}
