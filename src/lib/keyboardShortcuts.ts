export function isPlainCtrlLetterShortcut(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "key">): boolean {
  return event.ctrlKey && !event.metaKey && !event.altKey && /^[a-z]$/i.test(event.key);
}

export function isEventInsideTerminal(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".terminal-pane") !== null;
}

export function shouldBypassAppShortcutsForTerminal(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "key" | "target">): boolean {
  return isPlainCtrlLetterShortcut(event) && isEventInsideTerminal(event.target);
}
